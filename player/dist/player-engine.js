// src/engine/abi.ts
var decoder = new TextDecoder();
function cstring(buf, ptr, max) {
  const bytes = new Uint8Array(buf, ptr, max);
  const end = bytes.indexOf(0);
  return decoder.decode(bytes.slice(0, end < 0 ? max : end));
}
function readInfo(buf, p) {
  const f = new Float64Array(buf, p, 2);
  const i = new Int32Array(buf, p + 16, 12);
  const j = new Int32Array(buf, p + 224, 8);
  return {
    duration: f[0],
    fps: f[1],
    width: i[0],
    height: i[1],
    sarNum: i[2],
    sarDen: i[3],
    rotation: i[4],
    bitDepth: i[5],
    hasAudio: !!i[7],
    audioRate: i[8],
    audioChannels: i[9],
    frameQueueCapacity: i[10],
    videoCodec: cstring(buf, p + 64, 32),
    audioCodec: cstring(buf, p + 96, 32),
    container: cstring(buf, p + 128, 32),
    pixelFormat: cstring(buf, p + 160, 32),
    profile: cstring(buf, p + 192, 32),
    level: j[0],
    bitRate: j[1],
    videoBitRate: j[2],
    audioBitRate: j[3],
    transfer: j[4] === 16 ? "pq" : j[4] === 18 ? "hlg" : "sdr",
    colorPrimaries: j[5],
    colorMatrix: j[6],
    fullRange: j[7] === 2
  };
}
function readError(buf, p) {
  return new Int32Array(buf, p + 60, 1)[0];
}
function readFrame(buf, p) {
  const pts = new Float64Array(buf, p, 1)[0];
  const u = new Uint32Array(buf, p + 8, 3);
  const i = new Int32Array(buf, p + 20, 13);
  return {
    pts,
    data: [u[0], u[1], u[2]],
    stride: [i[0], i[1], i[2]],
    width: i[3],
    height: i[4],
    chromaWidth: i[5],
    chromaHeight: i[6],
    depth: i[7],
    planes: i[8],
    matrix: i[9],
    fullRange: !!i[10],
    transfer: i[11],
    primaries: i[12]
  };
}
function readStats(buf, p) {
  const f = new Float64Array(buf, p, 2);
  const i = new Int32Array(buf, p + 16, 18);
  return {
    videoQueuedUntil: f[0],
    demuxedUntil: f[1],
    frameQueue: i[0],
    decoded: i[1],
    droppedByDecoder: i[2],
    droppedByRenderer: i[3],
    resyncs: i[4],
    dropLevel: i[5],
    droppableSeen: i[6],
    packetsSeen: i[7],
    videoPackets: i[8],
    audioPackets: i[9],
    packetBytes: i[10],
    demuxEof: !!i[11],
    videoEof: !!i[12],
    audioEof: !!i[13],
    audioBuffered: i[14],
    serial: i[15],
    decodeThreads: i[16],
    audioReady: !!i[17]
  };
}

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

