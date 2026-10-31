"""Check source hashes, offline assets and local references without claiming layout QA."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "releases" / "课灵产品介绍.html"
SOURCE = ROOT / "docs" / "PRODUCT_INTRODUCTION.md"
EVIDENCE = ROOT / ".cache" / "product-document"


class Inventory(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.assets = []
        self.sections = 0
        self.scripts = 0
        self.images = 0
        self.tables = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "a":
            self.links.append(values.get("href", ""))
        if tag in {"img", "script", "link"}:
            self.assets.append(values.get("src", values.get("href", "")))
        if tag == "section":
            self.sections += 1
        if tag == "script":
            self.scripts += 1
        if tag == "img":
            self.images += 1
            assert values.get("alt"), "Image alt text is missing"
        if tag == "table":
            self.tables += 1


content = OUTPUT.read_text(encoding="utf-8")
inventory = Inventory()
inventory.feed(content)
metadata = json.loads((EVIDENCE / "build_evidence.json").read_text(encoding="utf-8"))
source_matches = hashlib.sha256(SOURCE.read_bytes()).hexdigest() == metadata["source_sha256"]
html_matches = hashlib.sha256(OUTPUT.read_bytes()).hexdigest() == metadata["html_sha256"]
local_refs = [ref for ref in inventory.links + inventory.assets if ref and not urlparse(ref).scheme and not ref.startswith("#")]
missing = [str((OUTPUT.parent / unquote(ref)).resolve()) for ref in local_refs if not (OUTPUT.parent / unquote(ref)).exists()]
external_assets = [ref for ref in inventory.assets if urlparse(ref).scheme]
evidence = {"source_hash_matches_build": source_matches, "html_hash_matches_build": html_matches, "sections": inventory.sections, "images": inventory.images, "tables": inventory.tables, "external_asset_dependencies": external_assets, "missing_local_references": missing, "scripts": inventory.scripts, "word_pages_visually_inspected": 0, "html_browser_visual_inspection": "Performed separately by main task if available; structural checks do not establish rendered page count"}
(EVIDENCE / "content_verification.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
print(json.dumps(evidence, ensure_ascii=False, indent=2))
assert source_matches and html_matches
assert inventory.sections == 6 and inventory.images == 1 and inventory.tables == 2
assert not missing, "Generated document contains missing local references"
assert not external_assets and not inventory.scripts
assert not re.search(r"@import|url\([\"']?https?://", content)
