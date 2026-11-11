// Web drawing of the generated art (the numbers come from artdata.js): covers on a canvas, waveforms as CSS masks.
import { coverSpec, waveBars } from './artdata';

const covers = new Map();
const masks = new Map();

// The accent's colour space where the canvas takes it, so a track's cover and its buttons agree.
let okl = null;
function col([l, c, h, a]) {
  if (okl === null) {
    const x = document.createElement('canvas').getContext('2d');
    x.fillStyle = '#000'; x.fillStyle = 'oklch(0.6 0.1 200)';
    okl = x.fillStyle !== '#000000';
  }
  return okl
    ? `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / ${a.toFixed(3)})`
    : `hsla(${(h - 30).toFixed(1)},${Math.round(c * 480)}%,${Math.round(l * 82)}%,${a.toFixed(3)})`;
}

/** A cover as a data URL. */
export function coverURL(hue, seed) {
  const key = `${hue}:${seed}`;
  if (covers.has(key)) return covers.get(key);
  const spec = coverSpec(hue, seed);
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 320, 320);
  g.addColorStop(0, col(spec.from));
  g.addColorStop(1, col(spec.to));
  x.fillStyle = g;
  x.fillRect(0, 0, 320, 320);
  x.globalCompositeOperation = 'lighter';
  spec.discs.forEach((d) => {
    x.beginPath();
    x.arc(d.cx, d.cy, d.rad, 0, Math.PI * 2);
    x.fillStyle = col(d.fill);
    x.fill();
    x.lineWidth = d.rimWidth;
    x.strokeStyle = col(d.rim);
    x.stroke();
  });
  const url = c.toDataURL('image/jpeg', 0.82);
  covers.set(key, url);
  return url;
}

/** A waveform as a CSS url() of bars, to use as a mask. */
export function waveURL(seed, bars, variant = 0) {
  const key = `${seed}:${bars}:${variant}`;
  if (masks.has(key)) return masks.get(key);
  let out = '';
  waveBars(seed, bars, variant).forEach((v, i) => {
    const h = v * 40;
    out += `<rect x="${i * 3}" y="${((40 - h) / 2).toFixed(1)}" width="2" height="${h.toFixed(1)}" rx="1"/>`;
  });
  const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bars * 3 - 1} 40" preserveAspectRatio="none">${out}</svg>`)}")`;
  masks.set(key, url);
  return url;
}

/** A track's accent as a plain CSS value (for custom properties). */
export const accRaw = (hue) => `oklch(var(--acc-l) var(--acc-c) ${hue})`;
