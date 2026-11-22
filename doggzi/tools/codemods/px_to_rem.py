"""One-off codemod: express size-bearing lengths in rem so the whole site scales from one token
(--root-scale in tokens.css). At the default 100% root size, N/16 rem == N px exactly, so screens
below the desktop breakpoint render pixel-identically (checked by tools/visual).

Converted: font sizes, spacing, widths/heights, radii, positions, layout tokens.
Kept in px (crisp at any scale, like the brand files): borders/strokes, outlines, hard shadows,
transforms/perspective and media-query breakpoints.

Usage: python3 px_to_rem.py <dir> [<dir> ...]
"""
import re
import sys
from pathlib import Path

PX = re.compile(r"(?<![\w.$-])(-?\d+(?:\.\d+)?)px\b")
CSS_PROPS = re.compile(
    r"^(gap|row-gap|column-gap|padding(-\w+)?|margin(-\w+)?|font-size|font|width|height|min-width|min-height|max-width|max-height|"
    r"border-radius|border-\w+-radius|top|right|bottom|left|inset|scroll-margin-top|grid-template-columns|grid-auto-columns|flex|flex-basis|"
    r"background-size|--container|--gutter|--header-h|--mark-size|--r-\w+|--s-\d+|--fs-\w+)$"
)
TSX_KEYS = ("fontSize|gap|rowGap|columnGap|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|margin|marginTop|marginRight|marginBottom|marginLeft|"
            "width|height|minWidth|minHeight|maxWidth|maxHeight|top|left|right|bottom|borderRadius|inset|flexBasis|scrollMarginTop")
TSX_NUM = re.compile(rf"\b({TSX_KEYS}):\s*(-?\d+(?:\.\d+)?)(?=\s*[,}}\n])")
TSX_STR = re.compile(rf"\b({TSX_KEYS}):\s*\"([^\"]*\dpx[^\"]*)\"")


def rem(n: float) -> str:
    v = round(n / 16, 6)
    s = f"{v:.6f}".rstrip("0").rstrip(".")
    return "0" if s in ("0", "-0") else f"{s}rem"


def conv_value(v: str) -> str:
    return PX.sub(lambda m: rem(float(m.group(1))), v)


def css(text: str) -> str:
    out, i, depth = [], 0, 0
    # Walk declaration blocks; only touch "prop: value" pairs inside braces (never selectors or @media).
    tokens = re.split(r"([{};])", text)
    stack = []
    for t in tokens:
        if t == "{":
            stack.append(t)
            out.append(t)
            continue
        if t == "}":
            stack and stack.pop()
            out.append(t)
            continue
        if t == ";" or not stack or ":" not in t or t.strip().startswith("@"):
            out.append(t)
            continue
        m = re.match(r"(\s*(?:/\*.*?\*/\s*)*)([\w-]+)(\s*:\s*)(.*)$", t, re.S)
        if m and CSS_PROPS.match(m.group(2)):
            out.append(m.group(1) + m.group(2) + m.group(3) + conv_value(m.group(4)))
        else:
            out.append(t)
    return "".join(out)


def tsx(text: str) -> str:
    text = TSX_NUM.sub(lambda m: m.group(0) if float(m.group(2)) == 0 else f'{m.group(1)}: "{rem(float(m.group(2)))}"', text)
    text = TSX_STR.sub(lambda m: f'{m.group(1)}: "{conv_value(m.group(2))}"', text)
    return text


changed = 0
for d in sys.argv[1:]:
    for p in Path(d).rglob("*"):
        if p.suffix not in (".css", ".tsx") or "node_modules" in p.parts:
            continue
        s = p.read_text()
        n = css(s) if p.suffix == ".css" else tsx(s)
        if n != s:
            p.write_text(n)
            changed += 1
print(f"converted {changed} files")
