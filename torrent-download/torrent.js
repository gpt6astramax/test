const text = new TextDecoder();
const bytes = new TextEncoder();
const trackerHosts = new Set(['www.pttime.fun', 'www.pttime.org']);

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

export function decode(data) {
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

export const torrentLimit = 4 * 1024 * 1024;
const openTrackr = 'http://tracker.opentrackr.org:1337/announce';

export function httpUrl(input, tracker = false) {
  if (typeof input !== 'string' || input.length > 2048 || !URL.canParse(input)) return null;
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      (url.port && (!tracker || Number(url.port) < 80))) return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (!publicIp(hostname.replace(/^\[|\]$/g, ''))) return null;
  } else if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(hostname) ||
             /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/.test(hostname)) {
    return null;
  }
  url.hash = '';
  return url;
}

export async function readTorrent(source) {
  let target = httpUrl(String(source));
  for (let redirects = 0; target && redirects <= 3; redirects++) {
    const response = await fetch(target, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/x-bittorrent, */*' },
    });
    if (response.status === 200) return readBytes(response.body, torrentLimit);
    await response.body?.cancel();
    const location = response.headers.get('Location');
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) {
      throw new Error('读取种子返回 HTTP ' + response.status + '。');
    }
    target = httpUrl(new URL(location, target).href);
  }
  throw new Error('种子链接的跳转地址无法访问。');
}

export async function loadTorrent(raw) {
  const { decoded, encodedInfo } = decode(raw);
  const info = decoded?.info;
  const pieceLength = info?.['piece length'];
  if (!encodedInfo || !Number.isSafeInteger(pieceLength) || pieceLength <= 0 ||
      pieceLength > 16 * 1024 * 1024 || !(info.pieces instanceof Uint8Array) ||
      !(info.name instanceof Uint8Array)) {
    throw new Error('需要包含 v1 分片哈希的 .torrent 种子。');
  }

  const label = filePart(info['name.utf-8'] ?? info.name);
  const entries = Array.isArray(info.files)
    ? info.files
    : [{ length: info.length, path: [info['name.utf-8'] ?? info.name] }];
  const files = [];
  let size = 0;
  for (const entry of entries) {
    const path = entry?.['path.utf-8'] ?? entry?.path;
    if (!Array.isArray(path) || !path.length || !path.every(part => part instanceof Uint8Array) ||
        !Number.isSafeInteger(entry.length) || entry.length < 0 ||
        !Number.isSafeInteger(size + entry.length)) {
      throw new Error('种子的文件清单无效。');
    }
    if (!(entry.attr instanceof Uint8Array && text.decode(entry.attr).includes('p'))) {
      const names = path.map(filePart);
      files.push({ filename: names.at(-1), path: names.join('/'), offset: size, size: entry.length });
    }
    size += entry.length;
  }
  if (!files.length || info.pieces.length !== 20 * Math.ceil(size / pieceLength)) {
    throw new Error('种子的文件大小和分片数不一致。');
  }

  const addresses = Array.isArray(decoded['announce-list']) ? decoded['announce-list'].flat() : [];
  const trackers = [];
  const udpTrackers = [];
  for (const address of [decoded.announce, ...addresses]) {
    if (!(address instanceof Uint8Array)) continue;
    const value = text.decode(address);
    if (value.startsWith('udp://') && value.length <= 512 && !udpTrackers.includes(value) &&
        udpTrackers.length < 4) udpTrackers.push(value);
    const tracker = /^udp:\/\/tracker\.opentrackr\.org:1337(?:\/announce)?\/?$/.test(value)
      ? openTrackr
      : httpUrl(value, true)?.href;
    if (tracker && !trackers.includes(tracker)) trackers.push(tracker);
    if (trackers.length >= 4) trackers.length = 4;
  }
  if (!trackers.length && info.private !== 1) trackers.push(openTrackr);
  const pttime = trackers.length > 0 && isPttimeTracker(trackers[0]);
  return {
    label, files, size, trackers, udpTrackers, pttime, private: info.private === 1,
    pieceLength,
    pieceCount: info.pieces.length / 20,
    hashes: info.pieces,
    infoHash: new Uint8Array(await crypto.subtle.digest('SHA-1', encodedInfo)),
  };
}

function filePart(part) {
  const name = part instanceof Uint8Array ? text.decode(part).replace(/[\x00-\x1f\x7f\\/]/g, '_').trim() : '';
  return name && name !== '.' && name !== '..' ? name : 'download';
}

function isPttimeTracker(address) {
  const url = new URL(address);
  return url.protocol === 'https:' && !url.port && trackerHosts.has(url.hostname) &&
    url.pathname === '/announce.php' && /^[a-f0-9]{32}$/i.test(url.searchParams.get('passkey'));
}

export async function clientIdentity(meta, origin) {
  const digest = meta.pttime
    ? new Uint8Array(await crypto.subtle.digest(
        'SHA-256', bytes.encode('pttime-worker:' + meta.trackers[0] + '#' + hex(meta.infoHash)),
      ))
    : crypto.getRandomValues(new Uint8Array(32));
  return {
    peerId: bytes.encode((meta.pttime ? '-TR4060-' : '-WB0100-') + hex(digest.subarray(0, 6))),
    trackerKey: hex(digest.subarray(6, 10)),
    cacheKey: new Request(origin + '/torrent-download/.tracker/' + hex(digest)),
  };
}

export async function announce(meta, client, event, downloaded, left, selected) {
  let empty;
  let failure;
  for (const tracker of selected ? [selected] : meta.trackers) {
    try {
      const reply = await announceAt(meta, client, event, downloaded, left, tracker);
      if (selected || reply.peers.length || meta.pttime || meta.private) return reply;
      empty ??= reply;
    } catch (error) {
      failure ??= error;
    }
  }
  if (empty) return empty;
  throw failure ?? new Error('这个种子没有可用的 HTTP(S) tracker。');
}

async function announceAt(meta, client, event, downloaded, left, tracker) {
  const trackerLabel = isPttimeTracker(tracker) ? 'PTTime tracker' : 'Tracker';
  const params = new URLSearchParams({
    port: '51413',
    uploaded: '0',
    downloaded: String(downloaded),
    left: String(left),
    compact: '1',
    numwant: event === 'stopped' ? '0' : '40',
    key: client.trackerKey,
  });
  if (event) params.set('event', event);
  const separator = tracker.includes('?') ? '&' : '?';
  const url = tracker + separator + 'info_hash=' + escapeBytes(meta.infoHash) +
    '&peer_id=' + escapeBytes(client.peerId) + '&' + params;
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': meta.pttime ? 'Transmission/4.0.6' : 'WorkerBT/1.0', Accept: '*/*' },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(trackerLabel + ' 返回 HTTP ' + response.status + '。');
  }
  const raw = await readBytes(response.body, 65536);
  if (!raw.length && event === 'stopped') return { tracker, peers: [], interval: 60 };
  const { decoded } = decode(raw);
  if (decoded?.['failure reason'] instanceof Uint8Array) {
    const reason = text.decode(decoded['failure reason'])
      .replace(/https?:\/\/\S+|[0-9a-f]{32,}/gi, '[已隐藏]').slice(0, 160);
    throw new Error(trackerLabel + ' 拒绝了本次请求。' + reason);
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
    tracker,
    peers: [...peers.values()],
    interval: Math.max(60, Number(decoded?.interval) || 0, Number(decoded?.['min interval']) || 0),
  };
}

function addPeer(peers, hostname, port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || port === 25 || !publicIp(hostname)) return;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    hostname = hostname.split('.').map(Number).join('.');
  }
  peers.set(hostname + '/' + port, { hostname, port });
}

export function publicIp(hostname) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    const [a, b, c, d] = hostname.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || b > 255 || c > 255 || d > 255 ||
        (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b < 32) || (a === 192 && (b === 0 || b === 168)) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113));
  }
  return /^[23][0-9a-f]{3}:[0-9a-f:]+$/i.test(hostname) && !/^2001:db8:/i.test(hostname) &&
    URL.canParse('http://[' + hostname + ']/');
}

function hex(value) {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function escapeBytes(value) {
  return Array.from(value, byte => '%' + byte.toString(16).padStart(2, '0')).join('');
}
