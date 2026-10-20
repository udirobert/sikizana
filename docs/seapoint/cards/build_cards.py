#!/usr/bin/env python3
"""Build cards/index.html from index.template.html + the real mascot components.

The owls are lifted verbatim from web/components/SikiMascot.tsx and
ZanaMascot.tsx, so a card can never drift from the product's artwork again.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
WEB = ROOT.parents[2] / "web" / "components"

CONFETTI = ["#38bdf8", "#fb923c", "#fcd34d", "#fb7185"]  # sky / orange / stone-warm / rose


def mascot_svg(component: str, px: int, confetti: bool = False) -> str:
    src = (WEB / component).read_text()
    body = src[src.index("<svg"):src.index("</svg>") + len("</svg>")]

    # Strip the unused clipPath def — five instances would collide on one id.
    body = re.sub(r"<defs>.*?</defs>", "", body, flags=re.S)
    # The celebrate confetti is conditional JSX; card C injects its own.
    cut = body.find('{mood === "celebrate"')
    if cut != -1:
        body = body[:cut] + body[body.index("</svg>", cut):]
    body = re.sub(r"\{/\*.*?\*/\}", "", body, flags=re.S)  # JSX comments

    body = body.replace("className=", "class=")
    body = body.replace("shapeRendering=", "shape-rendering=")
    body = re.sub(r'style=\{\{ transformOrigin: "([^"]+)" \}\}',
                  lambda m: 'style="transform-origin: %s"' % m.group(1), body)
    body = body.replace("width={size}", f'width="{px}"')
    body = body.replace("height={size}", f'height="{px}"')
    body = body.replace('aria-hidden="true"', '')
    body = re.sub(r"\n\s*", "\n", body)

    if confetti:
        pieces = "".join(
            f'<rect class="siki-confetti-piece siki-confetti-{i}" x="{20 + i * 11}" y="10" '
            f'width="5" height="5" fill="{CONFETTI[i % 4]}" />'
            for i in range(8)
        )
        insert_at = body.rindex("</svg>")
        body = body[:insert_at] + f'<g class="siki-confetti">{pieces}</g>' + body[insert_at:]

    return body.strip()


tpl = (ROOT / "parts" / "index.template.html").read_text()
subs = {
    "__OWLS_SIKI_180__": mascot_svg("SikiMascot.tsx", 180),
    "__OWLS_SIKI_280__": mascot_svg("SikiMascot.tsx", 280),
    "__OWLS_ZANA_280__": mascot_svg("ZanaMascot.tsx", 280),
    "__OWLS_ZANA_150__": mascot_svg("ZanaMascot.tsx", 150),
    "__OWL_C_SIKI__": mascot_svg("SikiMascot.tsx", 150, confetti=True),
}
for key, val in subs.items():
    assert key in tpl, f"template lost placeholder {key}"
    tpl = tpl.replace(key, val)

leftover = re.findall(r"__[A-Z_0-9]+__", tpl)
assert not leftover, f"unsubstituted placeholders: {leftover}"

(ROOT / "index.html").write_text(tpl)
rects = tpl.count("<rect ")
print(f"wrote index.html — {rects} mascot rects, {tpl.count('<svg')} svg instances")
