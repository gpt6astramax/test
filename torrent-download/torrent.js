const text = new TextDecoder();
const bytes = new TextEncoder();
const trackerHosts = new Set(['www.pttime.fun', 'www.pttime.org']);
const limit = 4 * 1024 * 1024;

export async function readBytes(body, max) {
  if (!body) throw new Error('响应没有正文。');
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new Error('响应超过大小限制。');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (chunks.length === 1) return chunks[0];
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function decode(data) {
  let offset = 0;
  let encodedInfo;
  const bad = () => { throw new Error('无效的 BT 元数据。'); };

  function value(depth) {
    if (depth > 24 || offset >= data.length) bad();
    const type = data[offset++];
    if (type === 105) {
      const end = data.indexOf(101, offset);
      if (end < offset || end - offset > 17) bad();
      const number = text.decode(data.subarray(offset, end));
      if (!/^(?:0|-?[1-9]\d*)$/.test(number) || !Number.isSafeInteger(Number(number))) bad();
      offset = end + 1;
      return Number(number);
    }
    if (type === 100) {
      const dict = Object.create(null);
      while (data[offset] !== 101) {
        const key = value(depth + 1);
        if (!(key instanceof Uint8Array)) bad();
        const name = text.decode(key);
        if (name in dict) bad();
        const start = offset;
        dict[name] = value(depth + 1);
        if (depth === 0 && name === 'info') encodedInfo = data.subarray(start, offset);
      }
      offset++;
      return dict;
    }
    if (type === 108) {
      const list = [];
      while (data[offset] !== 101) list.push(value(depth + 1));
      offset++;
      return list;
    }
    const start = offset - 1;
    const colon = data.indexOf(58, start);
    if (colon < offset || colon - start > 9) bad();
    const length = text.decode(data.subarray(start, colon));
    if (!/^(?:0|[1-9]\d*)$/.test(length)) bad();
    offset = colon + 1 + Number(length);
    if (offset > data.length) bad();
    return data.subarray(colon + 1, offset);
  }

  const decoded = value(0);
  if (offset !== data.length) bad();
  return { decoded, encodedInfo };
}

export async function loadTorrent(source) {
  const response = await fetch(source, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/x-bittorrent, */*' },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error('PTTime 种子下载返回 HTTP ' + response.status + '。');
  }
  const { decoded, encodedInfo } = decode(await readBytes(response.body, limit));
  const info = decoded?.info;
  if (!encodedInfo || !info || !Number.isSafeInteger(info.length) || info.length <= 0 ||
      !Number.isSafeInteger(info['piece length']) || info['piece length'] <= 0 ||
      info['piece length'] > 16 * 1024 * 1024 || !(info.pieces instanceof Uint8Array) ||
      info.pieces.length !== 20 * Math.ceil(info.length / info['piece length']) ||
      !(info.name instanceof Uint8Array)) {
    throw new Error('此下载入口需要单文件 BitTorrent v1 种子。');
  }
  const announce = new URL(text.decode(decoded.announce));
  if (announce.protocol !== 'https:' || announce.port || announce.username || announce.password ||
      !trackerHosts.has(announce.hostname) || announce.pathname !== '/announce.php' ||
      !/^[a-f0-9]{32}$/i.test(announce.searchParams.get('passkey'))) {
    throw new Error('种子未提供受支持的 PTTime tracker。');
  }
  // Rebuild the tracker URL using only the known path and its own passkey.
  const tracker = announce.origin + announce.pathname + '?passkey=' + announce.searchParams.get('passkey');
  const filename = text.decode(info['name.utf-8'] ?? info.name).split(/[\\/]/).pop().trim();
  return {
    tracker,
    filename: filename || 'pttime-download',
    size: info.length,
    pieceLength: info['piece length'],
    pieceCount: info.pieces.length / 20,
    hashes: info.pieces,
    infoHash: new Uint8Array(await crypto.subtle.digest('SHA-1', encodedInfo)),
  };
}

export function clientIdentity() {
  const suffix = hex(crypto.getRandomValues(new Uint8Array(6)));
  return {
    peerId: bytes.encode('-TR4060-' + suffix),
    trackerKey: hex(crypto.getRandomValues(new Uint8Array(4))),
  };
}

export async function announce(meta, client, event, downloaded) {
  const params = new URLSearchParams({
    port: '51413',
    uploaded: '0',
    downloaded: String(downloaded),
    left: String(Math.max(0, meta.size - downloaded)),
    compact: '1',
    numwant: event === 'stopped' ? '0' : '40',
    key: client.trackerKey,
  });
  if (event) params.set('event', event);
  const url = meta.tracker + '&info_hash=' + escapeBytes(meta.infoHash) +
    '&peer_id=' + escapeBytes(client.peerId) + '&' + params;
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'Transmission/4.0.6', Accept: '*/*' },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error('PTTime tracker 返回 HTTP ' + response.status + '。');
  }
  const { decoded } = decode(await readBytes(response.body, 65536));
  if (decoded?.['failure reason'] instanceof Uint8Array) {
    const reason = text.decode(decoded['failure reason'])
      .replace(/https?:\/\/\S+|[0-9a-f]{32,}/gi, '[已隐藏]').slice(0, 160);
    throw new Error('PTTime tracker 拒绝了本次请求。' + reason);
  }
  const peers = new Map();
  if (decoded?.peers instanceof Uint8Array) {
    for (let offset = 0; offset + 6 <= decoded.peers.length; offset += 6) {
      const ip = Array.from(decoded.peers.subarray(offset, offset + 4));
      const port = decoded.peers[offset + 4] * 256 + decoded.peers[offset + 5];
      addPeer(peers, ip.join('.'), port);
    }
  } else if (Array.isArray(decoded?.peers)) {
    for (const peer of decoded.peers) {
      if (peer?.ip instanceof Uint8Array) addPeer(peers, text.decode(peer.ip), peer.port);
    }
  }
  if (decoded?.peers6 instanceof Uint8Array) {
    const data = decoded.peers6;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset + 18 <= data.length; offset += 18) {
      if (data[offset] < 0x20 || data[offset] >= 0x40) continue;
      const parts = [];
      for (let i = 0; i < 16; i += 2) parts.push(view.getUint16(offset + i).toString(16));
      addPeer(peers, parts.join(':'), view.getUint16(offset + 16));
    }
  }
  return {
    peers: [...peers.values()],
    interval: Math.max(60, Number(decoded?.interval) || 0, Number(decoded?.['min interval']) || 0),
  };
}

function addPeer(peers, hostname, port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || port === 25) return;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    const [a, b, c, d] = hostname.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || b > 255 || c > 255 || d > 255 ||
        (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b < 32) || (a === 192 && (b === 0 || b === 168)) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)) return;
    hostname = [a, b, c, d].join('.');
  } else if (!/^[23][0-9a-f]{3}(?::[0-9a-f]{1,4}){7}$/i.test(hostname) ||
             /^2001:db8:/i.test(hostname)) {
    return;
  }
  peers.set(hostname + '/' + port, { hostname, port });
}

function hex(value) {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function escapeBytes(value) {
  return Array.from(value, byte => '%' + byte.toString(16).padStart(2, '0')).join('');
}
