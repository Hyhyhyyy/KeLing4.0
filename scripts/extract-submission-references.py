"""Read user-supplied submission references without altering the originals."""
from pathlib import Path
import hashlib
import argparse
import json
import zipfile
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path, help="Directory containing the five user-supplied DOCX references")
SOURCE = parser.parse_args().source
OUT = Path(__file__).resolve().parents[1] / ".cache" / "submission-references"
NAMES = ["创新赛必读文档(1).docx", "附件4：《XXXXXX需求文档》模板.docx", "附件5：《XXXXXX技术设计》模板.docx", "附件4 课灵智学编排平台需求文档.docx", "附件5 课灵智学编排平台技术设计.docx"]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
OUT.mkdir(parents=True, exist_ok=True)
manifest = []
for name in NAMES:
    path = SOURCE / name
    paragraphs = []
    with zipfile.ZipFile(path) as package:
        for part in package.namelist():
            if part == "word/document.xml" or (part.startswith(("word/header", "word/footer")) and part.endswith(".xml")):
                root = ET.fromstring(package.read(part))
                for index, p in enumerate(root.findall(".//w:p", NS)):
                    text = "".join(t.text or "" for t in p.findall(".//w:t", NS))
                    if text.strip():
                        style = p.find("w:pPr/w:pStyle", NS)
                        paragraphs.append({"part": part, "index": index, "style": style.get("{" + NS["w"] + "}val") if style is not None else None, "text": text})
    result = {"name": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "paragraphs": paragraphs}
    (OUT / (path.stem + ".json")).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / (path.stem + ".txt")).write_text("\n".join(p["text"] for p in paragraphs), encoding="utf-8")
    manifest.append({"name": name, "sha256": result["sha256"], "paragraphCount": len(paragraphs)})
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
