// Cover art drawn on a canvas, once per track: a handful of out-of-focus highlights in the track's hue.
const cache = new Map();

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cover(hue, seed) {
  const key = `${hue}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  const x = c.getContext('2d');
  const r = rng(seed);
  const g = x.createLinearGradient(0, 0, 320, 320);
  g.addColorStop(0, `hsl(${hue} 45% 13%)`);
  g.addColorStop(1, `hsl(${hue + 40} 50% 6%)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 320, 320);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const cx = r() * 320, cy = r() * 320, rad = 18 + r() * r() * 92;
    const h = hue + (r() - 0.5) * 80, l = 48 + r() * 22, a = 0.1 + r() * 0.24;
    x.beginPath();
    x.arc(cx, cy, rad, 0, Math.PI * 2);
    x.fillStyle = `hsla(${h}, 85%, ${l}%, ${a})`;
    x.fill();
    x.lineWidth = 1.5 + rad / 30;
    x.strokeStyle = `hsla(${h}, 90%, ${l + 14}%, ${a * 0.9})`;
    x.stroke();
  }
  const url = c.toDataURL('image/jpeg', 0.82);
  cache.set(key, url);
  return url;
}

export const trackCover = (t) => cover(t.hue, t.n * 97 + 11);
export const artistCover = (a, i = 0) => cover((a.name.length * 47) % 360, a.since * 3 + i);
export const bg = (url) => ({ backgroundImage: `url(${url})` });
