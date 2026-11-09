import json
import re
import sys
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

src = open(sys.argv[1], encoding="utf-8").read()


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.props = None
        self.script = None
        self._in_dc_script = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k, v in attrs:
            if v is None and k not in ("data-dc-script",):
                self.errors.append(f"valueless attribute {k} on <{tag}> line {self.getpos()[0]}")
        if tag == "script" and a.get("type") == "text/x-dc":
            self.props = a.get("data-props")
            self._in_dc_script = True
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        if tag not in VOID:
            self.errors.append(f"self-closed non-void <{tag}/> line {self.getpos()[0]}")

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"stray </{tag}> line {self.getpos()[0]}")
            return
        top, line = self.stack.pop()
        if top != tag:
            self.errors.append(f"</{tag}> at line {self.getpos()[0]} closes <{top}> opened line {line}")

    def handle_data(self, data):
        if self._in_dc_script and data.strip():
            self.script = data

    def handle_endtag_script(self):
        pass


p = P()
p.feed(src)
p.close()
if p.stack:
    p.errors.append(f"unclosed: {p.stack}")

props = json.loads(p.props)
print("data-props keys:", list(props))

# hole paths inside <x-dc>
xdc = src[src.index("<x-dc>"): src.index("</x-dc>")]
holes = sorted(set(h.strip() for h in re.findall(r"\{\{(.*?)\}\}", xdc)))
open(sys.argv[2], "w", encoding="utf-8").write(p.script)
json.dump(holes, open(sys.argv[3], "w"))
print("holes:", len(holes))
print("errors:", p.errors or "none")
