// Checks that every {{hole}} in the artboard resolves against renderVals(), without a browser.
// Usage: python3 tools/lint.py canvas/Main.dc.html /tmp/script.js /tmp/holes.json && node tools/smoke.js /tmp/script.js /tmp/holes.json
const fs = require('fs');
const assert = require('assert');
const code = fs.readFileSync(process.argv[2], 'utf8');
const holes = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

class DCLogic {
  constructor(props) { this.props = props || {}; }
  setState(u) { this.state = Object.assign({}, this.state, typeof u === 'function' ? u(this.state, this.props) : u); }
}
const Component = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
const c = new Component({});
const v = c.renderVals();
const scopes = { t: v.pages[0], s: v.pages[0].similar[0], g: v.pages[1].genres[0], m: v.pages[1].moods[0], d: v.dots[0] };
for (const h of holes) {
  if (h === 'true' || h === 'false') continue;
  const parts = h.split('.');
  const inScope = parts[0] in scopes;
  if (!inScope && !(parts[0] in v)) throw new Error('unresolved hole ' + h);
  let cur = inScope ? scopes[parts[0]] : v[parts[0]];
  for (const k of parts.slice(1)) {
    if (cur == null || !(k in cur)) throw new Error('unresolved hole ' + h);
    cur = cur[k];
  }
}
assert.strictEqual(v.pages.length, 11);
assert.strictEqual(v.pages[0].range, '0.0000% 20.0000%');
assert.strictEqual(v.pages[10].range, '100.0000% 120.0000%');
assert.strictEqual(v.trackW, '4290px');
console.log('holes ok:', holes.length);
