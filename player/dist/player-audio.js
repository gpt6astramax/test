// src/engine/ring.ts
var RING = {
  WPOS: 0,
  RPOS: 1,
  FLUSH_GEN: 2,
  FLUSH_POS: 3,
  PLAYING: 4,
  CAPACITY: 5,
  DATA: 6,
  SEQ: 8,
  /** byte offset of the two doubles: AudioContext frame, ring frame */
  PAIR_OFFSET: 40
};

// src/audio-worklet.ts
var PcmProcessor = class extends AudioWorkletProcessor {
  u32;
  pair;
  pcm;
  mask;
  flushGen = -1;
  constructor(options) {
    super();
    const { buffer, ring } = options.processorOptions;
    this.u32 = new Uint32Array(buffer, ring, 10);
    this.pair = new Float64Array(buffer, ring + RING.PAIR_OFFSET, 2);
    const capacity = this.u32[RING.CAPACITY];
    this.mask = capacity - 1;
    this.pcm = new Float32Array(buffer, this.u32[RING.DATA], capacity * 2);
  }
  process(_inputs, outputs) {
    const u32 = this.u32;
    const left = outputs[0][0];
    const right = outputs[0][1] ?? left;
    let r = Atomics.load(u32, RING.RPOS);
    const gen = Atomics.load(u32, RING.FLUSH_GEN);
    if (gen !== this.flushGen) {
      this.flushGen = gen;
      const target = Atomics.load(u32, RING.FLUSH_POS);
      if ((target - r | 0) > 0) r = target;
    }
    Atomics.add(u32, RING.SEQ, 1);
    this.pair[0] = currentFrame;
    this.pair[1] = r;
    Atomics.add(u32, RING.SEQ, 1);
    if (Atomics.load(u32, RING.PLAYING)) {
      const available = Atomics.load(u32, RING.WPOS) - r >>> 0;
      const n = Math.min(available, left.length);
      const pcm = this.pcm;
      const mask = this.mask;
      for (let i = 0; i < n; i++) {
        const o = (r + i & mask) << 1;
        left[i] = pcm[o];
        right[i] = pcm[o + 1];
      }
      r = r + n >>> 0;
    }
    Atomics.store(u32, RING.RPOS, r);
    return true;
  }
};
registerProcessor("player-pcm", PcmProcessor);
