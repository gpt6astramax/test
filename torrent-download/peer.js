import { announce, publicIp, readBytes } from './torrent.js';

const protocol = new TextEncoder().encode('BitTorrent protocol');
const blockLength = 16 * 1024;
const batchLength = 48;
const openingLimit = 5;
const connectionLimit = 32;

export class TorrentTransfer {
  constructor(meta, connect, client, cache, udp) {
    this.meta = meta;
    this.connect = connect;
    this.client = client;
    this.cache = cache;
    this.udp = udp;
    this.peers = [];
    this.connections = new Map();
    this.dials = new Map();
    this.inUse = new Set();
    this.cooldowns = new Map();
    this.waiters = new Set();
    this.stats = { tcp: 0, handshakes: 0, ready: 0 };
    this.downloaded = 0;
    this.reported = 0;
    this.announced = 0;
    this.nextAnnounce = 0;
  }

  async start(deadline) {
    this.startedAt = Date.now();
    await this.refresh(deadline);
    this.started = true;
    if (!this.peers.length) throw new Error('Tracker 暂无可用的 TCP 节点。');
    if (Date.now() >= deadline) throw new Error('等待 Tracker 返回节点超时。');
  }

  async cachedSession() {
    try {
      return await (await this.cache?.match(this.client.cacheKey))?.json();
    } catch {
      return undefined;
    }
  }

  useSession(session) {
    this.peers = session.peers;
    this.tracker = session.tracker ?? this.tracker;
    this.nextAnnounce = session.nextAnnounce;
    this.announced = Math.max(this.announced, session.downloaded);
  }

  async refresh(deadline) {
    const current = await this.cachedSession();
    if (current?.peers.length && current.nextAnnounce > Date.now()) {
      this.useSession(current);
      return;
    }
    try {
      await this.updateTracker(current, current || this.started ? undefined : 'started', deadline);
    } catch (error) {
      const fallback = await this.cachedSession();
      if (!fallback?.peers.length) throw error;
      this.useSession(fallback);
      this.nextAnnounce = Math.max(this.nextAnnounce, Date.now() + 60000);
    }
  }

  async updateTracker(previous, event, deadline = Date.now() + 40000) {
    const { downloaded, left } = this.progress(previous);
    const tracker = this.tracker ?? previous?.tracker;
    const reply = await this.lookup(tracker, event, downloaded, left, deadline);
    this.announcedHere ||= Boolean(reply.tracker && reply.tracker !== 'dht');
    const session = {
      peers: reply.peers.length ? reply.peers : this.peers,
      tracker: reply.tracker,
      nextAnnounce: Date.now() + reply.interval * 1000,
      downloaded,
      left,
    };
    this.reported = this.downloaded;
    this.useSession(session);
    try {
      await this.cache?.put(this.client.cacheKey, Response.json(session, {
        headers: { 'Cache-Control': 'max-age=600' },
      }));
    } catch {
      // This request can still use the peers the tracker returned.
    }
  }

  async lookup(tracker, event, downloaded, left, deadline) {
    if (tracker === 'dht') return this.udpLookup('dht', {}, deadline);
    const udpAnnounce = target => this.udpLookup(
      'tracker', { tracker: target, event, downloaded, left }, deadline,
    );
    if (tracker?.startsWith('udp:')) return udpAnnounce(tracker);
    let response;
    let failure;
    try {
      response = await announce(this.meta, this.client, event, downloaded, left, tracker);
      if (response.peers.length || tracker || !this.udp) return response;
    } catch (error) {
      failure = error;
      if (tracker || !this.udp || this.meta.pttime) throw error;
    }
    const udpTrackers = [...this.meta.udpTrackers].sort((a, b) =>
      Number(b.startsWith('udp://tracker.opentrackr.org:')) -
      Number(a.startsWith('udp://tracker.opentrackr.org:')));
    for (const target of udpTrackers.slice(0, 2)) {
      try {
        const reply = await udpAnnounce(target);
        if (reply.peers.length) return reply;
        response ??= reply;
      } catch (error) {
        failure ??= error;
      }
    }
    if (!this.meta.private && Date.now() < deadline) {
      try {
        return await this.udpLookup('dht', {}, deadline);
      } catch (error) {
        failure ??= error;
      }
    }
    if (response) return response;
    throw failure ?? new Error('Tracker 暂无可用的 TCP 节点。');
  }

