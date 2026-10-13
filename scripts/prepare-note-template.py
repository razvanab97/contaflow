"""Prepare only the editable slots of the reference Anexa 1 (Nota de estimare) package.

Source: the user's approved document (dosar "23. aer conditionat", Anexa 1, 12.10.2026).
Everything except the variable text slots stays byte-identical: header/footer/logos, styles,
page geometry, table grid and header row, fixed paragraphs.
"""
import base64
import html
import io
import json
import re
import sys
import zipfile
from pathlib import Path

source, destination = map(Path, sys.argv[1:3])
paragraph = re.compile(r"<w:p(?:\s[^>]*)?>.*?</w:p>", re.S)
run = re.compile(r"<w:r(?:\s[^>]*)?>.*?</w:r>", re.S)
text_node = re.compile(r"(<w:t(?:\s[^>]*)?>)(.*?)(</w:t>)", re.S)


def contents(xml):
    return "".join(html.unescape(m[2]) for m in text_node.finditer(xml))


def replace_text(xml, old, new):
    """Change a text range across runs without changing their properties."""
    start = contents(xml).index(old)
    end = start + len(old)
    offset = 0

    def patch(match):
        nonlocal offset
        value = html.unescape(match[2])
        left, right = offset, offset + len(value)
        offset = right
        if right <= start or left >= end:
            return match[0]
        value = value[:max(0, start - left)] + (new if left <= start < right else "") + value[max(0, end - left):]
        opening = match[1]
        if "xml:space=" not in opening:
            opening = opening[:-1] + ' xml:space="preserve">'
        return opening + html.escape(value, quote=False) + match[3]

    return text_node.sub(patch, xml)


def single_run(p, placeholder):
    """Keep the paragraph properties and the first run's formatting; one run with the placeholder."""
    runs = list(run.finditer(p))
    first = runs[0][0]
    rpr = re.search(r"<w:rPr>.*?</w:rPr>", first, re.S)
    opening = re.match(r"<w:r(?:\s[^>]*)?>", first)[0]
    new_run = opening + (rpr[0] if rpr else "") + '<w:t xml:space="preserve">' + placeholder + "</w:t></w:r>"
    return p[:runs[0].start()] + new_run + p[runs[-1].end():]


with zipfile.ZipFile(source) as original:
    xml = original.read("word/document.xml").decode()

    # Paragraph text (exact, from the reference) -> how it becomes editable.
    plain = {
        "nr. 1 / data 12.10.2026": ("nr. 1 / data 12.10.2026", "nr. %%numar%% / data %%data%%"),
        "Denumirea beneficiarului de ajutor de minimis: AB TEXTILE S.R.L.": ("AB TEXTILE S.R.L.", "%%beneficiar%%"),
        "Denumirea achiziției: Aer condiționat": ("Aer condiționat", "%%achizitie%%"),
        "Tip achiziție: Produse": ("Produse", "%%tip%%"),
        "Nume, prenume: Abunei Elena": ("Abunei Elena", "%%reprezentant%%"),
        "Reprezentant legal al AB TEXTILE S.R.L.": ("AB TEXTILE S.R.L.", "%%beneficiar%%"),
    }
    seen = set()

    def patch_paragraph(match):
        p = match[0]
        value = contents(p)
        if value in plain:
            seen.add(value)
            old, new = plain[value]
            return replace_text(p, old, new)
        if value.startswith("Prezenta notă are ca scop"):
            seen.add("prezenta")
            return replace_text(p, "achiziției de Aer condiționat,", "achiziției de %%achizitie%%,")
        if value.startswith("Pentru stabilirea valorii estimate au fost analizate"):
            seen.add("pentru")
            # Doar cifra (run-ul ei e ingrosat in referinta) - formatarea ramane a ei.
            return replace_text(p, "3", "%%nr_oferte%%")
        if value.startswith("În urma analizei ofertelor consultate"):
            seen.add("justificare")
            # Generator re-splits this run: "NR n" and "<valoare> lei fara TVA" become bold, like the reference.
            return single_run(p, "%%justificare%%")
        return p

    # The table is handled separately so its grid and header row stay untouched.
    table = re.search(r"<w:tbl>.*?</w:tbl>", xml, re.S)[0]
    xml = xml.replace(table, "%%NOTE_TABLE%%", 1)
    xml = paragraph.sub(patch_paragraph, xml)
    missing = set(plain) | {"prezenta", "pentru", "justificare"}
    assert seen == missing, f"Reference text not found: {missing - seen}"

    rows = re.findall(r"<w:tr(?:\s[^>]*)?>.*?</w:tr>", table, re.S)
    assert len(rows) == 4, "Expected header + 3 offer rows"
    keys = iter(["index", "operator", "product", "specs", "qty", "price", "total"])

    def patch_cell(match):
        cell = match[0]
        p = paragraph.search(cell)
        return cell[:p.start()] + single_run(p[0], "%%line_" + next(keys) + "%%") + cell[p.end():]

    row = re.sub(r"<w:tc>.*?</w:tc>", patch_cell, rows[1], flags=re.S)
    table = table.replace("".join(rows[1:]), row, 1)
    xml = xml.replace("%%NOTE_TABLE%%", table)

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as prepared:
        for entry in original.infolist():
            prepared.writestr(entry, xml.encode() if entry.filename == "word/document.xml" else original.read(entry.filename))

templates = json.loads(destination.read_text())
templates["nota"] = base64.b64encode(output.getvalue()).decode()
destination.write_text(json.dumps(templates, ensure_ascii=False, indent=2) + "\n")
print("nota template prepared from", source)
