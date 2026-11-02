#!/usr/bin/env python3
"""Transub local Laya / System One HTTP server (OpenDecider).

Uses settings-injected HF_ENDPOINT / proxy env, and passes endpoint= into
huggingface_hub.snapshot_download so mirrors are honored even when library
defaults were cached incorrectly.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any


def _normalize_endpoint(raw: str) -> str:
    return str(raw or "").strip().rstrip("/")


def boot_hub_env(cli_endpoint: str = "") -> str:
    """Force Hub env *before* importing huggingface_hub / transformers."""
    preferred = _normalize_endpoint(
        cli_endpoint
        or os.environ.get("TRANSUB_LAYA_HF_ENDPOINT")
        or os.environ.get("HF_ENDPOINT")
        or ""
    )
    # Empty means official Hub (match Transub network settings).
    if preferred:
        os.environ["HF_ENDPOINT"] = preferred
    else:
        os.environ.pop("HF_ENDPOINT", None)
        preferred = "https://huggingface.co"
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")
    os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")
    os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "30")
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    return preferred


def ensure_model_local(name_or_path: str, endpoint: str, revision: str | None = None) -> str:
    from pathlib import Path

    path = Path(name_or_path).expanduser()
    if (path / "opendecider.json").exists():
        print(f"[laya] using local model folder: {path}", flush=True)
        return str(path)

    from huggingface_hub import snapshot_download

    print(f"[laya] downloading {name_or_path} via {endpoint}", flush=True)
    kwargs: dict[str, Any] = {"repo_id": name_or_path}
    if revision:
        kwargs["revision"] = revision
    # Explicit endpoint beats stale import-time defaults.
    if endpoint:
        kwargs["endpoint"] = endpoint
    local = snapshot_download(**kwargs)
    print(f"[laya] model ready: {local}", flush=True)
    return str(local)


def build_app(model_name: str, endpoint: str):
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import JSONResponse
    from opendecider import load

    local = ensure_model_local(model_name, endpoint)
    print(f"[laya] loading OpenDecider from {local}", flush=True)
    model = load(local)
    try:
        loaded_name = (model.meta or {}).get("name") or model_name
    except Exception:
        loaded_name = model_name
    print(f"[laya] model loaded: {loaded_name}", flush=True)

    app = FastAPI(title="Transub Laya System One", version="1.0")

    @app.get("/health")
    def health():
        return {"ok": True, "model": loaded_name, "hf_endpoint": endpoint}

    @app.get("/v1/models")
    def models():
        return {"object": "list", "data": [{"id": loaded_name, "object": "model"}]}

    @app.post("/v1/systemone")
    def systemone(payload: dict[str, Any]):
        state = payload.get("state")
        questions = payload.get("questions")
        if questions is None or not isinstance(questions, dict) or not questions:
            raise HTTPException(status_code=400, detail="questions must be a non-empty object")
        try:
            result = model.system_one(state=state, questions=questions)
        except Exception as err:  # noqa: BLE001 — surface to client
            import traceback
            print(f"[laya] systemone failed ({len(questions)} q): {err}", flush=True)
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(err)) from err
        return JSONResponse(result)

    return app


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Transub local OpenDecider System One server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=39283)
    parser.add_argument("--model", default="manjunathshiva/opendecider-nano")
    parser.add_argument(
        "--hf-endpoint",
        default="",
        help="Hugging Face Hub endpoint (e.g. https://hf-mirror.com). Empty = official.",
    )
    args = parser.parse_args(argv)

    endpoint = boot_hub_env(args.hf_endpoint)
    print(f"[laya] HF_ENDPOINT={endpoint}", flush=True)
    print(f"[laya] HTTP_PROXY={os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy') or ''}", flush=True)
    print(f"[laya] binding http://{args.host}:{args.port}/v1/systemone", flush=True)

    try:
        import uvicorn
    except ImportError:
        print("[laya] missing uvicorn — pip install fastapi uvicorn", file=sys.stderr, flush=True)
        return 2

    app = build_app(args.model, endpoint)
    uvicorn.run(app, host=args.host, port=int(args.port), log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
