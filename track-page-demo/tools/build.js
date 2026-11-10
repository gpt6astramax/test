// Builds a standalone, self-running HTML page from the canvas artboard source,
// so the CSS, markup and Component logic stay identical between the two.
const fs = require('fs');
const [, , srcPath, outPath] = process.argv;
const src = fs.readFileSync(srcPath, 'utf8');

const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
const fontLink = src.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
const markup = src.slice(src.indexOf('</helmet>') + 9, src.indexOf('</x-dc>')).trim();
const propsAttr = src.match(/data-props='([^']+)'/)[1];
const props = JSON.parse(propsAttr);
const sOpen = src.indexOf('>', src.indexOf('<script type="text/x-dc"')) + 1;
const logic = src.slice(sOpen, src.indexOf('</script>', sOpen)).trim();

const defaults = {};
for (const k of Object.keys(props)) if (k[0] !== '$') defaults[k] = props[k].default;

const runtime = String.raw`
// Minimal runtime for the artboard's template: {{holes}}, <sc-for>, <sc-if>, refs, events.
class DCLogic {
  constructor(props) { this.props = props || {}; }
  setState(u) {
    const patch = typeof u === 'function' ? u(this.state, this.props) : u;
    if (!patch) return;
    this.state = Object.assign({}, this.state, patch);
    if (this.__dcUpdate) this.__dcUpdate();
  }
  forceUpdate() { if (this.__dcUpdate) this.__dcUpdate(); }
}
const DC = (() => {
  const HOLE = /\{\{([^}]+)\}\}/g;
  const whole = (s) => { const m = /^\s*\{\{([^}]+)\}\}\s*$/.exec(s || ''); return m ? m[1].trim() : null; };
  function resolveName(name, scope, root) {
    for (let s = scope; s; s = s.parent) {
      if (name === '$index') return s.index;
      if (s.name === name) { const list = lookup(s.listExpr, s.parent, root); return list ? list[s.index] : undefined; }
    }
    return root[name];
  }
  function lookup(path, scope, root) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    const parts = path.split('.');
    let v = resolveName(parts[0], scope, root);
    for (let i = 1; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  const interp = (tpl, scope, root) => tpl.replace(HOLE, (_, p) => { const v = lookup(p, scope, root); return v == null ? '' : String(v); });
  function apply(b, vals) {
    if (b.kind === 'text') { const v = interp(b.tpl, b.scope, vals); if (b.last !== v) { b.last = v; b.node.nodeValue = v; } }
    else if (b.kind === 'attr') { const v = interp(b.tpl, b.scope, vals); if (b.last !== v) { b.last = v; b.node.setAttribute(b.name, v); } }
    else { const d = lookup(b.expr, b.scope, vals) ? 'contents' : 'none'; if (b.last !== d) { b.last = d; b.node.style.display = d; } }
  }
  function render(node, scope, ctx, out) {
    if (node.nodeType === 3) {
      const t = document.createTextNode(node.nodeValue);
      if (node.nodeValue.indexOf('{{') >= 0) { const b = { kind: 'text', node: t, tpl: node.nodeValue, scope }; ctx.bindings.push(b); apply(b, ctx.vals); }
      out.appendChild(t);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'sc-for') {
      const listExpr = whole(node.getAttribute('list'));
      const as = node.getAttribute('as');
      const list = lookup(listExpr, scope, ctx.vals) || [];
      for (let k = 0; k < list.length; k++) {
        const sc = { parent: scope, name: as, listExpr: listExpr, index: k };
        node.childNodes.forEach((c) => render(c, sc, ctx, out));
      }
      return;
    }
    if (tag === 'sc-if') {
      const w = document.createElement('span');
      const b = { kind: 'if', node: w, expr: whole(node.getAttribute('value')), scope };
      ctx.bindings.push(b); apply(b, ctx.vals);
      node.childNodes.forEach((c) => render(c, scope, ctx, w));
      out.appendChild(w);
      return;
    }
    const el = document.createElementNS(node.namespaceURI, tag);
    for (const a of Array.from(node.attributes)) {
      const expr = whole(a.value);
      if (a.name === 'ref') { ctx.refs.push([lookup(expr, scope, ctx.vals), el]); continue; }
      if (a.name.slice(0, 2) === 'on' && expr) {
        el.addEventListener(a.name.slice(2).toLowerCase(), (e) => { const fn = lookup(expr, scope, ctx.vals); if (typeof fn === 'function') fn(e); });
        continue;
      }
      if (a.value.indexOf('{{') >= 0) { const b = { kind: 'attr', node: el, name: a.name, tpl: a.value, scope }; ctx.bindings.push(b); apply(b, ctx.vals); }
      else el.setAttribute(a.name, a.value);
    }
    node.childNodes.forEach((c) => render(c, scope, ctx, el));
    out.appendChild(el);
  }
  function mount(Component, host, tpl, props) {
    const comp = new Component(props);
    const ctx = { bindings: [], refs: [], vals: comp.renderVals() };
    const frag = document.createDocumentFragment();
    tpl.content.childNodes.forEach((c) => render(c, null, ctx, frag));
    host.appendChild(frag);
    ctx.refs.forEach(([fn, el]) => { if (typeof fn === 'function') fn(el); });
    comp.__dcUpdate = () => {
      ctx.vals = comp.renderVals();
      ctx.bindings.forEach((b) => apply(b, ctx.vals));
      if (comp.componentDidUpdate) comp.componentDidUpdate();
    };
    if (comp.componentDidMount) comp.componentDidMount();
    return comp;
  }
  return { mount };
})();
`;

