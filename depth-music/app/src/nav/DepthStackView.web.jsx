// One tab's page stack: a DepthStack (src/lib/depth-stack.js) whose pages hold React Native screens. The stack owns the
// layers, the gestures and the depth; React only puts a screen into each page (a portal), the way scroll-gesture's
// React Navigation navigator does for NavStack.
//
//   <DepthStackView ref={stackRef} active={tab === 0} label="发现" root={Discover} screens={{ artist: Artist, … }} />
//   const nav = useNav();  nav.push('artist', { id: 'vl' });  nav.pop();  nav.popToRoot();
import * as React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DepthStack } from '../lib/depth-stack';
import { NavContext } from './context';

export const DepthStackView = React.forwardRef(function DepthStackView({ active, label, root: Root, screens }, ref) {
  const section = React.useRef(null);
  const host = React.useRef(null);
  const stack = React.useRef(null);
  const [rootEl, setRootEl] = React.useState(null);
  const [pages, setPages] = React.useState([]);            // { key, name, params, inner }

  React.useLayoutEffect(() => {
    const ds = DepthStack(host.current);
    stack.current = ds;
    setRootEl(ds.root);
    ds.onChange(() => setPages((cur) => (cur.every((p) => ds.has(p.key)) ? cur : cur.filter((p) => ds.has(p.key)))));
    return () => { ds.destroy(); stack.current = null; };
  }, []);

  const nav = React.useMemo(() => ({
    push(name, params) {
      const ds = stack.current;
      if (!ds || !screens[name]) return;
      const key = name + ':' + JSON.stringify(params || {});
      const page = ds.push(key);
      if (!page) return;
      // in the same task, so the page is not shown empty for a frame
      flushSync(() => setPages((cur) => [...cur.filter((p) => p.key !== key), { key, name, params: params || {}, inner: page.inner }]));
    },
    pop() { if (stack.current) stack.current.pop(); },
    popToRoot() { if (stack.current) stack.current.popToRoot(); },
    scrollToTop() { if (stack.current) stack.current.rootPage.scrollTo({ top: 0, behavior: 'smooth' }); },
    get depth() { return stack.current ? stack.current.depth : 0; },
  }), [screens]);
  React.useImperativeHandle(ref, () => nav, [nav]);

  // a tab that is not showing takes no focus and is not read out
  React.useLayoutEffect(() => { if (section.current) section.current.inert = !active; }, [active]);

  return (
    <section ref={section} className={'tabview' + (active ? ' on' : '')} aria-label={label}>
      {/* The stack lives in an element of its own, whose class React never writes: DepthStack puts its own classes on
          its host (the depth values hang on them), and React replaces the whole class attribute of an element whenever
          a className it renders changes, as the one above does on every tab switch. */}
      <div ref={host} className="stack" />
      <NavContext.Provider value={nav}>
        {rootEl ? createPortal(<Root />, rootEl) : null}
        {pages.map((p) => {
          const Screen = screens[p.name];
          return createPortal(<Screen {...p.params} />, p.inner, p.key);
        })}
      </NavContext.Provider>
    </section>
  );
});

export default DepthStackView;
