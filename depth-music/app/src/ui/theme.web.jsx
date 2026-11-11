// The theme on the web. Colours are CSS variables (src/styles.css), so components never re-render when it changes;
// theme.js is the iOS / Android twin with plain values.
//
// Light <-> dark is never a jump: the new theme spreads out in a circle from the button (a view transition, about
// 820 ms). Where there are no view transitions, every colour cross-fades.
import * as React from 'react';
import { reduced } from './platform';
import { Icon } from './Icon';

// react-native-web only lets through colour strings it knows or ones that start with var(: so an oklch() rides in as
// the fallback of a variable that is never set.
const COLORS = {
  bg: 'var(--bg)', fg: 'var(--fg)', fg2: 'var(--fg2)', fg3: 'var(--fg3)', hair: 'var(--hair)', fill: 'var(--fill)', ink: 'var(--ink)',
  glass: 'var(--glass)', glassEdge: 'var(--glass-edge)', sheet: 'var(--sheet)', waveRest: 'var(--wave-rest)', onAcc: 'var(--on-acc)',
  like: 'var(--like)', lift: 'var(--lift)',
  /** a track's accent, from its hue */
  acc: (hue) => `var(--_, oklch(var(--acc-l) var(--acc-c) ${hue}))`,
  accSoft: (hue) => `var(--_, oklch(var(--acc-l) var(--acc-c) ${hue} / .16))`,
};
export const useColors = () => COLORS;
export const ThemeProvider = ({ children }) => children;
/** Returns switchTheme(anchorRef): the new theme spreads from that element. */
export const useThemeSwitch = () => (anchor) => switchTheme(anchor && anchor.current);
/** The icon on the theme button: a moon in the light theme, a sun in the dark one (CSS picks). */
export const ThemeGlyph = () => (
  <>
    <Icon name="moon" size={20} className="i-moon" color="var(--fg)" />
    <Icon name="sun" size={21} className="i-sun" color="var(--fg)" />
  </>
);

function syncBars() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => { el.media = ''; el.content = bg; });
}

export function switchTheme(el) {
  const root = document.documentElement, at = root.getAttribute('data-theme');
  const dark = at ? at === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const apply = () => { root.setAttribute('data-theme', dark ? 'light' : 'dark'); syncBars(); };
  if (reduced()) { apply(); return; }
  if (document.startViewTransition && el) {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${far}px at ${x}px ${y}px)`] },
        { duration: 820, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
    return;
  }
  root.classList.add('theming');
  apply();
  setTimeout(() => root.classList.remove('theming'), 650);
}
