# -*- coding: utf-8 -*-
"""Post-install self-check for fix-amd-rocm-qwen-runtime.bat (portable copy next to bat)."""
from __future__ import annotations

import sys


def main() -> int:
    try:
        import torch
        import torchaudio
    except Exception as err:
        msg = str(err)
        print("IMPORT_FAIL", err)
        if "torch_new_stable_ivalue" in msg or "127" in msg or "libtorchaudio" in msg.lower():
            print(
                "HINT: torch/torchaudio ABI mismatch. Need torch 2.12.0+rocm10.1.0 "
                "with torchaudio 2.11.0+rocm10.1.0 (not torchaudio 2.11.0.2+rocm10.0.0)."
            )
        return 1

    tv = str(getattr(torch, "__version__", "") or "")
    av = str(getattr(torchaudio, "__version__", "") or "")
    print("torch=", tv)
    print("torchaudio=", av)
    tv_l = tv.lower()
    av_l = av.lower()
    if "+rocm" not in tv_l:
        print("TORCH_NOT_ROCM")
        return 2
    if "+rocm" not in av_l and ".rocm" not in av_l:
        print("TORCHAUDIO_NOT_ROCM")
        return 2
    # Prefer 10.1 pair; still accept 10.0 if import already succeeded.
    if "2.11.0.2" in av_l and "rocm10.0" in av_l:
        print("WARN_OLD_AUDIO_PIN torchaudio 2.11.0.2+rocm10.0.0 is known to break on some Win AMD builds")

    try:
        from mpmath.libmp import bitcount  # noqa: F401
        import mpmath

        print("mpmath=", getattr(mpmath, "__version__", "?"), "bitcount=OK")
    except Exception as err:
        print("MPMATH_FAIL", err)
        return 3

    try:
        import numpy as np

        nv = str(getattr(np, "__version__", "") or "")
        print("numpy=", nv)
        if nv.startswith("2.5"):
            print("NUMPY_TOO_NEW need numpy>=2.0,<2.5")
            return 4
    except Exception as err:
        print("NUMPY_FAIL", err)
        return 4

    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
