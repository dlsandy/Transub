# -*- coding: utf-8 -*-
"""Sync JA ASR domain fallback tables from shared/ja-asr-domain-fixes.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SSOT = ROOT / "shared" / "ja-asr-domain-fixes.json"
JS = ROOT / "src" / "js" / "mt-sanitize-core.js"
PY = (
    ROOT
    / "transub-engine"
    / "runtime"
    / "Lib"
    / "site-packages"
    / "transub_engine"
    / "cue_cleanup.py"
)


def main() -> None:
    pairs = json.loads(SSOT.read_text(encoding="utf-8"))
    assert isinstance(pairs, list) and pairs
    pairs = sorted(
        pairs,
        key=lambda p: (-len(str(p["from"])), str(p["from"])),
    )

    js_items = []
    for p in pairs:
        frm = str(p["from"]).replace("\\", "\\\\").replace("'", "\\'")
        to = str(p["to"]).replace("\\", "\\\\").replace("'", "\\'")
        js_items.append(f"        {{ from: '{frm}', to: '{to}' }},")
    js_block = (
        "    const JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK = Object.freeze([\n"
        + "\n".join(js_items)
        + "\n    ]);"
    )

    py_items = []
    for p in pairs:
        frm = str(p["from"]).replace("\\", "\\\\").replace('"', '\\"')
        to = str(p["to"]).replace("\\", "\\\\").replace('"', '\\"')
        py_items.append(f'        ("{frm}", "{to}"),')
    py_block = (
        "    pairs = (\n"
        + "\n".join(py_items)
        + "\n    )\n"
        + "    return tuple((re.compile(re.escape(frm)), to) for frm, to in pairs)"
    )

    js_text = JS.read_text(encoding="utf-8")
    js_pat = re.compile(
        r"    const JA_ASR_DOMAIN_FIX_PAIRS_FALLBACK = Object\.freeze\(\[.*?\n    \]\);",
        re.S,
    )
    if not js_pat.search(js_text):
        raise SystemExit("JS fallback block not found")
    JS.write_text(js_pat.sub(js_block, js_text, count=1), encoding="utf-8")

    py_text = PY.read_text(encoding="utf-8")
    py_pat = re.compile(
        r"    pairs = \(.*?\n    \)\n"
        r"    return tuple\(\(re\.compile\(re\.escape\(frm\)\), to\) for frm, to in pairs\)",
        re.S,
    )
    if not py_pat.search(py_text):
        raise SystemExit("Python fallback block not found")
    PY.write_text(py_pat.sub(py_block, py_text, count=1), encoding="utf-8")
    print(f"synced {len(pairs)} pairs -> JS + Python fallbacks")


if __name__ == "__main__":
    main()
