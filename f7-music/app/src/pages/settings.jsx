import React, { useEffect, useState } from 'react';
import { Page, Navbar, Block, BlockTitle, BlockFooter, List, ListItem, Toggle, f7 } from 'framework7-react';
import { TRACKS } from '../js/data';

// What the phone reports about the screen, read the way a page can read it: useful when the app is opened from the
// home screen and something at the top or the bottom looks wrong.
function measure() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;height:100vh;width:0;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {
    vh: Math.round(parseFloat(cs.height)),
    top: cs.paddingTop,
    bottom: cs.paddingBottom,
  };
  probe.remove();
  const app = document.getElementById('app');
  return {
    ...out,
    inner: `${window.innerWidth} × ${window.innerHeight}`,
    screen: `${window.screen.width} × ${window.screen.height}`,
    app: app ? `${app.offsetWidth} × ${app.offsetHeight}` : '?',
    html: document.documentElement.className || '(无)',
    standalone: String(window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches),
    navStandalone: String(window.navigator.standalone),
    displayMode: ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find((d) => window.matchMedia(`(display-mode: ${d})`).matches) || '?',
    scheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? '深色' : '浅色',
    statusBar: (document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') || {}).content || '(没有)',
    themeColor: Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((x) => x.content).join(', ') || '(没有)',
    visual: window.visualViewport ? `${Math.round(window.visualViewport.width)} × ${Math.round(window.visualViewport.height)}，偏移 ${Math.round(window.visualViewport.offsetTop)}` : '?',
    ua: ((navigator.userAgent.match(/(iPhone|iPad|Macintosh|Android)[^)]*\)/) || [''])[0] + ' ' + (navigator.userAgent.match(/Version\/[\d.]+/) || [''])[0]).trim(),
    url: window.location.pathname,
  };
}

const SettingsPage = () => {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [m, setM] = useState(measure);
  useEffect(() => {
    const update = () => setM(measure());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const t = setTimeout(update, 600);
    return () => { clearTimeout(t); window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update); };
  }, []);

  return (
    <Page name="settings">
      <Navbar title="我的" large />

      <BlockTitle>外观</BlockTitle>
      <List strong inset dividersIos>
        <ListItem title="深色模式">
          {/* not a controlled input: React would put the switch back before Framework7 has read it */}
          <Toggle
            slot="after"
            defaultChecked={dark}
            onToggleChange={(checked) => { f7.setDarkMode(checked); setDark(checked); setM(measure()); }}
          />
        </ListItem>
      </List>
      <BlockFooter>用的是 Framework7 自带的 setDarkMode，没有额外处理。</BlockFooter>

      <BlockTitle>这个 demo</BlockTitle>
      <Block strong inset>
        <p>
          用 Framework7 React 从零搭的，起点是官方生成器的 tabs 模板：四个页签各有自己的页面栈，底部是 Framework7 的页签栏，
          左缘右滑返回也是它自带的。页面外壳没有一行是手写的。
        </p>
        <p>曲目、音乐人和数据都是虚构的，共 {TRACKS.length} 首。没有音频，“播放”只是一个状态。</p>
      </Block>

      <BlockTitle>屏幕信息</BlockTitle>
      <List strong inset dividersIos className="debug">
        <ListItem title="版本" after={__BUILD__} />
        <ListItem title="Framework7" after={`${__F7__} · ${f7.theme}`} />
        <ListItem title="主屏幕模式" after={m.standalone} />
        <ListItem title="html 的类名" after={m.html} />
        <ListItem title="安全区 上 / 下" after={`${m.top} / ${m.bottom}`} />
        <ListItem title="innerWidth × innerHeight" after={m.inner} />
        <ListItem title="100vh" after={`${m.vh}px`} />
        <ListItem title="#app 的大小" after={m.app} />
        <ListItem title="screen" after={m.screen} />
        <ListItem title="visualViewport" after={m.visual} />
        <ListItem title="navigator.standalone" after={m.navStandalone} />
        <ListItem title="display-mode" after={m.displayMode} />
        <ListItem title="系统外观" after={m.scheme} />
        <ListItem title="状态栏样式（meta）" after={m.statusBar} />
        <ListItem title="theme-color（meta）" after={m.themeColor} />
        <ListItem title="系统和浏览器" after={m.ua} />
        <ListItem title="路径" after={m.url} />
      </List>
      <BlockFooter>如果顶部或底部显示不对，把这一块截图发给我。</BlockFooter>
    </Page>
  );
};

export default SettingsPage;
