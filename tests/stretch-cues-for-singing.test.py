#!/usr/bin/env python3
"""Unit smoke for merge/stretch singing cues (XLSub-sized Cantonese karaoke)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "transub-engine" / "runtime" / "Lib" / "site-packages"))

from transub_engine.asr.whisper_fw import merge_cues_for_singing, stretch_cues_for_singing


def test_merge_xlsub_sized_not_mega_line():
    cues = [
        {"start": 34.65, "end": 35.56, "text": "钟声响起，"},
        {"start": 36.69, "end": 37.71, "text": "归家的讯号，"},
        {"start": 38.73, "end": 39.75, "text": "在他生命里，"},
        {"start": 41.97, "end": 42.63, "text": "彷佛带点唏嘘。"},
    ]
    merged = merge_cues_for_singing(cues)
    # XLSub: 钟声响起归家的讯号 | 在他生命里彷佛带点唏嘘 — two lines, not one mega-line.
    assert len(merged) == 2
    assert "钟声响起" in merged[0]["text"] and "归家" in merged[0]["text"]
    assert "生命" not in merged[0]["text"]
    assert "生命" in merged[1]["text"] and "唏嘘" in merged[1]["text"]


def test_merge_xlsub_style_double_phrase():
    # GOLD: 是一生奉献肤色斗争中 (~6.4s); halves may be ~4s apart.
    cues = [
        {"start": 52.29, "end": 53.5, "text": "是一生奉献。"},
        {"start": 54.55, "end": 55.18, "text": "肤色斗争中。"},
    ]
    merged = merge_cues_for_singing(cues)
    assert len(merged) == 1
    assert "奉献" in merged[0]["text"] and "斗争" in merged[0]["text"]


def test_stretch_holds_melisma_without_stealing_next():
    cues = [
        {"start": 38.74, "end": 40.88, "text": "在他生命里"},
        {"start": 41.96, "end": 44.46, "text": "彷佛带点唏嘘"},
        {"start": 47.64, "end": 48.35, "text": "黑色肌肤给他的意义"},
    ]
    out = stretch_cues_for_singing(merge_cues_for_singing(cues), media_end_s=60.0)
    assert len(out) == 2
    # Merged lyric holds ~karaoke length, but must not reach into 黑色 start.
    assert out[0]["end"] - out[0]["start"] >= 5.5
    assert out[0]["end"] < out[1]["start"]
    assert out[0]["end"] <= 47.6


def test_merge_half_lines_across_wider_gap():
    cues = [
        {"start": 47.64, "end": 48.35, "text": "黑色肌肤给他的意义"},
        {"start": 48.45, "end": 49.47, "text": "是一生奉献"},
        {"start": 54.52, "end": 55.18, "text": "肤色斗争中"},
    ]
    merged = merge_cues_for_singing(cues)
    assert any("奉献" in c["text"] and "斗争" in c["text"] for c in merged)
    assert all("黑色" not in c["text"] or "奉献" not in c["text"] for c in merged)


def test_does_not_glue_two_six_char_complete_lines():
    cues = [
        {"start": 77.22, "end": 79.72, "text": "迎接光辉岁月"},
        {"start": 79.82, "end": 82.0, "text": "雨中抱紧自由"},
    ]
    merged = merge_cues_for_singing(cues)
    assert len(merged) == 2


def test_does_not_wall_fill_instrumental_gap():
    cues = [
        {"start": 10.0, "end": 10.5, "text": "问谁又能做到"},
        {"start": 40.0, "end": 40.8, "text": "今天只有残留的躯壳"},
    ]
    out = stretch_cues_for_singing(cues)
    assert out[0]["end"] - out[0]["start"] <= 9.1
    assert out[0]["end"] < 20.0
    assert out[0]["end"] - out[0]["start"] >= 3.5


if __name__ == "__main__":
    test_merge_xlsub_sized_not_mega_line()
    test_merge_xlsub_style_double_phrase()
    test_stretch_holds_melisma_without_stealing_next()
    test_merge_half_lines_across_wider_gap()
    test_does_not_glue_two_six_char_complete_lines()
    test_does_not_wall_fill_instrumental_gap()
    print("ok")
