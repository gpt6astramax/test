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
  constructor(canvas, gl) {
    this.canvas = canvas;
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
  static create(canvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false
    });
    return gl && new _WebGL2Renderer(canvas, gl);
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
  draw(f, heap, rotation) {
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
          new Uint16Array(heap, f.data[i], (f.stride[i] >> 1) * h)
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
          new Uint8Array(heap, f.data[i], f.stride[i] * h)
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

// src/engines.ts
var FILL = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block";
var FORWARDED = ["play", "pause", "playing", "waiting", "seeking", "seeked", "timeupdate", "ended", "resize"];
var NativeEngine = class {
  kind = "native";
  info = null;
  stats = null;
  video = document.createElement("video");
  objectUrl = "";
  loaded = false;
  constructor(container, emit) {
    this.video.playsInline = true;
    this.video.preload = "auto";
    this.video.style.cssText = FILL;
    container.append(this.video);
    for (const name of FORWARDED) this.video.addEventListener(name, () => this.loaded && emit(name));
    this.video.addEventListener("error", () => this.loaded && emit("error", this.video.error));
  }
  load(src) {
    const video = this.video;
    return new Promise((resolve, reject) => {
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (!video.videoWidth) return reject(new Error("the browser cannot decode the video track"));
          this.loaded = true;
          resolve();
        },
        { once: true }
      );
      video.addEventListener("error", () => reject(video.error ?? new Error("unsupported media")), { once: true });
      video.src = typeof src === "string" ? src : this.objectUrl = URL.createObjectURL(src);
    });
  }
  play() {
    return this.video.play();
  }
  pause() {
    this.video.pause();
  }
  get currentTime() {
    return this.video.currentTime;
  }
  set currentTime(t) {
    this.video.currentTime = t;
  }
  get volume() {
    return this.video.volume;
  }
  set volume(v) {
    this.video.volume = v;
  }
  get muted() {
    return this.video.muted;
  }
  set muted(m) {
    this.video.muted = m;
  }
  get duration() {
    return this.video.duration;
  }
  get paused() {
    return this.video.paused;
  }
  get ended() {
    return this.video.ended;
  }
  get videoWidth() {
    return this.video.videoWidth;
  }
  get videoHeight() {
    return this.video.videoHeight;
  }
  get frames() {
    const q = this.video.getVideoPlaybackQuality?.();
    return q ? { shown: q.totalVideoFrames - q.droppedVideoFrames, dropped: q.droppedVideoFrames } : { shown: 0, dropped: 0 };
  }
  destroy() {
    this.loaded = false;
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
};
var WasmEngine = class {
  constructor(container, emit, options) {
    this.emit = emit;
    this.options = options;
    this.canvas.style.cssText = FILL;
    container.append(this.canvas);
  }
  emit;
  options;
  kind = "wasm";
  info = null;
  stats = null;
  videoWidth = 0;
  videoHeight = 0;
  canvas = document.createElement("canvas");
  painter = null;
  worker = null;
  audio = null;
  gain = null;
  audioSetup = null;
  tsTimer = 0;
  shared = null;
  state = "opening";
  wantPlay = false;
  time = 0;
  timeStamp = 0;
  timeRunning = false;
  _volume = 1;
  _muted = false;
  load(src) {
    if (!globalThis.crossOriginIsolated)
      return Promise.reject(
        new Error(
          "WebAssembly decoding needs a cross-origin isolated page: serve it with Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp (or credentialless)"
        )
      );
    return new Promise((resolve, reject) => {
      const worker = this.worker = new Worker(this.options.baseUrl + "player-engine.js", { type: "module" });
      let settled = false;
      worker.onerror = (e) => {
        if (!settled) reject(new Error(e.message || "engine worker failed to start"));
        else this.emit("error", new Error(e.message));
        settled = true;
      };
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "ready" && !settled) {
          settled = true;
          resolve();
        } else if (msg.type === "error" && !settled) {
          settled = true;
          reject(new Error(msg.message));
        } else {
          this.onMessage(msg);
        }
      };
      const canvas = this.canvas.transferControlToOffscreen();
      const load = {
        type: "load",
        canvas,
        src,
        threads: this.options.threads,
        renderer: this.options.renderer,
        memoryBudgetMb: this.options.memoryBudgetMb
      };
      worker.postMessage(load, [canvas]);
    });
  }
  post(msg) {
    this.worker?.postMessage(msg);
  }
  onMessage(msg) {
    switch (msg.type) {
      case "info":
        this.info = msg.info;
        this.shared = { buffer: msg.buffer, ring: msg.ring };
        break;
      case "resize":
        this.videoWidth = msg.width;
        this.videoHeight = msg.height;
        this.emit("resize");
        break;
      case "state": {
        const before = this.state;
        this.state = msg.state;
        if (msg.state === "playing") this.emit("playing");
        else if (msg.state === "waiting" && before === "playing") this.emit("waiting");
        else if (msg.state === "ended") {
          this.wantPlay = false;
          this.audio?.suspend();
          this.emit("pause");
          this.emit("ended");
        }
        break;
      }
      case "frame":
        if (msg.buffer) this.shared.buffer = msg.buffer;
        this.paint(msg.frame);
        break;
      case "seeking":
        this.setTime(msg.time, false);
        this.emit("seeking");
        break;
      case "seeked":
        this.emit("seeked");
        break;
      case "time":
        this.setTime(msg.time, msg.playing);
        this.stats = msg.stats;
        this.emit("timeupdate");
        break;
      case "error":
        this.state = "error";
        this.emit("error", new Error(msg.message));
        break;
    }
  }
  /**
   * Draws for an engine worker that cannot have a GPU context of its own: WebGL in workers is
   * missing in Safari on older macOS versions and in WebKitGTK. The planes are read from the
   * shared wasm heap just as the worker would.
   */
  paint(frame) {
    if (this.state === "error") return;
    if (!this.painter) {
      const canvas = document.createElement("canvas");
      canvas.style.cssText = FILL;
      this.canvas.replaceWith(canvas);
      this.canvas = canvas;
      this.painter = WebGL2Renderer.create(canvas);
    }
    if (!this.painter) {
      this.state = "error";
      return this.emit("error", new Error("WebGL2 is not available"));
    }
    if (this.canvas.width !== this.videoWidth || this.canvas.height !== this.videoHeight) {
      this.canvas.width = this.videoWidth;
      this.canvas.height = this.videoHeight;
    }
    try {
      this.painter.draw(frame, this.shared.buffer, this.info.rotation);
    } catch (e) {
      this.state = "error";
      return this.emit("error", e);
    }
    this.post({ type: "drawn" });
  }
  setTime(time, running) {
    this.time = time;
    this.timeStamp = performance.now();
    this.timeRunning = running;
  }
  /** creates the audio output on first use and reports whether it is running */
  async startAudio() {
    if (!this.audio) {
      const audio2 = this.audio = new AudioContext({ sampleRate: 48e3, latencyHint: "playback" });
      this.audioSetup = audio2.audioWorklet.addModule(this.options.baseUrl + "player-audio.js").then(() => {
        const node = new AudioWorkletNode(audio2, "player-pcm", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          processorOptions: this.shared
        });
        this.gain = audio2.createGain();
        this.gain.gain.value = this._muted ? 0 : this._volume;
        node.connect(this.gain).connect(audio2.destination);
      });
    }
    const audio = this.audio;
    const resumed = audio.resume().catch(() => {
    });
    await this.audioSetup;
    if (audio.state !== "running") await Promise.race([resumed, new Promise((r) => setTimeout(r, 300))]);
    return audio.state === "running";
  }
  /** the output runs: have the engine play sound and follow the audio clock */
  audioLive() {
    this.sendTimestamp();
    clearInterval(this.tsTimer);
    this.tsTimer = window.setInterval(() => this.sendTimestamp(), 200);
    this.post({ type: "audio", enabled: true });
  }
  /** tells the engine how the AudioContext clock relates to the wall clock, for the sample leaving the speakers */
  sendTimestamp() {
    const audio = this.audio;
    if (!audio || audio.state !== "running") return;
    const now = performance.now();
    const ts = audio.getOutputTimestamp?.();
    const age = ts ? now - ts.performanceTime : NaN;
    const [ctxTime, at] = ts && ts.contextTime > 0 && age > -50 && age < 250 ? [ts.contextTime, ts.performanceTime] : [audio.currentTime - (audio.outputLatency || audio.baseLatency || 0), now];
    this.post({ type: "ts", offset: ctxTime - (performance.timeOrigin + at) / 1e3 });
  }
  async play() {
    if (!this.info) throw new Error("nothing loaded");
    if (this.info.hasAudio && !this._muted) {
      const gesture = navigator.userActivation?.isActive;
      if (await this.startAudio()) this.audioLive();
      else if (!gesture)
        throw new DOMException("Playback with sound has to start from a user gesture (or mute first).", "NotAllowedError");
      else this.audio.resume().then(() => this.wantPlay && !this._muted && this.audioLive(), () => {
      });
    }
    if (!this.wantPlay) {
      this.wantPlay = true;
      this.emit("play");
    }
    this.post({ type: "play" });
  }
  pause() {
    if (!this.wantPlay) return;
    this.wantPlay = false;
    this.post({ type: "pause" });
    clearInterval(this.tsTimer);
    this.audio?.suspend();
    this.emit("pause");
  }
  get currentTime() {
    const t = this.timeRunning ? this.time + (performance.now() - this.timeStamp) / 1e3 : this.time;
    return this.duration ? Math.min(t, this.duration) : t;
  }
  set currentTime(t) {
    this.setTime(t, false);
    this.post({ type: "seek", time: t });
  }
  get volume() {
    return this._volume;
  }
  set volume(v) {
    this._volume = Math.min(1, Math.max(0, v));
    if (this.gain) this.gain.gain.value = this._muted ? 0 : this._volume;
  }
  get muted() {
    return this._muted;
  }
  set muted(m) {
    this._muted = m;
    if (this.gain) this.gain.gain.value = m ? 0 : this._volume;
    if (!m && this.wantPlay && this.info?.hasAudio)
      this.startAudio().then((ok) => ok && this.audioLive());
  }
  get duration() {
    return this.info?.duration ?? 0;
  }
  get paused() {
    return !this.wantPlay;
  }
  get ended() {
    return this.state === "ended";
  }
  get frames() {
    const s = this.stats;
    return { shown: s?.shown ?? 0, dropped: s ? s.droppedByDecoder + s.droppedByRenderer : 0 };
  }
  destroy() {
    clearInterval(this.tsTimer);
    this.worker?.terminate();
    this.worker = null;
    this.audio?.close().catch(() => {
    });
    this.audio = null;
    this.painter?.destroy();
    this.canvas.remove();
  }
};

