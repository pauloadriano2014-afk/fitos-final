# scripts/taco-micros/gerar.py
# Extrai os MICRONUTRIENTES da tabela TACO (4ª ed.) -> prisma/data/taco-micros.json e src/data/tacoMicros.js do app.
# Uso (na pasta do fitos-final):  python3 scripts/taco-micros/gerar.py [caminho/do/app/src/data/tacoMicros.js]
# Requer: pip install openpyxl
#
# Como a TACO marca os valores (por 100 g de alimento):
#   número  -> valor medido/estimado
#   Tr      -> "traço": presente, abaixo do limite de quantificação  -> guardamos 0 (conhecido, ~zero)
#   NA      -> "não se aplica" (ex.: colesterol em vegetais)          -> guardamos 0 (conhecido, sem contribuição)
#   *  / vazio / espaço -> SEM DADO                                    -> guardamos null (desconhecido ≠ zero!)
import json, os, re, sys, unicodedata
from openpyxl import load_workbook
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from equivalentes import LINKS

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
XLSX = os.path.join(ROOT, 'prisma', 'Taco-4a-Edicao.xlsx')
OUT_JSON = os.path.join(ROOT, 'prisma', 'data', 'taco-micros.json')
OUT_JS = sys.argv[1] if len(sys.argv) > 1 else None

# chave, rótulo, unidade, coluna na planilha principal (CMVCol) ou (AG, coluna)
FIELDS = [
    ('ca', 11), ('fe', 16), ('mg', 12), ('p', 15), ('k', 18), ('na', 17), ('zn', 20), ('cu', 19), ('mn', 14),
    ('vita', 23),          # RAE (mcg)
    ('b1', 24), ('b2', 25), ('b6', 26), ('b3', 27), ('c', 28), ('chol', 7),
]
AG = [('sat', 2), ('mono', 3), ('poly', 4)]
KEYS = [k for k, _ in FIELDS] + [k for k, _ in AG]

def parse(v):
    if v is None: return None
    if isinstance(v, (int, float)): return round(float(v), 4)
    s = str(v).strip()
    if s == '' or s == '*': return None
    if s.lower() == 'tr' or s.lower() == 'na': return 0.0
    if s == ',0,02': return 0.02          # erro de digitação da planilha (piridoxina): 0,02 mg
    try: return round(float(s.replace(',', '.')), 4)
    except ValueError: return None

wb = load_workbook(os.path.join(ROOT, 'prisma', 'Taco-4a-Edicao.xlsx'), data_only=True)
main = wb['CMVCol taco3']; ag = wb['AGtaco3']
agrows = {}
for r in ag.iter_rows(min_row=5, values_only=True):
    if isinstance(r[0], (int, float)): agrows[int(r[0])] = r
def norm(x):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFD', x).encode('ascii', 'ignore').decode().lower()).strip()
kcal_by_name = {}
foods = []
for r in main.iter_rows(min_row=4, values_only=True):
    if not isinstance(r[0], (int, float)) or not isinstance(r[1], str): continue
    tid = int(r[0]); name = re.sub(r'\s+', ' ', r[1]).strip()
    vals = [parse(r[c]) for _, c in FIELDS]
    # Vitamina A (RAE): se a TACO não traz RAE mas traz RETINOL numérico (>0) -- leite, ovo, queijo, manteiga --
    # usa o retinol (em alimentos de origem animal ele é praticamente todo o RAE). Retinol "NA"/"Tr" sem RAE = sem dado.
    ia = KEYS.index('vita')
    if vals[ia] is None:
        ret = r[21]
        if isinstance(ret, (int, float)) and ret > 0: vals[ia] = round(float(ret), 4)
    a = agrows.get(tid)
    vals += [parse(a[c]) if a else None for _, c in AG]
    foods.append({'id': tid, 'name': name, 'v': vals})
    kcal_by_name[norm(name)] = r[3] if isinstance(r[3], (int, float)) else None
# alimentos do time master -> equivalente da TACO (só se as calorias forem parecidas; kcal ausente na TACO passa)
links, rejected = {}, []
for name, kcal, taco, note in LINKS:
    t = kcal_by_name.get(norm(taco), 'x')
    if t == 'x': raise SystemExit(f'nome TACO inexistente: {taco}')
    if t is not None and abs(t - kcal) > 20 and abs(t - kcal) / max(kcal, 1) > 0.40:
        rejected.append((name, kcal, round(t))); continue
    links[name] = {'taco': next(f['name'] for f in foods if norm(f['name']) == norm(taco)), 'note': note}
print('equivalentes aceitos:', len(links), '| recusados por calorias diferentes:', rejected)
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
json.dump({'keys': KEYS, 'foods': foods, 'equivalents': links}, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(foods), 'alimentos ->', OUT_JSON, os.path.getsize(OUT_JSON) // 1024, 'KB')
for i, k in enumerate(KEYS):
    known = sum(1 for f in foods if f['v'][i] is not None)
    print(f'  {k:5s} com dado: {known:3d}/{len(foods)}')
if OUT_JS:
    body = json.dumps([[f['id'], f['name']] + f['v'] for f in foods], ensure_ascii=False, separators=(',', ':'))
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('// src/data/tacoMicros.js — GERADO por fitos-final/scripts/taco-micros/gerar.py (não edite à mão).\n')
        f.write('// Micronutrientes da TACO 4ª ed. por 100 g. Linha = [id TACO, nome, ...valores na ordem de MICRO_KEYS].\n')
        f.write('// valor 0 = "Tr" (traço) ou "NA" (não se aplica); null = SEM DADO (não é zero).\n')
        f.write('export const MICRO_KEYS = ' + json.dumps(KEYS) + ';\n')
        f.write('export const TACO_MICRO_ROWS = ' + body + ';\n')
        f.write('// Alimentos do time master (sem micronutrientes no cadastro) -> equivalente da TACO. Aproximação, sinalizada na tela.\n')
        f.write('export const MICRO_EQUIVALENTS = ' + json.dumps(links, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('->', OUT_JS, os.path.getsize(OUT_JS) // 1024, 'KB')