const shell = String.raw`
const comp = DC.mount(Component, document.getElementById('device'), document.getElementById('dc-template'), ${JSON.stringify(defaults)});

// Fit the 390×844 frame to the window.
const frame = document.getElementById('frame');
const device = document.getElementById('device');
function fit() {
  const narrow = innerWidth < 760;
  const bar = document.getElementById('modebar').offsetHeight;
  document.documentElement.style.setProperty('--bar', bar + 'px');
  const innerH = innerHeight - bar;
  document.body.classList.toggle('narrow', narrow);
  const pad = narrow ? 0 : 56;
  const side = narrow ? 0 : 316;
  let s = Math.min((innerH - pad) / 844, (innerWidth - pad - side) / 390);
  if (!narrow) s = Math.min(1, s);
  frame.style.width = (390 * s).toFixed(1) + 'px';
  frame.style.height = (844 * s).toFixed(1) + 'px';
  device.style.transform = 'scale(' + s.toFixed(4) + ')';
}
addEventListener('resize', fit);
fit();
const app = device.querySelector('.df-app');
if (app && !document.body.classList.contains('narrow')) app.focus({ preventScroll: true });

// Motion controls. Moving a slider freezes the deck part-way through a page turn for a moment;
// the residue slider shows the resting state when there is a previous page behind.
document.querySelectorAll('[data-prop]').forEach((input) => {
  const prop = input.dataset.prop;
  const out = document.querySelector('[data-out="' + prop + '"]');
  const unit = input.dataset.unit || '';
  const show = () => { out.textContent = input.value + unit; };
  show();
  input.addEventListener('input', () => {
    comp.props[prop] = Number(input.value);
    comp.applyVars();
    comp.paint();
    show();
    if (!(prop === 'ghost' && comp.index > 0)) comp.previewHalf();
  });
});
// Compare ways of drawing the blur.
const modeBtns = document.querySelectorAll('[data-mode]');
function showMode(m) { modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); }
modeBtns.forEach((b) => b.addEventListener('click', () => showMode(comp.setMode(b.dataset.mode))));
showMode(comp.mode);
if (!comp.tl) modeBtns[0].title = '这个浏览器不支持滚动时间线，会退回 JS';
// Auto paging, so the modes can be compared without swiping.
let autoT = 0;
let dir = 1;
const autoBtn = document.getElementById('auto');
autoBtn.addEventListener('click', () => {
  const on = autoBtn.getAttribute('aria-pressed') !== 'true';
  autoBtn.setAttribute('aria-pressed', String(on));
  clearInterval(autoT);
  if (on) autoT = setInterval(() => {
    const n = comp.navIndex();
    if (n + dir > comp.tracks.length - 1 || n + dir < 0) dir = -dir;
    comp.go(n + dir);
  }, 1000);
});
// Stress test: keep changing the blur of the whole current page.
const stressBtn = document.getElementById('stress');
stressBtn.addEventListener('click', () => {
  const on = stressBtn.getAttribute('aria-pressed') !== 'true';
  stressBtn.setAttribute('aria-pressed', String(on));
  comp.setStress(on);
});
// What is actually driving the blur right now, and how often JS writes it.
const diagEl = document.getElementById('diag');
const how = { timeline: 'CSS 滚动驱动 · 跟手（JS 不参与）', transition: 'CSS 过渡 · 按时间播放（JS 只在越过阈值时切一次 class）', js: 'JS 每帧写 filter（有 will-change）', nolayer: 'JS 每帧写 filter（无 will-change）', backdrop: 'JS 每帧写 backdrop-filter' };
setInterval(() => {
  const w = comp.jsWrites;
  comp.jsWrites = 0;
  diagEl.innerHTML = '当前：<b>' + how[comp.mode] + '</b> · JS 写入 <b>' + w + '</b> 次/秒' +
    (loadMs ? ' · 主线程负载 <b>+' + loadMs + 'ms</b>/帧' : '') +
    (comp.tl ? '' : ' · 此浏览器不支持滚动时间线，"CSS 跟手"会退回 JS');
}, 1000);
// Refresh-rate check by eye: one dot moved by a CSS animation (compositor), one by JS every rAF
// (main thread). JS reads the CSS animation's own clock, so both are always at the same position.
const hzBtn = document.getElementById('hzBtn');
const hzPanel = document.getElementById('hz');
const hzCss = document.getElementById('hzCss');
const hzJs = document.getElementById('hzJs');
let hzRaf = 0;
function hzStep() {
  const a = hzCss.getAnimations ? hzCss.getAnimations()[0] : null;
  const track = hzJs.parentElement.clientWidth - 10;
  if (a && a.currentTime != null) {
    const ph = (a.currentTime % 1000) / 500;           // 0..2 over one back-and-forth (0.5 s each way)
    const f = ph <= 1 ? ph : 2 - ph;
    hzJs.style.transform = 'translateX(' + (f * track).toFixed(2) + 'px)';
  }
  hzRaf = requestAnimationFrame(hzStep);
}
hzBtn.addEventListener('click', () => {
  const on = hzBtn.getAttribute('aria-pressed') !== 'true';
  hzBtn.setAttribute('aria-pressed', String(on));
  hzPanel.hidden = !on;
  cancelAnimationFrame(hzRaf);
  if (on) hzRaf = requestAnimationFrame(hzStep);
  fit();
});
// ← → turn pages even when focus sits on a toolbar button (not while a slider has focus).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  if (app && app.contains(e.target)) return;                 // the page handles its own keys
  if (e.target && e.target.tagName === 'INPUT') return;
  e.preventDefault();
  comp.go(comp.navIndex() + (e.key === 'ArrowRight' ? 1 : -1));
});
// Sustained main-thread load: every frame the main thread stays busy for N ms more, like a heavy page.
// Native scrolling and compositor animations keep going; anything driven from the main thread stutters.
let loadMs = 0;
let loadRaf = 0;
const loadBtns = document.querySelectorAll('[data-load]');
const showLoad = () => loadBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.load) === loadMs)));
function loadStep() {
  if (!loadMs) { loadRaf = 0; return; }
  const end = performance.now() + loadMs;
  while (performance.now() < end) { /* busy */ }
  loadRaf = requestAnimationFrame(loadStep);
}
loadBtns.forEach((b) => b.addEventListener('click', () => {
  loadMs = Number(b.dataset.load);
  showLoad();
  cancelAnimationFrame(loadRaf);
  loadRaf = loadMs ? requestAnimationFrame(loadStep) : 0;
}));
showLoad();
// Block the main thread for 3 s. Whatever keeps moving meanwhile runs off the main thread
// (native scrolling, Core Animation); whatever freezes needs the main thread.
const blockBtn = document.getElementById('block');
blockBtn.addEventListener('click', () => {
  blockBtn.disabled = true;
  blockBtn.textContent = '阻塞中…';
  requestAnimationFrame(() => setTimeout(() => {
    const end = performance.now() + 3000;
    while (performance.now() < end) { /* busy */ }
    stamps = [];
    blockBtn.disabled = false;
    blockBtn.textContent = '阻塞 3 秒';
  }, 30));
});
// Frame meter (main thread only): rAF callbacks in the last second and the longest gap between two.
// Compositor animations and native scrolling can run faster than this and are not counted.
const fpsEl = document.getElementById('fps');
let stamps = [];
let lastShow = 0;
(function meter(t) {
  stamps.push(t);
  while (stamps.length && stamps[0] < t - 1000) stamps.shift();
  if (t - lastShow > 250 && stamps.length > 1) {
    lastShow = t;
    let worst = 0;
    for (let i = 1; i < stamps.length; i++) worst = Math.max(worst, stamps[i] - stamps[i - 1]);
    fpsEl.innerHTML = '主线程 <b>' + (stamps.length - 1) + '</b> fps · 最长 <b class="' + (worst > 34 ? 'bad' : '') + '">' + Math.round(worst) + '</b>ms';
  }
  requestAnimationFrame(meter);
})(performance.now());
document.querySelectorAll('[data-accent]').forEach((b) => {
  b.addEventListener('click', () => {
    comp.props.accent = b.dataset.accent;
    comp.applyVars();
    document.querySelectorAll('[data-accent]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
});
`;

