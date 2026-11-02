"""Regression smoke for job_pipeline extract (NameError guards)."""
from __future__ import annotations

import ast
import builtins
import os
import tempfile
from pathlib import Path

import transub_engine.mt as mt_mod
from transub_engine.job_pipeline import execute_job_pipeline, parse_execute_job_request


def _assert_no_undefined_names(src: str) -> None:
    tree = ast.parse(src)
    builtin_names = set(dir(builtins))

    class Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.scopes: list[set[str]] = [set()]
            self.issues: list[tuple[int, str]] = []

        def define(self, name: str | None) -> None:
            if name:
                self.scopes[-1].add(name)

        def known(self, name: str) -> bool:
            return name in builtin_names or any(name in s for s in self.scopes)

        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            self.define(node.name)
            self.scopes.append(set())
            for a in (
                list(getattr(node.args, "posonlyargs", []))
                + list(node.args.args)
                + list(node.args.kwonlyargs)
            ):
                self.define(a.arg)
            if node.args.vararg:
                self.define(node.args.vararg.arg)
            if node.args.kwarg:
                self.define(node.args.kwarg.arg)
            for stmt in node.body:
                self.visit(stmt)
            self.scopes.pop()

        visit_AsyncFunctionDef = visit_FunctionDef  # type: ignore[assignment]

        def visit_Import(self, node: ast.Import) -> None:
            for a in node.names:
                self.define(a.asname or a.name.split(".")[0])

        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            for a in node.names:
                if a.name != "*":
                    self.define(a.asname or a.name)

        def visit_Assign(self, node: ast.Assign) -> None:
            self.visit(node.value)
            for t in node.targets:
                for n in self._tnames(t):
                    self.define(n)

        def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
            if node.value:
                self.visit(node.value)
            for n in self._tnames(node.target):
                self.define(n)

        def visit_For(self, node: ast.For) -> None:
            self.visit(node.iter)
            for n in self._tnames(node.target):
                self.define(n)
            for s in node.body:
                self.visit(s)
            for s in node.orelse:
                self.visit(s)

        def visit_With(self, node: ast.With) -> None:
            for it in node.items:
                self.visit(it.context_expr)
                if it.optional_vars:
                    for n in self._tnames(it.optional_vars):
                        self.define(n)
            for s in node.body:
                self.visit(s)

        def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
            if node.type:
                self.visit(node.type)
            if node.name:
                self.define(node.name)
            for s in node.body:
                self.visit(s)

        def visit_ListComp(self, node: ast.ListComp) -> None:
            self.scopes.append(set())
            for g in node.generators:
                self.visit(g.iter)
                for n in self._tnames(g.target):
                    self.define(n)
                for i in g.ifs:
                    self.visit(i)
            self.visit(node.elt)
            self.scopes.pop()

        visit_SetComp = visit_ListComp  # type: ignore[assignment]
        visit_GeneratorExp = visit_ListComp  # type: ignore[assignment]

        def visit_DictComp(self, node: ast.DictComp) -> None:
            self.scopes.append(set())
            for g in node.generators:
                self.visit(g.iter)
                for n in self._tnames(g.target):
                    self.define(n)
                for i in g.ifs:
                    self.visit(i)
            self.visit(node.key)
            self.visit(node.value)
            self.scopes.pop()

        def visit_Lambda(self, node: ast.Lambda) -> None:
            self.scopes.append(set())
            for a in node.args.args:
                self.define(a.arg)
            self.visit(node.body)
            self.scopes.pop()

        def visit_Name(self, node: ast.Name) -> None:
            if (
                isinstance(node.ctx, ast.Load)
                and not self.known(node.id)
                and not node.id.startswith("__")
            ):
                self.issues.append((node.lineno, node.id))

        def _tnames(self, t: ast.AST) -> list[str]:
            if isinstance(t, ast.Name):
                return [t.id]
            if isinstance(t, (ast.Tuple, ast.List)):
                out: list[str] = []
                for e in t.elts:
                    out.extend(self._tnames(e))
                return out
            if isinstance(t, ast.Starred):
                return self._tnames(t.value)
            return []

    v = Visitor()
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            v.define(n.name)
        else:
            v.visit(n)
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            v.visit(n)
    assert not v.issues, "undefined names: " + ", ".join(
        f"L{ln}:{name}" for ln, name in v.issues[:30]
    )


def main() -> None:
    pkg = (
        Path(__file__).resolve().parents[2]
        / "transub-engine"
        / "runtime"
        / "Lib"
        / "site-packages"
        / "transub_engine"
    )
    for rel in (
        "job_pipeline.py",
        "asr/whisper_anime_island.py",
        "asr/qwen3_infer.py",
        "asr/island_workspace.py",
    ):
        _assert_no_undefined_names((pkg / rel).read_text(encoding="utf-8"))
    src_path = pkg / "job_pipeline.py"

    media = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    media.write(b"RIFF$$$$WAVEfmt ")
    media.close()
    try:
        cfg = parse_execute_job_request(
            {
                "mediaPath": media.name,
                "beamSize": 3,
                "task": "translate_mt",
                "mtBackend": "llama",
                "mtLlama": {"baseUrl": "http://127.0.0.1:9", "model": "x"},
                "language": "ja",
                "targetLanguage": "zh",
                "asrModel": "qwen3-asr-1.7b-ja-anime-galgame",
            }
        )
        assert cfg.beam_size == 3, cfg.beam_size
        assert hasattr(cfg, "media_time_offset")

        cues = [{"start": 0.0, "end": 1.0, "text": "こんにちは"}]

        def fake_translate_cues(*_a, **_k):
            return [{"start": 0.0, "end": 1.0, "text": "你好"}]

        orig = mt_mod.translate_cues
        mt_mod.translate_cues = fake_translate_cues  # type: ignore[assignment]
        try:
            out_dir = tempfile.mkdtemp()
            result = execute_job_pipeline(
                {
                    "mediaPath": media.name,
                    "outputDir": out_dir,
                    "task": "translate_mt",
                    "mtBackend": "llama",
                    "mtLlama": {"baseUrl": "http://127.0.0.1:9", "model": "x"},
                    "language": "ja",
                    "targetLanguage": "zh",
                    "asrModel": "qwen3-asr-1.7b-ja-anime-galgame",
                    "subFormats": ["srt"],
                    "beamSize": 3,
                    "_checkpoint": {"stage": "asr_done", "sourceCues": cues},
                }
            )
            assert result.get("task") == "translate_mt", result
            assert result.get("mtModel") == "llama", result
            print(
                "RESUME_MT_OK",
                result.get("mtModel"),
                len(result.get("outputs") or []),
            )
        finally:
            mt_mod.translate_cues = orig  # type: ignore[assignment]
    finally:
        try:
            os.unlink(media.name)
        except OSError:
            pass


if __name__ == "__main__":
    main()
