# -*- coding: utf-8 -*-
# Genereaza lib/proiect-cunostinte-date.ts (baza de cunostinte pentru "Intreaba proiectul")
# din documentele oficiale ale proiectului: plan de afaceri (PDF), buget (XLSX), act aditional si
# memoriu justificativ (PDF). La un act aditional nou: rulezi din nou cu fisierele noi.
#   python3 scripts/proiect-cunostinte.py --versiune AA3 --plan plan.pdf --buget buget.xlsx --act act.pdf --memoriu memoriu.pdf
import argparse, json, re, subprocess, warnings
warnings.filterwarnings('ignore')
import openpyxl

ap = argparse.ArgumentParser()
ap.add_argument('--versiune', required=True)
ap.add_argument('--plan', required=True)
ap.add_argument('--buget', required=True)
ap.add_argument('--act')
ap.add_argument('--memoriu')
ap.add_argument('--out', default='lib/proiect-cunostinte-date.ts')
a = ap.parse_args()

ZGOMOT = re.compile(r'^(PROSOCIAL - PROgres prin antreprenoriat.*|ASOCIATIA CLUBUL SPORTIV|SMART ATLETIC|ASOCIATIA INSTITUTUL PENTRU|ORASE VIZIONARE|2BE GROUP S\.R\.L\.|\d{1,3})$')

def nr_pagini(cale):
    r = subprocess.run(['pdfinfo', cale], capture_output=True, text=True)
    m = re.search(r'Pages:\s+(\d+)', r.stdout)
    return int(m.group(1)) if m else 1

def pdf_tot(cale):
    out = []
    for i in range(1, nr_pagini(cale) + 1):
        r = subprocess.run(['pdftotext', '-layout', '-f', str(i), '-l', str(i), cale, '-'], capture_output=True, text=True)
        linii = [re.sub(r'[ \t]{3,}', '   ', l.rstrip()) for l in r.stdout.split('\n')]
        linii = [l for l in linii if l.strip() and not ZGOMOT.match(l.strip())]
        if linii: out.append(f'[pag. {i}]\n' + '\n'.join(linii))
    return '\n\n'.join(out)

def xlsx(cale):
    wb = openpyxl.load_workbook(cale, data_only=True)
    out = []
    for ws in wb.worksheets:
        if ws.title.lower().startswith('mapare'): continue
        rows = []
        for r in ws.iter_rows(values_only=True):
            cells = [(f'{c:.2f}'.rstrip('0').rstrip('.') if isinstance(c, float) else str(c)).strip() for c in r if c not in (None, '')]
            cells = [c for c in cells if c and c != '#REF!']
            if not cells: continue
            # randuri goale de sablon: "4.31 | 0 | 0 | True"
            if re.fullmatch(r'[0-9]+(\.[0-9]+)*\.?', cells[0]) and set(cells[1:]) <= {'0', '1', 'True', 'False'}: continue
            rows.append(' | '.join(cells))
        out.append(f'=== Foaia „{ws.title.strip()}” ===\n' + '\n'.join(rows))
    return '\n\n'.join(out)

docs = [
    {'id': 'plan', 'titlu': f'Anexa 3 — Planul de afaceri ({a.versiune})', 'text': pdf_tot(a.plan)},
    {'id': 'buget', 'titlu': f'Anexa 4 — Bugetul planului de afaceri ({a.versiune}, Excel)', 'text': xlsx(a.buget)},
]
if a.act: docs.append({'id': 'act', 'titlu': f'Actul adițional ({a.versiune})', 'text': pdf_tot(a.act)})
if a.memoriu: docs.append({'id': 'memoriu', 'titlu': f'Memoriul justificativ ({a.versiune})', 'text': pdf_tot(a.memoriu)})

with open(a.out, 'w', encoding='utf-8') as f:
    f.write('// GENERAT de scripts/proiect-cunostinte.py - nu edita manual. Documentele oficiale ale proiectului\n')
    f.write('// PROSOCIAL (AB TEXTILE), folosite de AI-ul "Intreaba proiectul" ca sursa de adevar.\n')
    f.write(f'export const VERSIUNE_DOCUMENTE = {json.dumps(a.versiune)}\n')
    f.write('export interface DocumentProiect { id: string; titlu: string; text: string }\n')
    f.write('export const DOCUMENTE_PROIECT: DocumentProiect[] = ' + json.dumps(docs, ensure_ascii=False, indent=1) + '\n')
for d in docs: print(d['id'], len(d['text']))
