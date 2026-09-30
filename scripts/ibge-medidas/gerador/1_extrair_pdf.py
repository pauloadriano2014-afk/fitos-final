# Passo 1: lê o PDF oficial do IBGE (liv50000.pdf) e extrai as 11.801 linhas da tabela -> ibge_raw.json. Uso: python3 1_extrair_pdf.py caminho/liv50000.pdf  (precisa: pip install pymupdf)
import re, json, sys
import pymupdf as fitz
d = fitz.open(sys.argv[1] if len(sys.argv) > 1 else 'liv50000.pdf')

# Quadro 2 (cadastro oficial de unidades de medida) - validação cruzada
def load_measure_table():
    t = d[23].get_text().split('\n')
    out = {}
    i = 0
    # formato: "Código\nMedidas\nCódigo\nMedidas\n1\n  Asa\n54\n  Garrafa (600 ml)..."
    nums = []
    items = []
    j = 0
    while j < len(t):
        s = t[j].strip()
        if re.fullmatch(r'\d{1,3}', s) and j + 1 < len(t):
            items.append((int(s), t[j+1].strip()))
            j += 2
        else:
            j += 1
    return dict(items)
MEAS = load_measure_table()
print('medidas do Quadro 2:', len(MEAS), MEAS.get(12), MEAS.get(17), MEAS.get(28), MEAS.get(104), file=sys.stderr)

PREP = {1:'Cru(a)',2:'Cozido(a)',3:'Grelhado(a)/brasa/churrasco',4:'Assado(a)',5:'Frito(a)',6:'Empanado(a)/à milanesa',7:'Refogado(a)',8:'Molho vermelho',9:'Molho branco',10:'Alho e óleo',11:'Com manteiga/óleo',12:'Ao vinagrete',13:'Ensopado',14:'Mingau',15:'Sopa',99:'Não se aplica'}

NOISE = [
    re.compile(r'^\s*_?\s*_{5,}.*Pesquisa de Orçamentos Familiares 2008-2009'),
    re.compile(r'^Tabela de Medidas Referidas para os Alimentos Consumidos no Brasil\s*$'),
    re.compile(r'^Descrição da Tabela de Medidas Referidas dos Alimentos Consumidos no Brasil'),
    re.compile(r'^\(continua(ção|)\)\s*$'),
    re.compile(r'^Quan-\s*$'), re.compile(r'^tidade\s*$'), re.compile(r'^\(g\)\s*$'),
    re.compile(r'^\s*$'),
]
REC = re.compile(r'^(\d{7}) (.+)$')
FIELD = re.compile(r'^(\d{1,3}) (\S.*)$')
NUM = re.compile(r'^\d+(,\d+)?$')

def join(a, b):
    a = a.rstrip(); b = b.strip()
    if a.endswith('-'):
        return a[:-1] + b      # "chur-" + "rasco"
    return a + ' ' + b

records = []
problems = []
first_page = None
last_page = None
lines = []   # (page, text)
for pi in range(34, len(d)):
    txt = d[pi].get_text()
    if not any(REC.match(l) for l in txt.split('\n')):
        if first_page is not None and pi > 300:   # já passou a tabela
            pass
        continue
    if first_page is None: first_page = pi + 1
    last_page = pi + 1
    for l in txt.split('\n'):
        if any(n.match(l) for n in NOISE): continue
        lines.append((pi + 1, l.rstrip()))

# agrupa por registro
groups = []
cur = None
for pg, l in lines:
    if REC.match(l):
        cur = {'page': pg, 'lines': [l]}
        groups.append(cur)
    elif cur is not None:
        cur['lines'].append(l)

def parse_field(ls, k):
    """ls[k] deve ser 'cod nome'; junta continuações (linhas sem 'cod ' nem número puro). Devolve (cod, nome, próximo k)."""
    m = FIELD.match(ls[k])
    if not m: return None
    cod, nome = int(m.group(1)), m.group(2)
    k += 1
    while k < len(ls) and not FIELD.match(ls[k]) and not NUM.match(ls[k]):
        nome = join(nome, ls[k]); k += 1
    return cod, nome, k

for g in groups:
    ls = g['lines']
    m = REC.match(ls[0]); code = m.group(1); name = m.group(2)
    k = 1
    # continuação do nome do alimento (até a linha de preparação)
    while k < len(ls) and not FIELD.match(ls[k]):
        name = join(name, ls[k]); k += 1
    try:
        prep = parse_field(ls, k);  k = prep[2]
        med  = parse_field(ls, k);  k = med[2]
        std  = parse_field(ls, k);  k = std[2]
        if not NUM.match(ls[k]): raise ValueError('quantidade esperada: ' + ls[k])
        qty = float(ls[k].replace(',', '.')); k += 1
        src = parse_field(ls, k) if k < len(ls) and FIELD.match(ls[k]) else None
        if src:
            # tudo que sobrar é continuação da descrição da fonte
            k = src[2]; desc = src[1]
            while k < len(ls): desc = join(desc, ls[k]); k += 1
            src = (src[0], desc)
        else:
            src = (None, ' '.join(ls[k:]))
    except Exception as e:
        problems.append((g['page'], ls[:8], str(e))); continue
    rec = {'page': g['page'], 'foodCode': code, 'food': name, 'prepCode': prep[0], 'prep': prep[1],
           'measureCode': med[0], 'measure': med[1], 'stdCode': std[0], 'std': std[1], 'grams': qty,
           'srcCode': src[0], 'srcDesc': src[1]}
    # validação cruzada com Quadro 1 e 2
    norm = lambda s: re.sub(r'\s+', '', s).lower()
    if med[0] in MEAS and norm(MEAS[med[0]]) != norm(med[1]): rec['warnMeasure'] = MEAS[med[0]]
    if std[0] in MEAS and norm(MEAS[std[0]]) != norm(std[1]): rec['warnStd'] = MEAS[std[0]]
    if prep[0] in PREP and norm(PREP[prep[0]]) != norm(prep[1]): rec['warnPrep'] = PREP[prep[0]]
    records.append(rec)

json.dump(records, open('ibge_raw.json', 'w'), ensure_ascii=False)
print('páginas', first_page, '-', last_page, '| registros', len(records), '| problemas', len(problems))
w = [r for r in records if any(k.startswith('warn') for k in r)]
print('avisos de validação cruzada:', len(w))
for r in w[:15]: print('  ', r['page'], r['food'], '|', r['prep'], '|', r['measure'], {k: v for k, v in r.items() if k.startswith('warn')})
for p in problems[:10]: print('PROBLEMA', p)
print('alimentos distintos:', len({r['foodCode'] for r in records}))