// src/player.ts
var Player = class extends EventTarget {
  constructor(container, options = {}) {
    super();
    this.container = container;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.options = {
      mode: options.mode ?? "auto",
      threads: Math.max(1, Math.min(options.threads ?? navigator.hardwareConcurrency ?? 4, 32)),
      renderer: options.renderer ?? "auto",
      frameMemoryMb: options.frameMemoryMb ?? (mobile ? 96 : 256),
      baseUrl: options.baseUrl ?? new URL(".", import.meta.url).href
    };
    if (!this.options.baseUrl.endsWith("/")) this.options.baseUrl += "/";
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
  }
  container;
  engine = null;
  src = null;
  generation = 0;
  _volume = 1;
  _muted = false;
  options;
  /** last error, also delivered through the 'error' event */
  error = null;
  /** Loads a URL, File or Blob. Resolves when it is ready to play. */
  async load(src) {
    const generation = ++this.generation;
    this.engine?.destroy();
    this.engine = null;
    this.error = null;
    this.src = src;
    let engine = null;
    if (this.options.mode !== "wasm") {
      engine = new NativeEngine(this.container, (name, detail) => this.onEngineEvent(engine, name, detail));
      try {
        await engine.load(src);
      } catch (e) {
        engine.destroy();
        engine = null;
        if (this.options.mode === "native") throw e;
      }
    }
    if (generation !== this.generation) return void engine?.destroy();
    if (!engine) engine = await this.startWasm(src, generation);
    if (!engine) return;
    this.attach(engine);
  }
  async startWasm(src, generation) {
    const engine = new WasmEngine(
      this.container,
      (name, detail) => this.onEngineEvent(engine, name, detail),
      {
        baseUrl: this.options.baseUrl,
        threads: this.options.threads,
        renderer: this.options.renderer,
        memoryBudgetMb: this.options.frameMemoryMb
      }
    );
    try {
      await engine.load(src);
    } catch (e) {
      engine.destroy();
      throw e;
    }
    if (generation !== this.generation) {
      engine.destroy();
      return null;
    }
    return engine;
  }
  attach(engine) {
    this.engine = engine;
    engine.volume = this._volume;
    engine.muted = this._muted;
    this.dispatchEvent(new Event("loadedmetadata"));
    this.dispatchEvent(new Event("canplay"));
  }
  onEngineEvent(engine, name, detail) {
    if (engine !== this.engine) return;
    if (name === "error") {
      if (engine.kind === "native" && this.options.mode === "auto" && this.src !== null) {
        this.switchToWasm(engine.currentTime, !engine.paused);
        return;
      }
      this.error = detail;
    }
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  async switchToWasm(time, playing) {
    const generation = ++this.generation;
    this.engine?.destroy();
    this.engine = null;
    try {
      const engine = await this.startWasm(this.src, generation);
      if (!engine) return;
      this.engine = engine;
      engine.volume = this._volume;
      engine.muted = this._muted;
      if (time > 0) engine.currentTime = time;
      this.dispatchEvent(new Event("modechange"));
      if (playing) await engine.play();
    } catch (e) {
      this.error = e;
      this.dispatchEvent(new CustomEvent("error", { detail: e }));
    }
  }
  play() {
    return this.engine ? this.engine.play() : Promise.reject(new Error("nothing loaded"));
  }
  pause() {
    this.engine?.pause();
  }
  get currentTime() {
    return this.engine?.currentTime ?? 0;
  }
  set currentTime(t) {
    if (this.engine) this.engine.currentTime = t;
  }
  get duration() {
    return this.engine?.duration ?? NaN;
  }
  get paused() {
    return this.engine?.paused ?? true;
  }
  get ended() {
    return this.engine?.ended ?? false;
  }
  get volume() {
    return this._volume;
  }
  set volume(v) {
    this._volume = v;
    if (this.engine) this.engine.volume = v;
  }
  get muted() {
    return this._muted;
  }
  set muted(m) {
    this._muted = m;
    if (this.engine) this.engine.muted = m;
  }
  get videoWidth() {
    return this.engine?.videoWidth ?? 0;
  }
  get videoHeight() {
    return this.engine?.videoHeight ?? 0;
  }
  /** which pipeline is playing: the browser's own decoder or the WebAssembly one */
  get mode() {
    return this.engine?.kind ?? null;
  }
  /** stream details (WebAssembly path only) */
  get mediaInfo() {
    return this.engine?.info ?? null;
  }
  /** decoder and renderer statistics (WebAssembly path only) */
  get stats() {
    return this.engine?.stats ?? null;
  }
  /** frames shown and dropped so far, whichever pipeline is playing */
  get frames() {
    return this.engine?.frames ?? { shown: 0, dropped: 0 };
  }
  /**
   * Reads the stream parameters of a URL, File or Blob without playing it (container, codecs,
   * resolution, bit depth, frame rate, bit rates, HDR). Uses the WebAssembly demuxer, so it needs
   * a cross-origin isolated page like the WebAssembly path itself.
   */
  static probe(src, baseUrl = new URL(".", import.meta.url).href) {
    if (!globalThis.crossOriginIsolated) return Promise.reject(new Error("probe() needs a cross-origin isolated page"));
    return new Promise((resolve, reject) => {
      const worker = new Worker((baseUrl.endsWith("/") ? baseUrl : baseUrl + "/") + "player-engine.js", { type: "module" });
      const done = (f) => {
        worker.terminate();
        f();
      };
      worker.onerror = (e) => done(() => reject(new Error(e.message || "engine worker failed to start")));
      worker.onmessage = (e) => {
        if (e.data.type === "probed") done(() => resolve(e.data.info));
        else if (e.data.type === "error") done(() => reject(new Error(e.data.message)));
      };
      worker.postMessage({ type: "probe", src });
    });
  }
  destroy() {
    this.generation++;
    this.engine?.destroy();
    this.engine = null;
    this.src = null;
  }
};
export {
  Player
};
