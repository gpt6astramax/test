import { announce } from './torrent.js';

const protocol = new TextEncoder().encode('BitTorrent protocol');
const blockLength = 16 * 1024;
const batchLength = 48;

export class TorrentTransfer {
  constructor(meta, connect, client, cache) {
    this.meta = meta;
    this.connect = connect;
    this.client = client;
    this.cache = cache;
    this.peers = [];
    this.dials = new Set();
    this.stats = { tcp: 0, handshakes: 0, ready: 0 };
    this.downloaded = 0;
    this.reported = 0;
    this.announced = 0;
    this.nextAnnounce = 0;
  }

  async start() {
    await this.refresh();
    this.started = true;
    if (!this.peers.length) throw new Error('PTTime tracker 暂无可用的节点。');
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
    this.nextAnnounce = session.nextAnnounce;
    this.announced = Math.max(this.announced, session.downloaded);
  }

  async refresh() {
    const current = await this.cachedSession();
    if (current?.peers.length && current.nextAnnounce > Date.now()) {
      this.useSession(current);
      return;
    }
    try {
      await this.updateTracker(current, current || this.started ? undefined : 'started');
    } catch (error) {
      const fallback = await this.cachedSession();
      if (!fallback?.peers.length) throw error;
      this.useSession(fallback);
      this.nextAnnounce = Math.max(this.nextAnnounce, Date.now() + 60000);
    }
  }

  async updateTracker(previous, event) {
    const downloaded = Math.max(previous?.downloaded ?? 0, this.announced) +
      this.downloaded - this.reported;
    const left = Math.min(previous?.left ?? this.meta.size, this.meta.size - this.downloaded);
    const reply = await announce(this.meta, this.client, event, downloaded, left);
    const session = {
      peers: reply.peers.length ? reply.peers : this.peers,
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

  async piece(index) {
    if (this.closed) throw new Error('BT 传输已关闭。');
    if (Date.now() >= this.nextAnnounce) {
      this.nextAnnounce = Date.now() + 60000;
      await this.refresh().catch(() => {});
    }
    const tried = new Set();
    while (!this.closed) {
      if (!this.peer) this.peer = await this.findPeer(index, tried);
      if (!this.peer) break;
      if (this.closed) {
        this.peer.close();
        break;
      }
      tried.add(this.peer.address);
      try {
        const data = await withTimeout(this.peer.readPiece(index), 90000);
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
        const expected = this.meta.hashes.subarray(index * 20, index * 20 + 20);
        if (!equal(hash, expected)) throw new Error('BT piece hash mismatch');
        this.downloaded += data.length;
        return data;
      } catch {
        this.peer.close();
        this.peer = null;
      }
    }
    throw new Error('本次未取到校验通过的 BT 分片（tracker 节点 ' +
      this.peers.length + '，TCP 连通 ' + this.stats.tcp + '，握手成功 ' +
      this.stats.handshakes + '，可请求 ' + this.stats.ready + '）。');
  }

  async findPeer(index, tried) {
    const candidates = this.peers.filter(peer => !tried.has(peer));
    for (let start = 0; !this.closed && start < candidates.length; start += 5) {
      const wave = candidates.slice(start, start + 5);
      const sockets = [];
      let winner;
      try {
        winner = await Promise.any(wave.map(async address => {
          tried.add(address);
          const peer = new Peer(address, this.meta, this.client.peerId, this.connect, this.stats);
          sockets.push(peer);
          this.dials.add(peer);
          await withTimeout(peer.open(index), 12000);
          return peer;
        }));
        // Keep unused addresses available for a piece retry.
        for (const address of wave) if (address !== winner.address) tried.delete(address);
        return winner;
      } catch {
        // This group contains no peer serving the requested piece.
      } finally {
        for (const peer of sockets) {
          this.dials.delete(peer);
          if (peer !== winner) peer.close();
        }
      }
    }
    return null;
  }

  async finish(completed = false) {
    if (this.closed) return;
    this.closed = true;
    this.peer?.close();
    for (const peer of this.dials) peer.close();
    // Range readers share a logical client. Closing one must not stop the others.
    if (this.started && completed && this.downloaded === this.meta.size) {
      const previous = await this.cachedSession();
      await this.updateTracker(previous, 'completed').catch(() => {});
      await announce(this.meta, this.client, 'stopped', this.announced, 0).catch(() => {});
      await this.cache?.delete(this.client.cacheKey).catch(() => {});
    }
  }
}

class Peer {
  constructor(address, meta, peerId, connect, stats) {
    this.address = address;
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

  async open(index) {
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
    await this.waitForPiece(index);
    this.stats.ready++;
  }

  async readPiece(index) {
    await this.waitForPiece(index);
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
      if (this.available && !(this.available[index >>> 3] & (0x80 >>> (index & 7)))) {
        throw new Error('Peer has not downloaded this piece');
      }
      if (!this.choked) return;
      this.note(await this.message());
    }
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
