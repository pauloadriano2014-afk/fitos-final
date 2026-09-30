# Passo 1: lê o PDF oficial do IBGE "Pesquisa de Orçamentos Familiares 2008-2009 - Tabelas de Composição Nutricional dos
# Alimentos Consumidos no Brasil" (351 páginas) e extrai as Tabelas 1 a 5 -> ibge_composicao_raw.json
#   Tabela 1 (págs. 36-96):   energia, proteína, lipídios, carboidrato, fibra
#   Tabela 2 (págs. 97-157):  colesterol, AG saturados/mono/poli/linoléico/linolênico/trans, açúcar total e de adição
#   Tabela 3 (págs. 158-218): cálcio, magnésio, manganês, fósforo, ferro, sódio, sódio de adição, potássio, cobre, zinco, selênio
#   Tabela 4 (págs. 219-279): retinol, vit. A (RAE), tiamina, riboflavina, niacina, niacina (NE), piridoxina, cobalamina, folato, vit. D, E, C
#   Tabela 5 (págs. 280-340): fonte de referência de cada linha (1 NDSR, 2 TACO, 3 alimentos regionais, 7 rótulos, 8 mista...)
# Uso: python3 1_extrair_pdf.py caminho/composicao.pdf   (precisa: pip install pymupdf)
import re, json, sys
import pymupdf as fitz

d = fitz.open(sys.argv[1] if len(sys.argv) > 1 else 'composicao.pdf')
T = {1: (36, 96), 2: (97, 157), 3: (158, 218), 4: (219, 279), 5: (280, 340)}
COLS = {
    1: ['kcal', 'protein', 'fat', 'carbs', 'fiber'],
    2: ['cholesterol', 'sat', 'mono', 'poly', 'linoleic', 'linolenic', 'trans', 'sugar', 'addedSugar'],
    3: ['ca', 'mg', 'mn', 'p', 'fe', 'na', 'naAdded', 'k', 'cu', 'zn', 'se'],
    4: ['retinol', 'vitA', 'b1', 'b2', 'b3', 'b3ne', 'b6', 'b12', 'folate', 'vitD', 'vitE', 'vitC'],
}
NUM = re.compile(r'^-?\d+(?:,\d+)?\*?$')
MISSING = {'-', 'Tr', 'NA', '...', '..', 'x'}
isval = lambda s: bool(NUM.match(s)) or s in MISSING

def lines_of(n):
    a, b = T[n]
    out = []
    for p in range(a - 1, b):
        page = [x.strip() for x in d[p].get_text().split('\n')]
        out.extend([x for x in page if x != ''])
    return out

def parse_nutrients(n):
    L = lines_of(n); cols = COLS[n]; N = len(cols)
    rows = []; i = 0; bad = 0
    while i < len(L):
        if not re.fullmatch(r'\d{7}', L[i]):
            i += 1; continue
        code = L[i]; j = i + 1; desc = []
        # descrição pode quebrar em mais de uma linha; o código de preparo é um inteiro seguido de texto (não de número)
        while j < len(L) and not (re.fullmatch(r'\d{1,2}', L[j]) and j + 1 < len(L) and not isval(L[j + 1])):
            desc.append(L[j]); j += 1
            if len(desc) > 4: break
        if j >= len(L) or len(desc) > 4: bad += 1; i += 1; continue
        prep = int(L[j]); pdesc = L[j + 1]; k = j + 2
        vals = L[k:k + N]
        if len(vals) < N or not all(isval(v) for v in vals):
            bad += 1; i += 1; continue
        rows.append({'code': code, 'name': ' '.join(desc), 'prep': prep, 'prepName': pdesc, 'v': dict(zip(cols, vals))})
        i = k + N
    return rows, bad

def parse_sources():
    L = lines_of(5); rows = []; i = 0; bad = 0
    STOP = ('Código e descrição', 'Tabela 5', 'Tabelas de Composição', '(continuação)', '____')
    while i < len(L):
        if not re.fullmatch(r'\d{7}', L[i]): i += 1; continue
        code = L[i]; j = i + 1; desc = []
        while j < len(L) and not (re.fullmatch(r'\d{1,2}', L[j]) and j + 1 < len(L) and not isval(L[j + 1])):
            desc.append(L[j]); j += 1
            if len(desc) > 4: break
        if j >= len(L) or len(desc) > 4: bad += 1; i += 1; continue
        prep = int(L[j]); pdesc = L[j + 1]; k = j + 2; src = []
        while k < len(L) and not re.fullmatch(r'\d{7}', L[k]) and not L[k].startswith(STOP) and not L[k].startswith('Fonte'):
            src.append(L[k]); k += 1
            if len(src) > 6: break
        s = ' '.join(src); m = re.match(r'^(\d{1,2})\s+(.*)$', s)
        rows.append({'code': code, 'prep': prep, 'srcCode': int(m.group(1)) if m else None, 'srcDesc': (m.group(2) if m else s).strip()})
        i = k
    return rows, bad

out = {}
for n in (1, 2, 3, 4):
    rows, bad = parse_nutrients(n)
    out[f't{n}'] = rows
    print(f'Tabela {n}: {len(rows)} linhas (falhas de leitura: {bad})', file=sys.stderr)
rows5, bad5 = parse_sources(); out['t5'] = rows5
print(f'Tabela 5: {len(rows5)} linhas (falhas de leitura: {bad5})', file=sys.stderr)

# confere que as 5 tabelas têm exatamente as mesmas linhas (alimento + preparo), na mesma ordem
keys = {n: [(r['code'], r['prep']) for r in out[f't{n}']] for n in (1, 2, 3, 4, 5)}
for n in (2, 3, 4, 5):
    same = keys[n] == keys[1]
    print(f'Tabela {n} tem as mesmas linhas da Tabela 1, na mesma ordem: {same}', file=sys.stderr)
    if not same:
        s1, sn = set(keys[1]), set(keys[n])
        print('  só na 1:', sorted(s1 - sn)[:8], ' só na', n, ':', sorted(sn - s1)[:8], file=sys.stderr)
json.dump(out, open('ibge_composicao_raw.json', 'w'), ensure_ascii=False)