  async udpLookup(method, options, deadline) {
    if (!this.udp || Date.now() >= deadline) throw new Error('UDP 节点查询超时。');
    const hex = value => Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
    const response = await this.udp.fetch('http://udp/' + method, {
      method: 'POST',
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        infoHash: hex(this.meta.infoHash),
        peerId: hex(this.client.peerId),
        key: this.client.trackerKey,
        ...options,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('UDP 节点查询失败（HTTP ' + response.status + '）。');
    }
    const json = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 8192)));
    const peers = json.peers.filter(peer =>
      publicIp(peer.hostname) && Number.isInteger(peer.port) && peer.port > 0 &&
      peer.port <= 65535 && peer.port !== 25).slice(0, 40);
    return { tracker: options.tracker ?? 'dht', peers, interval: json.interval };
  }

  progress(previous) {
    return {
      downloaded: Math.max(previous?.downloaded ?? 0, this.announced) +
        this.downloaded - this.reported,
      left: Math.min(previous?.left ?? this.meta.size, this.meta.size - this.downloaded),
    };
  }

  async piece(index, deadline = Date.now() + 90000) {
    if (this.closed) throw new Error('BT 传输已关闭。');
    if (Date.now() >= this.nextAnnounce) {
      this.nextAnnounce = Date.now() + 60000;
      await this.refresh().catch(() => {});
    }
    const tried = new Set();
    while (!this.closed && Date.now() < deadline) {
      const peer = await this.acquire(index, tried, deadline);
      if (!peer) break;
      tried.add(peer.key);
      try {
        await withTimeout(peer.waitForPiece(index), Math.max(1, Math.min(8500, deadline - Date.now())));
        const remaining = Math.max(1, deadline - Date.now());
        const pieceTime = Math.max(12000, Math.min(90000, this.meta.pieceLength / 200));
        const data = await withTimeout(peer.readPiece(index), Math.min(pieceTime, remaining));
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
        const expected = this.meta.hashes.subarray(index * 20, index * 20 + 20);
        if (!equal(hash, expected)) throw new Error('BT piece hash mismatch');
        this.downloaded += data.length;
        return data;
      } catch {
        if (peer.canServe(index)) {
          this.connections.delete(peer.key);
          this.cooldowns.set(peer.key, Date.now() + 15000);
          peer.close();
        }
      } finally {
        this.inUse.delete(peer);
        this.notify();
      }
    }
    throw new Error('本次未取到校验通过的 BT 分片（tracker 节点 ' +
      this.peers.length + '，TCP 连通 ' + this.stats.tcp + '，握手成功 ' +
      this.stats.handshakes + '，可请求 ' + this.stats.ready + '）。');
  }

  async acquire(index, tried, deadline) {
    while (!this.closed && Date.now() < deadline) {
      const now = Date.now();
      if (this.udp && !this.meta.private && !this.meta.pttime && !this.extraLookup &&
          this.tracker !== 'dht' && this.stats.ready < 2 && now - this.startedAt >= 8000) {
        this.searchingDht = true;
        this.extraLookup = this.udpLookup('dht', {}, deadline).then(reply => {
          const addresses = new Map(this.peers.map(peer => [addressKey(peer), peer]));
          for (const peer of reply.peers) addresses.set(addressKey(peer), peer);
          this.peers = [...addresses.values()];
        }).catch(() => {}).finally(() => {
          this.searchingDht = false;
          this.notify();
        });
      }
      const idle = [...this.connections.values()].find(
        peer => !this.inUse.has(peer) && !tried.has(peer.key) && peer.canServe(index),
      );
      if (idle) {
        this.inUse.add(idle);
        return idle;
      }

      const candidate = this.peers.find(address => {
        const key = addressKey(address);
        return !tried.has(key) && !this.connections.has(key) && !this.dials.has(key) &&
          (this.cooldowns.get(key) ?? 0) <= now;
      });
      if (candidate && this.dials.size < openingLimit) {
        if (this.connections.size + this.dials.size >= connectionLimit) {
          const unsuitable = [...this.connections.values()].find(peer => !this.inUse.has(peer));
          if (unsuitable) {
            this.connections.delete(unsuitable.key);
            unsuitable.close();
            continue;
          }
        } else {
          const peer = await this.dial(candidate, deadline);
          if (peer) return peer;
          tried.add(addressKey(candidate));
          continue;
        }
      }

      const canWait = this.searchingDht || this.dials.size > 0 || [...this.inUse].some(
        peer => !tried.has(peer.key) && peer.canServe(index),
      );
      if (!canWait) return null;
      await this.waitForPeer(deadline);
    }
    return null;
  }

  async dial(address, deadline) {
    const key = addressKey(address);
    let peer;
    try {
      peer = new Peer(address, this.meta, this.client.peerId, this.connect, this.stats);
      this.dials.set(key, peer);
      await withTimeout(peer.open(), Math.max(1, Math.min(10000, deadline - Date.now())));
      if (this.closed) throw new Error('BT 传输已关闭。');
      this.connections.set(key, peer);
      this.inUse.add(peer);
      return peer;
    } catch {
      this.cooldowns.set(key, Date.now() + 30000);
      peer?.close();
      return null;
    } finally {
      this.dials.delete(key);
      this.notify();
    }
  }

  waitForPeer(deadline) {
    return new Promise(resolve => {
      const wake = () => {
        this.waiters.delete(wake);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(wake, Math.max(1, deadline - Date.now()));
      this.waiters.add(wake);
    });
  }

  notify() {
    for (const wake of this.waiters) wake();
  }

  async finish(result) {
    if (this.closed) return;
    this.closed = true;
    for (const peer of this.connections.values()) peer.close();
    for (const peer of this.dials.values()) peer.close();
    this.notify();

    const completed = result === 'complete' && this.downloaded === this.meta.size;
    if ((!this.announcedHere || (result === 'range' && this.cache)) && !completed) return;

    const previous = await this.cachedSession();
    if (completed) await this.updateTracker(previous, 'completed').catch(() => {});
    const { downloaded, left } = this.progress(previous);
    try {
      if (this.tracker !== 'dht') {
        await this.lookup(this.tracker, 'stopped', downloaded, left, Date.now() + 12000);
      }
      await this.cache?.delete(this.client.cacheKey).catch(() => {});
    } catch {
      // Keep the last accepted tracker state available for a retry.
    }
  }
}