const sw = props.accent.options.map((c, i) =>
  '<button type="button" class="sw" data-accent="' + c + '" aria-label="强调色 ' + c + '" aria-pressed="' + (i === 0) + '" style="background:' + c + '"></button>').join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>曲目页 UI demo · 景深翻页</title>
${fontLink}
<style>
html,body{height:100%}
body{margin:0;background:#060607;color:#E9E8E3;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}
.shell{position:fixed;left:0;right:0;bottom:0;top:var(--bar,60px);display:flex;align-items:center;justify-content:center;gap:56px}
.modebar{position:fixed;left:0;right:0;top:0;z-index:10;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 12px 8px;font:500 12px/1 Inter,system-ui,sans-serif}
.mrow{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 10px;max-width:100%}
body.narrow .mrow{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;scrollbar-width:none;padding:0 2px 2px;-webkit-overflow-scrolling:touch}
body.narrow .mrow::-webkit-scrollbar{display:none}
.mrow>*{flex:none}
.seglab{align-self:center;padding:0 6px 0 9px;color:#8A8A85;white-space:nowrap}
.seg{display:flex;padding:3px;border-radius:999px;background:#17181b;border:1px solid rgba(255,255,255,.08)}
.seg button,.mb{border:0;border-radius:999px;padding:8px 12px;background:transparent;color:#B9B8B3;font:inherit;cursor:pointer;white-space:nowrap}
.seg button[aria-pressed=true]{background:#E9E8E3;color:#0C0D0F}
.mb{border:1px solid rgba(255,255,255,.12)}
.mb[aria-pressed=true]{border-color:#D7F25A;color:#D7F25A}
.mb:disabled{opacity:.6}
.fps{font:500 12px/1 'JetBrains Mono',ui-monospace,Menlo,monospace;color:#E9E8E3;min-width:150px;text-align:center}
.fps b{font-weight:500}.fps .bad{color:#FF8A5B}
.diag{text-align:center;font:500 11.5px/1.4 Inter,system-ui,sans-serif;color:#9A9994}
.diag b{color:#E9E8E3;font-weight:600}
.hz{display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:4px}
.hz[hidden]{display:none}
.hzrow{display:flex;align-items:center;gap:10px;font:500 11.5px/1 Inter,system-ui,sans-serif;color:#B9B8B3}
.hzrow span{width:112px;text-align:right;white-space:nowrap}
.hztrack{position:relative;width:min(240px,52vw);height:10px;border-radius:5px;background:#1b1c20;overflow:hidden;container-type:inline-size}
.hzdot{position:absolute;left:0;top:0;width:10px;height:10px;border-radius:50%;background:#D7F25A}
#hzCss{animation:hzMove .5s linear infinite alternate;will-change:transform}
@keyframes hzMove{from{transform:translateX(0)}to{transform:translateX(calc(100cqw - 10px))}}
.hz p{margin:0;max-width:520px;font:400 11.5px/1.5 Inter,system-ui,sans-serif;color:#8A8A85;text-align:center}
.frame{position:relative;flex:none}
#device{position:absolute;left:0;top:0;width:390px;height:844px;transform-origin:0 0;border-radius:44px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.09),0 50px 120px -30px rgba(0,0,0,.95)}
.panel{width:260px;display:flex;flex-direction:column;gap:18px;font-size:13px}
.panel h2{margin:0;font:600 18px/1.2 'Familjen Grotesk','Helvetica Neue',Arial,sans-serif;letter-spacing:-.01em}
.panel .cap{margin:6px 0 0;font:500 10.5px/1 'JetBrains Mono',ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8A8A85}
.panel label{display:flex;flex-direction:column;gap:8px;color:#C9C8C3}
.panel .row{display:flex;justify-content:space-between;align-items:baseline}
.panel output{font:500 12px/1 'JetBrains Mono',ui-monospace,Menlo,monospace;color:#E9E8E3}
.panel input[type=range]{width:100%;accent-color:var(--panel-accent,#D7F25A)}
.panel .sws{display:flex;gap:10px}
.panel .sw{width:28px;height:28px;border-radius:999px;border:2px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);cursor:pointer;padding:0}
.panel .sw[aria-pressed=true]{border-color:#E9E8E3}
.panel .keys{margin:4px 0 0;color:#8A8A85;line-height:1.5}
body.narrow .panel{display:none}
body.narrow #device{border-radius:0;box-shadow:none}
${css}
</style>
</head>
<body>
<div class="modebar" id="modebar">
<div class="mrow">
<div class="seg" role="group" aria-label="模糊的实现方式"><button type="button" data-mode="timeline">CSS 跟手</button><button type="button" data-mode="transition">CSS 按时间</button><button type="button" data-mode="js">JS·filter</button><button type="button" data-mode="nolayer">JS·filter 无图层</button><button type="button" data-mode="backdrop">JS·backdrop</button></div>
<div class="seg" role="group" aria-label="主线程负载"><span class="seglab">主线程负载</span><button type="button" data-load="0">无</button><button type="button" data-load="20">+20ms</button><button type="button" data-load="50">+50ms</button><button type="button" data-load="120">+120ms</button></div>
<button type="button" class="mb" id="block">阻塞 3 秒</button>
<button type="button" class="mb" id="auto" aria-pressed="false">自动翻页</button>
<button type="button" class="mb" id="stress" aria-pressed="false">持续改 blur</button>
<button type="button" class="mb" id="hzBtn" aria-pressed="false">刷新率目测</button>
<span class="fps" id="fps">— fps</span>
</div>
<span class="diag" id="diag"></span>
<div class="hz" id="hz" hidden>
<div class="hzrow"><span>CSS 动画 · 合成器</span><div class="hztrack"><i class="hzdot" id="hzCss"></i></div></div>
<div class="hzrow"><span>JS rAF · 主线程</span><div class="hztrack"><i class="hzdot" id="hzJs"></i></div></div>
<p>两个点任何时刻都在同一位置，只是刷新的次数不同。上面的明显更顺、拖影更短，说明合成器跑得比主线程快（通常就是 120）；两个看起来一样，说明合成器也只有 60。</p>
</div>
</div>
<div class="shell">
<div class="frame" id="frame"><div id="device"></div></div>
<aside class="panel" aria-label="动效参数">
<h2>景深翻页</h2>
<p class="cap">翻走的页</p>
<label><span class="row"><span>模糊</span><output data-out="exitBlur"></output></span><input type="range" data-prop="exitBlur" data-unit="px" min="${props.exitBlur.min}" max="${props.exitBlur.max}" step="${props.exitBlur.step}" value="${props.exitBlur.default}"></label>
<label><span class="row"><span>缩放</span><output data-out="exitScale"></output></span><input type="range" data-prop="exitScale" min="${props.exitScale.min}" max="${props.exitScale.max}" step="${props.exitScale.step}" value="${props.exitScale.default}"></label>
<label><span class="row"><span>下沉</span><output data-out="exitDrop"></output></span><input type="range" data-prop="exitDrop" data-unit="px" min="${props.exitDrop.min}" max="${props.exitDrop.max}" step="${props.exitDrop.step}" value="${props.exitDrop.default}"></label>
<label><span class="row"><span>残影（留在背后的上一页）</span><output data-out="ghost"></output></span><input type="range" data-prop="ghost" min="${props.ghost.min}" max="${props.ghost.max}" step="${props.ghost.step}" value="${props.ghost.default}"></label>
<p class="cap">强调色</p>
<div class="sws">${sw}</div>
<p class="keys">手机直接左右滑；电脑用触控板左右滑、鼠标拖动或 ← →。页内上下滚动。拖动滑杆会定格到翻页一半的画面。</p>
</aside>
</div>
<template id="dc-template">
${markup}
</template>
<script>
${runtime}
${logic}
${shell}
</script>
</body>
</html>
`;
fs.writeFileSync(outPath, html);
console.log('wrote', outPath, html.length, 'bytes');