// src/engine/io.ts
var BlobSource = class {
  constructor(blob) {
    this.blob = blob;
    this.size = blob.size;
  }
  blob;
  size;
  async read(pos, dst) {
    const bytes = new Uint8Array(await this.blob.slice(pos, pos + dst.length).arrayBuffer());
    dst.set(bytes);
    return bytes.length;
  }
  close() {
  }
};
var BLOCK = 2 << 20;
var MAX_BLOCKS = 32;
var RETRIES = 4;
var HttpSource = class {
  constructor(url) {
    this.url = url;
  }
  url;
  size = 0;
  blocks = /* @__PURE__ */ new Map();
  /** set when the server ignores Range and sends the whole file */
  whole = null;
  abort = new AbortController();
  async open() {
    const res = await fetch(this.url, { headers: { Range: `bytes=0-${BLOCK - 1}` }, signal: this.abort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${this.url}`);
    if (res.status !== 206) {
      this.whole = new Uint8Array(await res.arrayBuffer());
      this.size = this.whole.length;
      return;
    }
    const total = /\/(\d+)\s*$/.exec(res.headers.get("Content-Range") ?? "");
    if (total) {
      this.size = +total[1];
    } else {
      const head = await fetch(this.url, { method: "HEAD", signal: this.abort.signal });
      this.size = +(head.headers.get("Content-Length") ?? 0);
      if (!this.size) throw new Error("cannot determine the size of " + this.url);
    }
    this.blocks.set(0, res.arrayBuffer().then((b) => new Uint8Array(b)));
  }
  async fetchBlock(index) {
    const from = index * BLOCK;
    const to = Math.min(from + BLOCK, this.size) - 1;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(this.url, { headers: { Range: `bytes=${from}-${to}` }, signal: this.abort.signal });
        if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        if (this.abort.signal.aborted || attempt >= RETRIES) throw e;
        await new Promise((r) => setTimeout(r, 300 << attempt));
      }
    }
  }
  block(index) {
    let p = this.blocks.get(index);
    if (p) {
      this.blocks.delete(index);
    } else {
      p = this.fetchBlock(index);
      p.catch(() => this.blocks.delete(index));
      if (this.blocks.size >= MAX_BLOCKS) this.blocks.delete(this.blocks.keys().next().value);
    }
    this.blocks.set(index, p);
    return p;
  }
  async read(pos, dst) {
    if (this.whole) {
      const n = Math.max(0, Math.min(dst.length, this.size - pos));
      dst.set(this.whole.subarray(pos, pos + n));
      return n;
    }
    let done = 0;
    while (done < dst.length && pos + done < this.size) {
      const index = Math.floor((pos + done) / BLOCK);
      const bytes = await this.block(index);
      const offset = pos + done - index * BLOCK;
      const n = Math.min(dst.length - done, bytes.length - offset);
      if (n <= 0) break;
      dst.set(bytes.subarray(offset, offset + n), done);
      done += n;
    }
    const next = Math.floor((pos + done) / BLOCK) + 1;
    if (next * BLOCK < this.size) this.block(next).catch(() => {
    });
    return done;
  }
  close() {
    this.abort.abort();
    this.blocks.clear();
    this.whole = null;
  }
};
async function openSource(src) {
  if (typeof src !== "string") return new BlobSource(src);
  const http = new HttpSource(src);
  await http.open();
  return http;
}

// src/engine/color.ts
var KR_KB = {
  1: [0.2126, 0.0722],
  // BT.709
  4: [0.3, 0.11],
  // FCC
  5: [0.299, 0.114],
  // BT.470BG
  6: [0.299, 0.114],
  // SMPTE 170M
  7: [0.212, 0.087],
  // SMPTE 240M
  9: [0.2627, 0.0593],
  // BT.2020 NCL
  10: [0.2627, 0.0593]
  // BT.2020 CL (approximated)
};
function colorParams(f) {
  const max = (1 << f.depth) - 1;
  const unit = 1 << f.depth - 8;
  const offY = f.fullRange ? 0 : -16 * unit / max;
  const offC = -(1 << f.depth - 1) / max;
  const sy = f.fullRange ? 1 : max / (219 * unit);
  const sc = f.fullRange ? 1 : max / (224 * unit);
  const hdr = f.transfer === 16 ? 1 : f.transfer === 18 ? 2 : 0;
  const chromaShift = f.planes === 3 && f.chromaWidth < f.width ? 0.25 : 0;
  const scale = 1 / max;
  if (f.planes === 1) {
    return { rows: [[sy, 0, 0], [sy, 0, 0], [sy, 0, 0]], offset: [offY, 0, 0], hdr, scale, chromaShift };
  }
  if (f.matrix === 0) {
    return { rows: [[0, 0, sy], [sy, 0, 0], [0, sy, 0]], offset: [offY, offY, offY], hdr, scale, chromaShift };
  }
  const [kr, kb] = KR_KB[f.matrix] ?? (f.height >= 720 || f.width >= 1280 ? KR_KB[1] : KR_KB[6]);
  const kg = 1 - kr - kb;
  return {
    rows: [
      [sy, 0, 2 * (1 - kr) * sc],
      [sy, -2 * kb * (1 - kb) / kg * sc, -2 * kr * (1 - kr) / kg * sc],
      [sy, 2 * (1 - kb) * sc, 0]
    ],
    offset: [offY, offC, offC],
    hdr,
    scale,
    chromaShift
  };
}
function rotationRows(rotation) {
  switch (rotation) {
    case 90:
      return [0, 1, -1, 0];
    case 180:
      return [-1, 0, 0, -1];
    case 270:
      return [0, -1, 1, 0];
    default:
      return [1, 0, 0, 1];
  }
}

// src/engine/renderer-webgl2.ts
var VERT = `#version 300 es
uniform vec4 uRot;
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  vec2 c = p * vec2(0.5, -0.5);
  vUv = vec2(dot(c, uRot.xy), dot(c, uRot.zw)) + 0.5;
}`;
var COLOR = `
uniform vec3 uM0, uM1, uM2, uOff;
uniform float uHdr;
vec3 pqToLinear(vec3 e) {
  vec3 p = pow(e, vec3(1.0 / 78.84375));
  return pow(max(p - 0.8359375, 0.0) / (18.8515625 - 18.6875 * p), vec3(1.0 / 0.1593017578125));
}
vec3 hlgToLinear(vec3 e) {
  vec3 lo = e * e / 3.0;
  vec3 hi = (exp((e - 0.55991073) / 0.17883277) + 0.28466892) / 12.0;
  return mix(hi, lo, lessThanEqual(e, vec3(0.5)));
}
vec3 hdrToSdr(vec3 e) {
  // display light with 1.0 = 203 nits (HDR reference white), 1000-nit peak assumed
  vec3 lin;
  if (uHdr < 1.5) {
    lin = pqToLinear(e) * (10000.0 / 203.0);
  } else {
    vec3 s = hlgToLinear(e);
    lin = s * pow(max(dot(s, vec3(0.2627, 0.6780, 0.0593)), 1e-6), 0.2) * (1000.0 / 203.0);
  }
  vec3 c = vec3(dot(vec3(1.6605, -0.5876, -0.0728), lin),
                dot(vec3(-0.1246, 1.1329, -0.0083), lin),
                dot(vec3(-0.0182, -0.1006, 1.1187), lin));
  // extended Reinhard on the brightest channel keeps hue; 1.7 lifts mid grey to its SDR level
  float l = max(max(c.r, c.g), max(c.b, 1e-6)) * 1.7;
  float w = 1.7 * 1000.0 / 203.0;
  float mapped = l * (1.0 + l / (w * w)) / (1.0 + l);
  c = clamp(c * 1.7 * (mapped / l), 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}
vec3 convert(vec3 yuv) {
  vec3 v = yuv + uOff;
  vec3 rgb = vec3(dot(uM0, v), dot(uM1, v), dot(uM2, v));
  return uHdr > 0.5 ? hdrToSdr(clamp(rgb, 0.0, 1.0)) : rgb;
}`;
var FRAG_8 = `#version 300 es
precision highp float;
uniform sampler2D uY, uU, uV;
uniform float uShift;
in vec2 vUv;
out vec4 color;
${COLOR}
void main() {
  vec2 cuv = vUv + vec2(uShift / float(textureSize(uU, 0).x), 0.0);
  color = vec4(convert(vec3(texture(uY, vUv).r, texture(uU, cuv).r, texture(uV, cuv).r)), 1.0);
}`;
var FRAG_16 = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform usampler2D uY, uU, uV;
uniform float uShift, uScale;
in vec2 vUv;
out vec4 color;
${COLOR}
float chroma(usampler2D t, vec2 uv) {
  ivec2 size = textureSize(t, 0);
  vec2 p = uv * vec2(size) - 0.5 + vec2(uShift, 0.0);
  vec2 f = fract(p);
  ivec2 b = ivec2(floor(p)), hi = size - 1;
  float a = float(texelFetch(t, clamp(b, ivec2(0), hi), 0).r);
  float c = float(texelFetch(t, clamp(b + ivec2(1, 0), ivec2(0), hi), 0).r);
  float d = float(texelFetch(t, clamp(b + ivec2(0, 1), ivec2(0), hi), 0).r);
  float e = float(texelFetch(t, clamp(b + ivec2(1, 1), ivec2(0), hi), 0).r);
  return mix(mix(a, c, f.x), mix(d, e, f.x), f.y) * uScale;
}
void main() {
  ivec2 size = textureSize(uY, 0);
  float y = float(texelFetch(uY, clamp(ivec2(vUv * vec2(size)), ivec2(0), size - 1), 0).r) * uScale;
  color = vec4(convert(vec3(y, chroma(uU, vUv), chroma(uV, vUv))), 1.0);
}`;
var WebGL2Renderer = class _WebGL2Renderer {
  constructor(canvas2, gl) {
    this.canvas = canvas2;
    this.gl = gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }
  canvas;
  kind = "webgl2";
  gl;
  programs = {};
  textures = [null, null, null];
  layout = "";
  /** null where this thread cannot have a WebGL2 context on `canvas` */
  static create(canvas2) {
    const gl = canvas2.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false
    });
    return gl && new _WebGL2Renderer(canvas2, gl);
  }
  program(wide) {
    const key = wide ? 16 : 8;
    let p = this.programs[key];
    if (p) return p;
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, wide ? FRAG_16 : FRAG_8));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("program: " + gl.getProgramInfoLog(program));
    const uniforms = {};
    for (const n of ["uRot", "uM0", "uM1", "uM2", "uOff", "uHdr", "uShift", "uScale", "uY", "uU", "uV"])
      uniforms[n] = gl.getUniformLocation(program, n);
    gl.useProgram(program);
    gl.uniform1i(uniforms.uY, 0);
    gl.uniform1i(uniforms.uU, 1);
    gl.uniform1i(uniforms.uV, 2);
    p = this.programs[key] = { program, uniforms };
    return p;
  }
  allocate(f, wide) {
    const gl = this.gl;
    const sizes = [
      [f.width, f.height],
      [f.chromaWidth, f.chromaHeight],
      [f.chromaWidth, f.chromaHeight]
    ];
    for (let i = 0; i < 3; i++) {
      if (this.textures[i]) gl.deleteTexture(this.textures[i]);
      this.textures[i] = null;
      if (i >= f.planes) continue;
      const t = this.textures[i] = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, wide ? gl.R16UI : gl.R8, sizes[i][0], sizes[i][1]);
      const filter = wide ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  }
  draw(f, heap2, rotation) {
    const gl = this.gl;
    const wide = f.depth > 8;
    const layout = `${f.width}x${f.height}/${f.chromaWidth}x${f.chromaHeight}/${f.planes}/${wide}`;
    if (layout !== this.layout) {
      this.allocate(f, wide);
      this.layout = layout;
    }
    const { program, uniforms } = this.program(wide);
    gl.useProgram(program);
    for (let i = 0; i < 3; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      if (i >= f.planes) {
        gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
        continue;
      }
      const w = i ? f.chromaWidth : f.width;
      const h = i ? f.chromaHeight : f.height;
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
      if (wide) {
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, f.stride[i] >> 1);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          w,
          h,
          gl.RED_INTEGER,
          gl.UNSIGNED_SHORT,
          new Uint16Array(heap2, f.data[i], (f.stride[i] >> 1) * h)
        );
      } else {
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, f.stride[i]);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          w,
          h,
          gl.RED,
          gl.UNSIGNED_BYTE,
          new Uint8Array(heap2, f.data[i], f.stride[i] * h)
        );
      }
    }
    const c = colorParams(f);
    gl.uniform4fv(uniforms.uRot, rotationRows(rotation));
    gl.uniform3fv(uniforms.uM0, c.rows[0]);
    gl.uniform3fv(uniforms.uM1, c.rows[1]);
    gl.uniform3fv(uniforms.uM2, c.rows[2]);
    gl.uniform3fv(uniforms.uOff, c.offset);
    gl.uniform1f(uniforms.uHdr, c.hdr);
    gl.uniform1f(uniforms.uShift, c.chromaShift);
    gl.uniform1f(uniforms.uScale, c.scale);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  destroy() {
    const gl = this.gl;
    for (const t of this.textures) if (t) gl.deleteTexture(t);
    for (const p of Object.values(this.programs)) if (p) gl.deleteProgram(p.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
};

// src/engine/renderer-webgpu.ts
var COMMON = (
  /* wgsl */
  `
struct Params {
  m0: vec4f,
  m1: vec4f,
  m2: vec4f,
  off: vec4f,   // xyz: offset, w: hdr mode
  misc: vec4f,  // x: 1 / max code value, y: chroma shift in texels
  rot: vec4f,
};
@group(0) @binding(0) var<uniform> u: Params;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  let c = p[i] * vec2f(0.5, -0.5);
  o.uv = vec2f(dot(c, u.rot.xy), dot(c, u.rot.zw)) + 0.5;
  return o;
}

fn pqToLinear(e: vec3f) -> vec3f {
  let p = pow(e, vec3f(1.0 / 78.84375));
  return pow(max(p - 0.8359375, vec3f(0.0)) / (18.8515625 - 18.6875 * p), vec3f(1.0 / 0.1593017578125));
}

fn hlgToLinear(e: vec3f) -> vec3f {
  let lo = e * e / 3.0;
  let hi = (exp((e - 0.55991073) / 0.17883277) + 0.28466892) / 12.0;
  return select(hi, lo, e <= vec3f(0.5));
}

fn hdrToSdr(e: vec3f) -> vec3f {
  // display light with 1.0 = 203 nits (HDR reference white), 1000-nit peak assumed
  var lin: vec3f;
  if (u.off.w < 1.5) {
    lin = pqToLinear(e) * (10000.0 / 203.0);
  } else {
    let s = hlgToLinear(e);
    lin = s * pow(max(dot(s, vec3f(0.2627, 0.6780, 0.0593)), 1e-6), 0.2) * (1000.0 / 203.0);
  }
  var c = vec3f(dot(vec3f(1.6605, -0.5876, -0.0728), lin),
                dot(vec3f(-0.1246, 1.1329, -0.0083), lin),
                dot(vec3f(-0.0182, -0.1006, 1.1187), lin));
  // extended Reinhard on the brightest channel keeps hue; 1.7 lifts mid grey to its SDR level
  let l = max(max(c.r, c.g), max(c.b, 1e-6)) * 1.7;
  let w = 1.7 * 1000.0 / 203.0;
  let mapped = l * (1.0 + l / (w * w)) / (1.0 + l);
  c = clamp(c * 1.7 * (mapped / l), vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

fn convert(yuv: vec3f) -> vec3f {
  let v = yuv + u.off.xyz;
  let rgb = vec3f(dot(u.m0.xyz, v), dot(u.m1.xyz, v), dot(u.m2.xyz, v));
  if (u.off.w > 0.5) {
    return hdrToSdr(clamp(rgb, vec3f(0.0), vec3f(1.0)));
  }
  return rgb;
}`
);
var FRAG_82 = (
  /* wgsl */
  `
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var ty: texture_2d<f32>;
@group(0) @binding(3) var tu: texture_2d<f32>;
@group(0) @binding(4) var tv: texture_2d<f32>;

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let cuv = i.uv + vec2f(u.misc.y / f32(textureDimensions(tu).x), 0.0);
  let yuv = vec3f(textureSampleLevel(ty, samp, i.uv, 0.0).r,
                  textureSampleLevel(tu, samp, cuv, 0.0).r,
                  textureSampleLevel(tv, samp, cuv, 0.0).r);
  return vec4f(convert(yuv), 1.0);
}`
);
var FRAG_162 = (
  /* wgsl */
  `
@group(0) @binding(2) var ty: texture_2d<u32>;
@group(0) @binding(3) var tu: texture_2d<u32>;
@group(0) @binding(4) var tv: texture_2d<u32>;

fn chroma(t: texture_2d<u32>, uv: vec2f) -> f32 {
  let size = vec2i(textureDimensions(t));
  let p = uv * vec2f(size) - 0.5 + vec2f(u.misc.y, 0.0);
  let f = fract(p);
  let b = vec2i(floor(p));
  let hi = size - 1;
  let a = f32(textureLoad(t, clamp(b, vec2i(0), hi), 0).r);
  let c = f32(textureLoad(t, clamp(b + vec2i(1, 0), vec2i(0), hi), 0).r);
  let d = f32(textureLoad(t, clamp(b + vec2i(0, 1), vec2i(0), hi), 0).r);
  let e = f32(textureLoad(t, clamp(b + vec2i(1, 1), vec2i(0), hi), 0).r);
  return mix(mix(a, c, f.x), mix(d, e, f.x), f.y) * u.misc.x;
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(ty));
  let y = f32(textureLoad(ty, clamp(vec2i(i.uv * vec2f(size)), vec2i(0), size - 1), 0).r) * u.misc.x;
  return vec4f(convert(vec3f(y, chroma(tu, i.uv), chroma(tv, i.uv))), 1.0);
}`
);
var WebGPURenderer = class _WebGPURenderer {
  constructor(device, canvas2) {
    this.device = device;
    device.addEventListener("uncapturederror", (e) => console.warn("[player] WebGPU:", e.error.message));
    this.context = canvas2.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.format,
      alphaMode: "opaque",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | _WebGPURenderer.canvasUsage
    });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.uniforms = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }
  device;
  /** extra usage flags for the canvas texture; the renderer test adds COPY_SRC to read frames back */
  static canvasUsage = 0;
  kind = "webgpu";
  context;
  format;
  pipelines = {};
  sampler;
  uniforms;
  uniformData = new Float32Array(24);
  textures = [null, null, null];
  bindGroup = null;
  layout = "";
  /** set when the browser refuses shared memory as an upload source */
  scratch = null;
  /** resolves to null when WebGPU cannot be used here; the canvas is left untouched in that case */
  static async create(canvas2) {
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      const device = await adapter?.requestDevice();
      return device ? new _WebGPURenderer(device, canvas2) : null;
    } catch {
      return null;
    }
  }
  pipeline(wide) {
    const key = wide ? 16 : 8;
    let p = this.pipelines[key];
    if (!p) {
      const module = this.device.createShaderModule({ code: COMMON + (wide ? FRAG_162 : FRAG_82) });
      p = this.pipelines[key] = this.device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format: this.format }] },
        primitive: { topology: "triangle-list" }
      });
    }
    return p;
  }
  allocate(f, wide) {
    const device = this.device;
    for (const t of this.textures) t?.destroy();
    const sizes = [
      [f.width, f.height],
      [f.chromaWidth, f.chromaHeight],
      [f.chromaWidth, f.chromaHeight]
    ];
    for (let i = 0; i < 3; i++) {
      this.textures[i] = i < f.planes ? device.createTexture({
        size: sizes[i],
        format: wide ? "r16uint" : "r8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      }) : null;
    }
    const view = (i) => (this.textures[i] ?? this.textures[0]).createView();
    const entries = [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 2, resource: view(0) },
      { binding: 3, resource: view(1) },
      { binding: 4, resource: view(2) }
    ];
    if (!wide) entries.push({ binding: 1, resource: this.sampler });
    this.bindGroup = device.createBindGroup({ layout: this.pipeline(wide).getBindGroupLayout(0), entries });
  }
  upload(texture, heap2, ptr, stride, width, height) {
    const queue = this.device.queue;
    const size = { width, height };
    if (!this.scratch) {
      try {
        queue.writeTexture({ texture }, heap2, { offset: ptr, bytesPerRow: stride }, size);
        return;
      } catch {
        this.scratch = new Uint8Array(0);
      }
    }
    const bytes = stride * height;
    if (this.scratch.length < bytes) this.scratch = new Uint8Array(bytes);
    this.scratch.set(new Uint8Array(heap2, ptr, bytes));
    queue.writeTexture({ texture }, this.scratch, { bytesPerRow: stride }, size);
  }
  draw(f, heap2, rotation) {
    const wide = f.depth > 8;
    const layout = `${f.width}x${f.height}/${f.chromaWidth}x${f.chromaHeight}/${f.planes}/${wide}`;
    if (layout !== this.layout) {
      this.allocate(f, wide);
      this.layout = layout;
    }
    for (let i = 0; i < f.planes; i++)
      this.upload(this.textures[i], heap2, f.data[i], f.stride[i], i ? f.chromaWidth : f.width, i ? f.chromaHeight : f.height);
    const c = colorParams(f);
    const d = this.uniformData;
    d.set(c.rows[0], 0);
    d.set(c.rows[1], 4);
    d.set(c.rows[2], 8);
    d.set(c.offset, 12);
    d[15] = c.hdr;
    d[16] = c.scale;
    d[17] = c.chromaShift;
    d.set(rotationRows(rotation), 20);
    this.device.queue.writeBuffer(this.uniforms, 0, d);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: this.context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }
      ]
    });
    pass.setPipeline(this.pipeline(wide));
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  destroy() {
    for (const t of this.textures) t?.destroy();
    this.uniforms.destroy();
    this.context.unconfigure();
    this.device.destroy();
  }
};