function addressKey(address) {
  return address.hostname + '/' + address.port;
}

class Peer {
  constructor(address, meta, peerId, connect, stats) {
    this.key = addressKey(address);
    this.meta = meta;
    this.peerId = peerId;
    this.stats = stats;
    this.choked = true;
    this.socket = connect(address);
    this.socket.closed.catch(() => {});
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
    this.chunk = new Uint8Array(0);
    this.offset = 0;
  }

  async open() {
    await this.socket.opened;
    this.stats.tcp++;
    const handshake = new Uint8Array(68);
    handshake[0] = protocol.length;
    handshake.set(protocol, 1);
    handshake.set(this.meta.infoHash, 28);
    handshake.set(this.peerId, 48);
    await this.writer.write(handshake);
    const reply = await this.take(68);
    if (reply[0] !== protocol.length || !equal(reply.subarray(1, 20), protocol) ||
        !equal(reply.subarray(28, 48), this.meta.infoHash) ||
        equal(reply.subarray(48), this.peerId)) throw new Error('Invalid BT handshake');
    this.stats.handshakes++;
    await this.writer.write(Uint8Array.of(0, 0, 0, 1, 2));
  }

  async readPiece(index) {
    const length = Math.min(this.meta.pieceLength, this.meta.size - index * this.meta.pieceLength);
    const data = new Uint8Array(length);
    for (let batch = 0; batch < length; batch += blockLength * batchLength) {
      const end = Math.min(length, batch + blockLength * batchLength);
      const count = Math.ceil((end - batch) / blockLength);
      const requests = new Uint8Array(17 * count);
      const view = new DataView(requests.buffer);
      const received = new Uint8Array(count);
      for (let slot = 0; slot < count; slot++) {
        const offset = slot * 17;
        const begin = batch + slot * blockLength;
        view.setUint32(offset, 13);
        requests[offset + 4] = 6;
        view.setUint32(offset + 5, index);
        view.setUint32(offset + 9, begin);
        view.setUint32(offset + 13, Math.min(blockLength, length - begin));
      }
      await this.writer.write(requests);
      let remaining = count;
      while (remaining > 0) {
        const message = await this.message();
        if (message[0] !== 7) {
          this.note(message);
          if (this.choked || message[0] === 16) throw new Error('Peer declined BT requests');
          continue;
        }
        if (message.length < 9) throw new Error('Invalid BT piece frame');
        const header = new DataView(message.buffer, message.byteOffset, message.byteLength);
        const begin = header.getUint32(5);
        const slot = (begin - batch) / blockLength;
        if (header.getUint32(1) !== index || !Number.isInteger(slot) ||
            slot < 0 || slot >= count || received[slot]) continue;
        if (message.length !== 9 + Math.min(blockLength, length - begin)) {
          throw new Error('Unexpected BT block length');
        }
        data.set(message.subarray(9), begin);
        received[slot] = 1;
        remaining--;
      }
    }
    return data;
  }

