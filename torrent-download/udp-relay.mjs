import { randomBytes, randomInt } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { resolve4 } from 'node:dns/promises';
import { createServer } from 'node:http';
import { isIPv4 } from 'node:net';
import { fileURLToPath } from 'node:url';
import { decode, publicIp } from './torrent.js';

const maxPacket = 1200;
const maxPeers = 40;
const maxPacketsPerCall = 18;
const maxPacketsPerMinute = 240;
const nodes = ['router.bittorrent.com', 'router.utorrent.com', 'dht.transmissionbt.com'];
const events = new Map([[undefined, 0], ['completed', 1], ['started', 2], ['stopped', 3]]);

function deadline(promise, millis) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('UDP 查询超时')), millis); }),
  ]).finally(() => clearTimeout(timer));
}

async function ipv4(host) {
  const addresses = isIPv4(host) ? [host] : await deadline(resolve4(host), 2500);
  const address = addresses.find(ip => isIPv4(ip) && publicIp(ip));
  if (!address) throw new Error('UDP 目标没有公网 IPv4 地址');
  return address;
}

function udpSession() {
  const socket = createSocket('udp4');
  const pending = new Set();
  socket.on('error', error => {
    for (const callback of pending) callback(error);
  });
  return {
    send(address, port, packet, accept) {
      if (!isIPv4(address) || !publicIp(address) || packet.length > maxPacket) {
        throw new Error('UDP 数据包目标或长度无效');
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('UDP 查询超时')), 1800);
        const onMessage = (data, remote) => {
          if (remote.address === address && remote.port === port &&
              data.length <= maxPacket && accept(data)) finish(null, data);
        };
        function finish(error, data) {
          if (!pending.delete(finish)) return;
          clearTimeout(timer);
          socket.off('message', onMessage);
          if (error) reject(error);
          else resolve(data);
        }
        pending.add(finish);
        socket.on('message', onMessage);
        socket.send(packet, port, address, error => {
          if (error) finish(error);
        });
      });
    },
    close() {
      for (const callback of pending) callback(new Error('UDP 会话已关闭'));
      try { socket.close(); } catch {}
    },
  };
}

function compactPeer(data, offset = 0) {
  const hostname = [...data.subarray(offset, offset + 4)].join('.');
  const port = data.readUInt16BE(offset + 4);
  return port > 0 && port !== 25 && publicIp(hostname) ? { hostname, port } : null;
}

export async function trackerPeers(input, send, lookup = ipv4) {
  const url = new URL(input.tracker);
  const port = Number(url.port);
  const path = Buffer.from(url.pathname + url.search);
  const infoHash = Buffer.from(input.infoHash, 'hex');
  if (url.protocol !== 'udp:' || url.username || url.password || !port || port === 25 ||
      path.length > 192 || typeof input.peerId !== 'string' || !/^[0-9a-f]{40}$/i.test(input.peerId) ||
      typeof input.key !== 'string' || !/^[0-9a-f]{8}$/i.test(input.key) ||
      !events.has(input.event) || !Number.isSafeInteger(input.downloaded) || input.downloaded < 0 ||
      !Number.isSafeInteger(input.left) || input.left < 0) {
    throw new Error('UDP tracker 参数无效');
  }
  const address = await lookup(url.hostname);
  const packet = Buffer.alloc(16);
  packet.writeBigUInt64BE(0x41727101980n);
  const handshakeId = randomInt(0x100000000);
  packet.writeUInt32BE(handshakeId, 12);
  const check = (data, id) => data.length >= 8 && data.readUInt32BE(4) === id;
  const reply = await send(address, port, packet, data => check(data, handshakeId));
  if (reply.length < 16 || reply.readUInt32BE(0) !== 0) throw new Error('UDP tracker 握手未通过');

  // BEP 15 announce with optional BEP 41 URLData for trackers that use a URL path.
  const options = path.length && path.toString() !== '/announce' && path.toString() !== '/'
    ? Buffer.concat([Buffer.from([2, path.length]), path, Buffer.from([0])])
    : Buffer.alloc(0);
  const query = Buffer.alloc(98 + options.length);
  reply.copy(query, 0, 8, 16);
  query.writeUInt32BE(1, 8);
  const announceId = randomInt(0x100000000);
  query.writeUInt32BE(announceId, 12);
  infoHash.copy(query, 16);
  Buffer.from(input.peerId, 'hex').copy(query, 36);
  query.writeBigUInt64BE(BigInt(input.downloaded), 56);
  query.writeBigUInt64BE(BigInt(input.left), 64);
  query.writeUInt32BE(events.get(input.event), 80);
  query.writeUInt32BE(Number.parseInt(input.key, 16), 88);
  query.writeInt32BE(input.event === 'stopped' ? 0 : maxPeers, 92);
  query.writeUInt16BE(51413, 96);
  options.copy(query, 98);

  const result = await send(address, port, query, data => check(data, announceId));
  if (result.length < 20 || result.readUInt32BE(0) !== 1) throw new Error('UDP tracker 未返回节点');
  const peers = [];
  for (let offset = 20; offset + 6 <= result.length && peers.length < maxPeers; offset += 6) {
    const peer = compactPeer(result, offset);
    if (peer) peers.push(peer);
  }
  return { peers, interval: Math.max(60, Math.min(result.readUInt32BE(8), 3600)) };
}