// src/engine/worker.ts
var scope = self;
var post = (msg) => scope.postMessage(msg);
var SAMPLE_RATE = 48e3;
var core;
var source = null;
var renderer;
var pageDrawing = false;
var pageHeap = null;
var canvas;
var info;
var ringPtr = 0;
var outPtr = 0;
var phase = "opening";
var wantPlay = false;
var seeking = false;
var needFirstFrame = true;
var reportedReady = false;
var starved = 0;
var lastFramePts = 0;
var audioEnabled = false;
var audioOffsets = [];
var lastTick = 0;
var lastReport = 0;
var shown = 0;
var prevShown = 0;
var prevDecoded = 0;
var refresh = 1 / 60;
var drawMs = 0;
var lastRaf = 0;
var heap = () => core.wasmMemory.buffer;
var clock = {
  running: false,
  audio: false,
  base: 0,
  basePerf: 0,
  last: 0,
  now() {
    if (!this.running) return this.base;
    let t = this.audio ? audioTime() : this.base + (performance.now() - this.basePerf) / 1e3;
    if (t === null || t < this.last) t = this.last;
    this.last = t;
    return t;
  },
  set(t) {
    this.base = this.last = t;
    this.basePerf = performance.now();
  },
  start() {
    this.set(this.base);
    this.running = true;
  },
  pause() {
    this.set(this.now());
    this.running = false;
  },
  useAudio(audio) {
    if (audio === this.audio) return;
    this.set(this.now());
    this.audio = audio;
  }
};
function audioTime() {
  if (!audioOffsets.length) return null;
  const u32 = new Uint32Array(heap(), ringPtr, 10);
  const pair = new Float64Array(heap(), ringPtr + RING.PAIR_OFFSET, 2);
  let seq, ctxFrame, ringFrame;
  do {
    seq = Atomics.load(u32, RING.SEQ);
    ctxFrame = pair[0];
    ringFrame = pair[1];
  } while (seq & 1 || seq !== Atomics.load(u32, RING.SEQ));
  if (!seq) return null;
  const ctxNow = ((performance.timeOrigin + performance.now()) / 1e3 + Math.max(...audioOffsets)) * SAMPLE_RATE;
  const t = core._pl_audio_time(ringFrame + Math.min(ctxNow - ctxFrame, 4096));
  return Number.isNaN(t) ? null : t;
}
function setRingPlaying(on) {
  Atomics.store(new Uint32Array(heap(), ringPtr, 10), RING.PLAYING, on ? 1 : 0);
}
function createMemory() {
  for (const maximum of [65536, 32768, 16384, 8192]) {
    try {
      return new WebAssembly.Memory({ initial: 1024, maximum, shared: true });
    } catch {
    }
  }
  throw new Error("cannot allocate shared WebAssembly memory");
}
function fail(message) {
  if (phase === "error") return;
  phase = "error";
  post({ type: "error", message });
}
async function openCore(threads, memoryBudgetMb) {
  const { default: createCore } = await import(
    /* @vite-ignore */
    new URL("./player-core.js", import.meta.url).href
  );
  core = await createCore({
    wasmMemory: createMemory(),
    poolSize: threads + 4,
    printErr: (text) => console.warn("[player-core]", text),
    ioRead(pos, ptr, n, req) {
      source.read(pos, new Uint8Array(heap(), ptr, n)).then(
        (got) => core._pl_io_done(req, got),
        (e) => {
          core._pl_io_done(req, -1);
          fail("read failed: " + (e?.message ?? e));
        }
      );
    }
  });
  core._pl_open(source.size, threads, SAMPLE_RATE, memoryBudgetMb);
}
async function probe(src) {
  source = await openSource(src);
  await openCore(1, 16);
  const timer = setInterval(() => {
    const state = core._pl_state();
    if (!state) return;
    clearInterval(timer);
    if (state < 0) fail("cannot open this file (" + readError(heap(), core._pl_info()) + ")");
    else post({ type: "probed", info: readInfo(heap(), core._pl_info()) });
  }, 10);
}
async function load(msg) {
  canvas = msg.canvas;
  const [opened, gpu] = await Promise.all([
    openSource(msg.src),
    msg.renderer === "webgl2" ? null : WebGPURenderer.create(canvas)
  ]);
  source = opened;
  renderer = gpu ?? WebGL2Renderer.create(canvas);
  await openCore(msg.threads, msg.memoryBudgetMb);
  core._pl_set_audio_live(audioEnabled ? 1 : 0);
  ringPtr = core._pl_audio_ring();
  outPtr = core._pl_video_out();
  if (scope.requestAnimationFrame) {
    const frame = () => {
      const now = performance.now();
      if (lastRaf && now - lastRaf < 50) refresh += ((now - lastRaf) / 1e3 - refresh) * 0.1;
      lastRaf = now;
      tick(true);
      scope.requestAnimationFrame(frame);
    };
    scope.requestAnimationFrame(frame);
    setInterval(() => performance.now() - lastTick > 120 && tick(false), 60);
  } else {
    setInterval(() => tick(true), 8);
  }
}
function setPhase(next) {
  if (phase === next) return;
  phase = next;
  post({ type: "state", state: next === "preroll" ? "waiting" : next });
}
function startPlaying() {
  const live = audioEnabled && info.hasAudio;
  clock.useAudio(live);
  setRingPlaying(live);
  clock.start();
  setPhase("playing");
}
function seek(time) {
  if (phase === "opening" || phase === "error") return;
  const t = Math.max(0, info.duration > 0 ? Math.min(time, info.duration) : time);
  setRingPlaying(false);
  core._pl_seek(t);
  clock.running = false;
  clock.set(t);
  needFirstFrame = true;
  seeking = true;
  starved = 0;
  post({ type: "seeking", time: t });
  setPhase("preroll");
}
function present(draw) {
  const f = readFrame(heap(), outPtr);
  lastFramePts = f.pts;
  if (draw) {
    let w = f.width;
    let h = f.height;
    const sar = info.sarNum / info.sarDen;
    if (sar > 1) w = Math.round(w * sar);
    else if (sar < 1) h = Math.round(h / sar);
    if (info.rotation % 180) [w, h] = [h, w];
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      post({ type: "resize", width: w, height: h });
    }
    shown++;
    if (!renderer) {
      pageDrawing = true;
      const grown = heap() !== pageHeap;
      if (grown) pageHeap = heap();
      post({ type: "frame", frame: f, buffer: grown ? pageHeap : void 0 });
      return;
    }
    const start = performance.now();
    try {
      renderer.draw(f, heap(), info.rotation);
    } catch (e) {
      fail("render failed: " + (e?.message ?? e));
    }
    drawMs += (performance.now() - start - drawMs) * 0.1;
  }
  core._pl_video_release();
}
function prerollDone(s) {
  const wanted = Math.min(info.frameQueueCapacity, Math.max(4, Math.round((info.fps || 30) * 0.2)));
  const video = s.videoEof || s.frameQueue >= wanted;
  const audio = !info.hasAudio || !audioEnabled || s.audioEof || s.audioReady && s.audioBuffered >= SAMPLE_RATE * 0.1;
  return video && audio;
}
function tick(draw) {
  const now = performance.now();
  lastTick = now;
  if (phase === "error") return;
  if (phase === "opening") {
    const state = core._pl_state();
    if (!state) return;
    if (state < 0) return fail("cannot open this file (" + readError(heap(), core._pl_info()) + ")");
    info = readInfo(heap(), core._pl_info());
    post({ type: "info", info, buffer: heap(), ring: ringPtr });
    phase = "preroll";
    return;
  }
  const s = readStats(heap(), core._pl_stats());
  const t = clock.now();
  core._pl_set_clock(t, phase === "playing" ? 1 : 0);
  if (pageDrawing) return;
  if (phase === "preroll") {
    if (prerollDone(s)) {
      if (needFirstFrame && core._pl_video_select(-1e18, 1)) present(true);
      needFirstFrame = false;
      if (seeking) {
        seeking = false;
        post({ type: "seeked" });
      }
      if (!reportedReady) {
        reportedReady = true;
        post({ type: "ready" });
      }
      if (wantPlay) startPlaying();
      else setPhase("paused");
    }
  } else if (phase === "playing") {
    const live = audioEnabled && info.hasAudio && !(s.audioEof && s.audioBuffered === 0);
    clock.useAudio(live);
    setRingPlaying(live);
    if (core._pl_video_select(t + refresh * 0.75, 0)) present(draw);
    if (s.videoEof && s.frameQueue === 0) {
      if (!live && t >= lastFramePts + 1 / (info.fps || 30)) {
        clock.pause();
        wantPlay = false;
        setRingPlaying(false);
        setPhase("ended");
      }
    } else if (s.frameQueue === 0 && s.videoPackets === 0 && !s.demuxEof) {
      if (++starved > 6) {
        clock.pause();
        setRingPlaying(false);
        setPhase("preroll");
      }
    } else {
      starved = 0;
    }
  }
  if (now - lastReport >= 250) {
    const dt = (now - lastReport) / 1e3;
    const stats = {
      renderer: renderer?.kind ?? "page-webgl2",
      threads: s.decodeThreads,
      decodeFps: lastReport ? (s.decoded - prevDecoded) / dt : 0,
      renderFps: lastReport ? (shown - prevShown) / dt : 0,
      decoded: s.decoded,
      shown,
      droppedByDecoder: s.droppedByDecoder,
      droppedByRenderer: s.droppedByRenderer,
      dropLevel: s.dropLevel,
      resyncs: s.resyncs,
      frameQueue: s.frameQueue,
      frameQueueCapacity: info.frameQueueCapacity,
      audioBufferedMs: s.audioBuffered / SAMPLE_RATE * 1e3,
      bufferedUntil: s.demuxedUntil,
      audioClock: clock.audio,
      clockTime: t,
      videoTime: lastFramePts,
      drawMs,
      refreshHz: 1 / refresh
    };
    prevDecoded = s.decoded;
    prevShown = shown;
    lastReport = now;
    post({ type: "time", time: clock.now(), playing: phase === "playing", stats });
  }
}
scope.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "load":
      load(msg).catch((err) => fail(err?.message ?? String(err)));
      break;
    case "probe":
      probe(msg.src).catch((err) => fail(err?.message ?? String(err)));
      break;
    case "play":
      wantPlay = true;
      if (phase === "ended") seek(0);
      else if (phase === "paused") startPlaying();
      break;
    case "pause":
      wantPlay = false;
      audioOffsets = [];
      if (phase === "playing") {
        clock.pause();
        setRingPlaying(false);
        setPhase("paused");
      }
      break;
    case "seek":
      seek(msg.time);
      break;
    case "audio":
      audioEnabled = msg.enabled;
      if (core) core._pl_set_audio_live(msg.enabled ? 1 : 0);
      if (phase === "playing") {
        clock.useAudio(msg.enabled && info.hasAudio);
        setRingPlaying(msg.enabled && info.hasAudio);
      }
      break;
    case "ts":
      if (audioOffsets.length && Math.abs(msg.offset - Math.max(...audioOffsets)) > 0.1) audioOffsets = [];
      audioOffsets.push(msg.offset);
      if (audioOffsets.length > 10) audioOffsets.shift();
      break;
    case "drawn":
      pageDrawing = false;
      core._pl_video_release();
      break;
  }
};