  async waitForPiece(index) {
    while (true) {
      if (!this.canServe(index)) {
        throw new Error('Peer has not downloaded this piece');
      }
      if (!this.choked) {
        if (!this.ready) this.stats.ready++;
        this.ready = true;
        return;
      }
      this.note(await this.message());
    }
  }

  canServe(index) {
    return !this.available || Boolean(this.available[index >>> 3] & (0x80 >>> (index & 7)));
  }

  note(message) {
    const bitfieldSize = Math.ceil(this.meta.pieceCount / 8);
    switch (message[0]) {
      case 0:
        this.choked = true;
        break;
      case 1:
        this.choked = false;
        break;
      case 4: {
        if (message.length !== 5) break;
        const index = new DataView(message.buffer, message.byteOffset, 5).getUint32(1);
        if (index >= this.meta.pieceCount) break;
        this.available ??= new Uint8Array(bitfieldSize);
        this.available[index >>> 3] |= 0x80 >>> (index & 7);
        break;
      }
      case 5:
        if (message.length === bitfieldSize + 1) this.available = message.slice(1);
        break;
      case 14:
        this.available = null;
        break;
      case 15:
        this.available = new Uint8Array(bitfieldSize);
        break;
    }
  }

  async message() {
    const header = await this.take(4);
    const length = new DataView(header.buffer, header.byteOffset, 4).getUint32(0);
    if (length > Math.max(64 * 1024, Math.ceil(this.meta.pieceCount / 8) + 1)) {
      throw new Error('BT message too large');
    }
    return this.take(length);
  }

  async take(length) {
    if (this.offset === this.chunk.length && length > 0) await this.readChunk();
    if (this.chunk.length - this.offset >= length) {
      const result = this.chunk.subarray(this.offset, this.offset + length);
      this.offset += length;
      return result;
    }
    const result = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      if (this.offset === this.chunk.length) await this.readChunk();
      const count = Math.min(length - offset, this.chunk.length - this.offset);
      result.set(this.chunk.subarray(this.offset, this.offset + count), offset);
      offset += count;
      this.offset += count;
    }
    return result;
  }

  async readChunk() {
    const { value, done } = await this.reader.read();
    if (done) throw new Error('BT socket closed');
    this.chunk = value;
    this.offset = 0;
  }

  close() {
    this.socket.close().catch(() => {});
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('BT peer timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function equal(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