export async function dhtPeers(infoHash, send, lookup = ipv4) {
  const target = Buffer.from(infoHash, 'hex');
  const id = randomBytes(20);
  const initial = await Promise.allSettled(nodes.map(lookup));
  const queue = initial.filter(node => node.status === 'fulfilled')
    .map(node => ({ hostname: node.value, port: 6881, id: Buffer.alloc(20) }));
  const peers = new Map();
  const visited = new Set();

  for (let wave = 0; wave < 4 && queue.length && peers.size < maxPeers; wave++) {
    queue.sort((a, b) => compareDistance(a.id, b.id, target));
    const batch = queue.splice(0, 4);
    const results = await Promise.allSettled(batch.map(async node => {
      const key = node.hostname + ':' + node.port;
      if (visited.has(key)) return null;
      visited.add(key);
      const tx = randomBytes(4);
      const packet = Buffer.concat([
        Buffer.from('d1:ad2:id20:'), id, Buffer.from('9:info_hash20:'), target,
        Buffer.from('e1:q9:get_peers1:t4:'), tx, Buffer.from('1:y1:qe'),
      ]);
      const response = await send(node.hostname, node.port, packet, data => {
        try {
          const decoded = decode(data).decoded;
          return Buffer.from(decoded?.t ?? []).equals(tx) && Buffer.from(decoded?.y ?? []).toString() === 'r';
        } catch {
          return false;
        }
      });
      return decode(response).decoded.r;
    }));
    for (const item of results) {
      if (item.status !== 'fulfilled' || !item.value) continue;
      const reply = item.value;
      for (const row of Array.isArray(reply.values) ? reply.values : []) {
        if (!Buffer.isBuffer(row) || row.length !== 6) continue;
        const peer = compactPeer(row);
        if (peer) peers.set(peer.hostname + ':' + peer.port, peer);
      }
      if (!Buffer.isBuffer(reply.nodes)) continue;
      for (let i = 0; i + 26 <= reply.nodes.length && queue.length < 96; i += 26) {
        const peer = compactPeer(reply.nodes, i + 20);
        if (peer && !visited.has(peer.hostname + ':' + peer.port)) {
          queue.push({ ...peer, id: reply.nodes.subarray(i, i + 20) });
        }
      }
    }
  }
  return { peers: [...peers.values()].slice(0, maxPeers), interval: 300 };
}

function compareDistance(a, b, target) {
  for (let i = 0; i < 20; i++) {
    const diff = (a[i] ^ target[i]) - (b[i] ^ target[i]);
    if (diff) return diff;
  }
  return 0;
}

export function createRelay(sendPacket, lookup = ipv4) {
  let active = 0;
  let recentPackets = 0;
  let windowStart = Date.now();
  return createServer({ requestTimeout: 12000, headersTimeout: 4000 }, async (req, res) => {
    const respond = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    if (req.method === 'GET' && req.url === '/health') return respond(200, { ok: true });
    if (req.method !== 'POST' || !['/tracker', '/dht'].includes(req.url)) return respond(404, { error: 'Unknown operation' });
    if (active >= 4) return respond(429, { error: 'UDP discovery busy' });
    active++;
    const session = sendPacket ? null : udpSession();
    const usage = { packets: 0, sent: 0, received: 0 };
    const send = async (address, port, packet, accept) => {
      if (Date.now() - windowStart >= 60000) {
        windowStart = Date.now();
        recentPackets = 0;
      }
      if (usage.packets >= maxPacketsPerCall || recentPackets >= maxPacketsPerMinute ||
          packet.length > maxPacket) throw new Error('UDP 查询达到流量限制');
      usage.packets++;
      recentPackets++;
      usage.sent += packet.length;
      const response = await (sendPacket ?? session.send)(address, port, packet, accept);
      usage.received += response.length;
      return response;
    };
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) {
          respond(413, { error: 'UDP 控制消息过长' });
          return;
        }
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
      if (typeof input.infoHash !== 'string' || !/^[0-9a-f]{40}$/i.test(input.infoHash)) {
        throw new Error('info hash 无效');
      }
      const result = req.url === '/tracker'
        ? await trackerPeers(input, send, lookup)
        : await dhtPeers(input.infoHash, send, lookup);
      respond(200, { ...result, usage });
    } catch (error) {
      respond(502, { error: error.message });
    } finally {
      session?.close();
      active--;
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createRelay().listen(8080, '0.0.0.0');
}
