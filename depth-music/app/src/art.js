// Generated art: covers and waveforms, drawn once per track and cached.
const covers = new Map();
const waves = new Map();

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The accent's colour space where the canvas takes it, so a track's cover and its buttons agree.
let okl = null;
function col(l, c, h, a) {
  if (okl === null) {
    const x = document.createElement('canvas').getContext('2d');
    x.fillStyle = '#000'; x.fillStyle = 'oklch(0.6 0.1 200)';
    okl = x.fillStyle !== '#000000';
  }
  return okl
    ? `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / ${a.toFixed(3)})`
    : `hsla(${(h - 30).toFixed(1)},${Math.round(c * 480)}%,${Math.round(l * 82)}%,${a.toFixed(3)})`;
}

/** A cover is a handful of out-of-focus highlights: translucent discs with a brighter rim, in the track's hues. */
export function cover(hue, seed) {
  const key = `${hue}:${seed}`;
  if (covers.has(key)) return covers.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  const x = c.getContext('2d');
  const r = rng(seed);
  const g = x.createLinearGradient(0, 0, 320, 320);
  g.addColorStop(0, col(0.24, 0.07, hue, 1));
  g.addColorStop(1, col(0.13, 0.05, hue + 50, 1));
  x.fillStyle = g;
  x.fillRect(0, 0, 320, 320);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const cx = r() * 320, cy = r() * 320, rad = 18 + r() * r() * 92;
    const h = hue + (r() - 0.5) * 80, l = 0.6 + r() * 0.2, a = 0.1 + r() * 0.22;
    x.beginPath();
    x.arc(cx, cy, rad, 0, Math.PI * 2);
    x.fillStyle = col(l, 0.16, h, a);
    x.fill();
    x.lineWidth = 1.5 + rad / 30;
    x.strokeStyle = col(Math.min(0.92, l + 0.14), 0.14, h, a * 0.9);
    x.stroke();
  }
  const url = c.toDataURL('image/jpeg', 0.82);
  covers.set(key, url);
  return url;
}
export const trackCover = (t) => cover(t.hue, t.n * 97 + 11);
export const artistCover = (a, hue) => cover(hue + 20, a.since * 7 + a.name.length * 131);

/** Waveform bars with the shape of a song: a quiet opening, a build, a break, a full ending. Returns a CSS url(). */
export function waveURL(seed, bars, variant = 0) {
  const key = `${seed}:${bars}:${variant}`;
  if (waves.has(key)) return waves.get(key);
  const r = rng(seed * 31 + variant * 7 + 3);
  let out = '', prev = 0.5;
  for (let i = 0; i < bars; i++) {
    const u = i / (bars - 1);
    let env = u < 0.12 ? 0.35 + u * 3 : u < 0.46 ? 0.78 : u < 0.58 ? 0.42 : u < 0.92 ? 0.95 : 0.95 - (u - 0.92) * 8;
    if (variant) env = 0.5 + 0.5 * Math.sin(u * (6 + variant * 3) + variant);
    prev = prev * 0.45 + r() * 0.55;
    const h = Math.max(0.08, env * (0.3 + 0.7 * prev)) * 40;
    out += `<rect x="${i * 3}" y="${((40 - h) / 2).toFixed(1)}" width="2" height="${h.toFixed(1)}" rx="1"/>`;
  }
  const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bars * 3 - 1} 40" preserveAspectRatio="none">${out}</svg>`)}")`;
  waves.set(key, url);
  return url;
}

// Colours of a track, as values a React Native style takes on the web. react-native-web only lets through colour
// strings it knows or ones that start with var(: so the oklch() rides in as the fallback of a variable that is never set.
export const accRaw = (hue) => `oklch(var(--acc-l) var(--acc-c) ${hue})`;
export const acc = (hue) => `var(--_, oklch(var(--acc-l) var(--acc-c) ${hue}))`;
export const accSoft = (hue) => `var(--_, oklch(var(--acc-l) var(--acc-c) ${hue} / .16))`;
