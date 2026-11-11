// The numbers behind the generated art, shared by the web (canvas, CSS masks) and iOS / Android (SVG, views):
// which discs a cover has, how tall a waveform's bars are. Pure functions, no drawing.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const specs = new Map();
/**
 * A cover is a handful of out-of-focus highlights: translucent discs with a brighter rim, in the track's hues, on a
 * 320 x 320 field. Colours are given as oklch parts [l, c, h, alpha].
 */
export function coverSpec(hue, seed) {
  const key = `${hue}:${seed}`;
  if (specs.has(key)) return specs.get(key);
  const r = rng(seed);
  const discs = [];
  for (let i = 0; i < 16; i++) {
    const cx = r() * 320, cy = r() * 320, rad = 18 + r() * r() * 92;
    const h = hue + (r() - 0.5) * 80, l = 0.6 + r() * 0.2, a = 0.1 + r() * 0.22;
    discs.push({ cx, cy, rad, fill: [l, 0.16, h, a], rim: [Math.min(0.92, l + 0.14), 0.14, h, a * 0.9], rimWidth: 1.5 + rad / 30 });
  }
  const spec = { from: [0.24, 0.07, hue, 1], to: [0.13, 0.05, hue + 50, 1], discs };
  specs.set(key, spec);
  return spec;
}
export const trackSeed = (t) => t.n * 97 + 11;
export const artistSeed = (a) => a.since * 7 + a.name.length * 131;

const waves = new Map();
/** Waveform bars with the shape of a song: a quiet opening, a build, a break, a full ending. Heights 0..1. */
export function waveBars(seed, bars, variant = 0) {
  const key = `${seed}:${bars}:${variant}`;
  if (waves.has(key)) return waves.get(key);
  const r = rng(seed * 31 + variant * 7 + 3);
  const out = [];
  let prev = 0.5;
  for (let i = 0; i < bars; i++) {
    const u = i / (bars - 1);
    let env = u < 0.12 ? 0.35 + u * 3 : u < 0.46 ? 0.78 : u < 0.58 ? 0.42 : u < 0.92 ? 0.95 : 0.95 - (u - 0.92) * 8;
    if (variant) env = 0.5 + 0.5 * Math.sin(u * (6 + variant * 3) + variant);
    prev = prev * 0.45 + r() * 0.55;
    out.push(Math.max(0.08, env * (0.3 + 0.7 * prev)));
  }
  waves.set(key, out);
  return out;
}
