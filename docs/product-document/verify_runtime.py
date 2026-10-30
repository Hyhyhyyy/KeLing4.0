"""Record renderer readiness without creating an unverified Word deliverable."""
from pathlib import Path
import importlib.util
import json
import shutil
import sys

SKILL = Path("C:/Users/lenovo/.codex/plugins/cache/openai-primary-runtime/documents/26.1020.11618/skills/documents")
spec = importlib.util.spec_from_file_location("packaged_docx_renderer", SKILL / "render_docx.py")
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
evidence = {"python": sys.executable, "renderer": str(SKILL / "render_docx.py"), "soffice_on_path": shutil.which("soffice.exe"), "docx_pages_rendered": 0, "docx_created": False}
try:
    evidence["resolved_renderer_executable"] = renderer._resolve_soffice()
    evidence["status"] = "Executable found; verify it belongs to the bundled runtime before use"
except FileNotFoundError as error:
    evidence["status"] = "Renderer unavailable"
    evidence["reason"] = str(error)
evidence["fallback"] = "Deliver the verified content as Markdown and a same-source offline HTML; do not deliver an unrendered DOCX"
target = Path(__file__).parent / "renderer_evidence.json"
target.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
print(json.dumps(evidence, ensure_ascii=False, indent=2))
