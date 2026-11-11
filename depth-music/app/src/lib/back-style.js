// How the back button on a pushed page looks. Two ways to compare on a device; kept in localStorage and applied at
// once (a class on <html>, which only changes when the choice does).
//   glass   a circle of glass without a border: blur only, no fill, no edge, no shadow (like the tab row's capsule)
//   plain   no background at all: the arrow alone
const KEY = 'depth-music:back';
export const BACK_STYLES = [
  { key: 'glass', title: '无边框毛玻璃' },
  { key: 'plain', title: '只有箭头' },
];
const valid = (m) => BACK_STYLES.some((x) => x.key === m);
export function getBackStyle() {
  try { const m = localStorage.getItem(KEY); return valid(m) ? m : 'glass'; } catch (e) { return 'glass'; }
}
export function applyBackStyle(m = getBackStyle()) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  BACK_STYLES.forEach((s) => { const on = s.key === m; if (html.classList.contains('back-' + s.key) !== on) html.classList.toggle('back-' + s.key, on); });
}
export function setBackStyle(m) {
  try { localStorage.setItem(KEY, valid(m) ? m : 'glass'); } catch (e) { /* private mode */ }
  applyBackStyle(m);
}
