"""Build the offline product introduction from its single Markdown source.

Run with the Python returned by load_workspace_dependencies. No network,
third-party installs or browser automation are used. This is not a DOCX renderer.
"""
from pathlib import Path
import hashlib
import html
import json
import re

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "PRODUCT_INTRODUCTION.md"
OUTPUT = ROOT / "releases" / "课灵产品介绍.html"


def link_target(target):
    # Both docs and releases sit one level below the repository root.
    if "://" not in target and not target.startswith(("../", "#")):
        return "../docs/" + target
    return target


def inline(text):
    pattern = re.compile(r"\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)")
    result, cursor = [], 0
    for match in pattern.finditer(text):
        result.append(html.escape(text[cursor:match.start()]))
        if match.group(1) is not None:
            result.append("<strong>" + html.escape(match.group(1)) + "</strong>")
        elif match.group(2) is not None:
            result.append("<code>" + html.escape(match.group(2)) + "</code>")
        else:
            result.append('<a href="' + html.escape(link_target(match.group(4)), quote=True) + '">' + html.escape(match.group(3)) + "</a>")
        cursor = match.end()
    result.append(html.escape(text[cursor:]))
    return "".join(result)


def build():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    blocks = ['<section class="doc-page">']
    first_section = True
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("# "):
            blocks.append("<h1>" + inline(line[2:]) + "</h1>")
        elif line.startswith("## "):
            if not first_section:
                blocks.append('</section><section class="doc-page">')
            first_section = False
            blocks.append("<h2>" + inline(line[3:]) + "</h2>")
        elif line.startswith("!["):
            match = re.fullmatch(r"!\[([^]]*)\]\(([^)]+)\)", line)
            if not match:
                raise ValueError("Unsupported image syntax")
            alt, path = match.groups()
            blocks.append('<figure class="hero"><img src="' + html.escape(path, quote=True) + '" alt="' + html.escape(alt, quote=True) + '"></figure>')
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", cell) for cell in cells):
                    rows.append(cells)
                i += 1
            blocks.append("<table><thead><tr>" + "".join("<th scope=\"col\">" + inline(cell) + "</th>" for cell in rows[0]) + "</tr></thead><tbody>")
            for row in rows[1:]:
                blocks.append("<tr>" + "".join("<td>" + inline(cell) + "</td>" for cell in row) + "</tr>")
            blocks.append("</tbody></table>")
            continue
        elif re.match(r"\d+\. ", line):
            blocks.append("<ol>")
            while i < len(lines) and re.match(r"\d+\. ", lines[i].strip()):
                blocks.append("<li>" + inline(re.sub(r"^\d+\. ", "", lines[i].strip())) + "</li>")
                i += 1
            blocks.append("</ol>")
            continue
        else:
            style = ""
            if "→" in line:
                style = ' class="learning-flow"'
            elif line.startswith("主视觉原画"):
                style = ' class="caption"'
            elif line.startswith("版本 3.2.2") or line == "Web 与 Kotlin Android 学习应用":
                style = ' class="subtitle"'
            blocks.append("<p" + style + ">" + inline(line) + "</p>")
        i += 1
    blocks.append("</section>")
    css = """
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#edf1f3;color:#20262c;font:16px/1.75 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',Arial,sans-serif}main{max-width:880px;margin:28px auto}.doc-page{background:white;padding:48px 58px;margin:0 0 24px}h1,h2,h3{color:#000;line-height:1.3;font-weight:700}h1{font-size:34px;margin:0 0 12px}h2{font-size:24px;margin:8px 0 22px}p{margin:0 0 16px}a{color:#215b62;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.subtitle{color:#4e5961;margin-bottom:8px}.hero{margin:20px 0 8px;text-align:center}.hero img{width:100%;max-height:310px;object-fit:contain;display:block}.caption{font-size:12px;color:#59646b;margin-bottom:22px}.learning-flow{text-align:center;line-height:1.8;font-size:16px;margin:18px 0}ol{padding-left:1.6em;margin:12px 0 20px}li{padding-left:.2em;margin:0 0 13px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:18px 0 22px;font-size:14px;line-height:1.65}th,td{border:1px solid #d9d9d9;padding:10px 12px;vertical-align:middle;text-align:left;overflow-wrap:break-word}th{background:#e7eff4;color:#000;font-weight:700}th:first-child{width:23%}th:nth-child(2){width:29%}code{font:0.92em/1.4 Consolas,monospace;overflow-wrap:anywhere}strong{font-weight:700}@media(max-width:650px){main{margin:0}.doc-page{padding:24px 20px;margin-bottom:10px}h1{font-size:28px}h2{font-size:22px}table{font-size:12px}th,td{padding:7px 8px}.hero img{max-height:250px}}@page{size:Letter portrait;margin:0.6in 0.72in}@media print{html,body{background:white}body{font-size:11.2pt;line-height:1.55}main{max-width:none;margin:0}.doc-page{margin:0;padding:0;break-before:page;page-break-before:always}.doc-page:first-child{break-before:auto;page-break-before:auto}h1{font-size:27pt;margin-bottom:9pt}h2{font-size:17pt;margin:0 0 14pt;break-after:avoid}p{margin-bottom:9pt;orphans:3;widows:3}.subtitle{font-size:10pt;margin-bottom:5pt}.hero{margin:12pt 0 4pt;break-inside:avoid}.hero img{max-height:2.65in}.caption{font-size:9pt;margin-bottom:14pt}.learning-flow{font-size:11.3pt;margin:11pt 0}ol{margin:8pt 0 12pt}li{margin-bottom:8pt;orphans:2;widows:2}table{font-size:10pt;line-height:1.45;margin:12pt 0 14pt}th,td{padding:7pt 8pt}thead{display:table-header-group}tr{break-inside:avoid}a{color:#213e44}code{font-size:9.6pt}}
"""
    document = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="课灵 Web 与 Kotlin Android 学习应用的功能、使用方式与真实能力边界"><title>课灵产品介绍</title><style>' + css + '</style></head><body><main>' + "\n".join(blocks) + '</main></body></html>'
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8", newline="\n")
    report = {"source": str(SOURCE), "html": str(OUTPUT), "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "html_sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(), "sections": document.count('class="doc-page"'), "images": document.count("<img "), "tables": document.count("<table>"), "external_asset_dependencies": 0, "docx_generated": False, "docx_pages_rendered": 0}
    (Path(__file__).parent / "build_evidence.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
