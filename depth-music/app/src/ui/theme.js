// Light <-> dark, never as a jump: the new theme spreads out in a circle from the button (a view transition, about
// 820 ms). Where there are no view transitions, every colour cross-fades.
import { reduced } from './platform';

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
