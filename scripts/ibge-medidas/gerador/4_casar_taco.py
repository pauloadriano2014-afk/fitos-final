# Passo 4: casamento AUTOMÁTICO e conservador dos 591 alimentos TACO com o IBGE -> taco_matches.json
import json, re, math, unicodedata, collections
G = json.load(open('ibge_groups.json'))
TACO = json.load(open('../../../prisma/taco_mapeada.json'))
def strip(s): return re.sub(r'[^a-z0-9 ]+', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower())
STOP = set('de da do das dos com sem em e a o as os para ou tipo qualquer sabor'.split())
PREPS = {  # palavra -> código IBGE
 'cru': 1, 'crua': 1, 'cozido': 2, 'cozida': 2, 'grelhado': 3, 'grelhada': 3, 'assado': 4, 'assada': 4, 'frito': 5, 'frita': 5,
 'empanado': 6, 'empanada': 6, 'refogado': 7, 'refogada': 7, 'ensopado': 13, 'ensopada': 13}
def stem(t):
    if len(t) > 3 and t.endswith('s') and not t.endswith('ss'): t = t[:-1]
    if t.endswith('a') and len(t) > 4 and t[:-1] + 'o' in PREPS: t = t[:-1] + 'o'
    return t
def toks(s, drop_prep=True):
    out = []
    for t in strip(s).split():
        if t in STOP or len(t) < 2 or t.isdigit(): continue
        t = stem(t)
        if drop_prep and t in PREPS: continue
        out.append(t)
    return out
def primary(name):    # tokens do nome IBGE fora dos parênteses
    return set(toks(re.sub(r'\(.*?\)', ' ', name)))
P = {c: primary(f['name']) for c, f in G.items()}
P = {c: p for c, p in P.items() if p}
ALT = {c: set(toks(' '.join(re.findall(r'\((.*?)\)', f['name'])))) for c, f in G.items()}
HARMLESS = {'gordura', 'pele', 'osso', 'sal', 'drenado', 'envasado'}
df = collections.Counter(t for p in P.values() for t in p); N = len(P)
idf = lambda t: math.log((N + 1) / (df.get(t, 0) + 1)) + 1
def taco_prep(name):
    ps = [PREPS[strip(w).strip()] for w in re.split(r'[,/ ]+', name.lower()) if strip(w).strip() in PREPS]
    return ps[-1] if ps else None
NEVER = {'porcao'}
MARK = set(stem(x) for x in 'suco doce molho mistura farofa bolo torta gema clara caldo sopa salada recheio po xarope sorvete biscoito cerveja vinho bebida pure creme mingau pudim pastel pao empad empada quibe nhoque tempero condimento conserva geleia geleia compota polpa refresco batida vitamina achocolatado leite iogurte queijo manteiga margarina farinha amido fecula'.split()) - {'farinha'}
MEAT_OK = {'bife_p', 'bife_m', 'bife_g', 'colher_servir', 'colher', 'concha', 'escumadeira', 'colher_sobremesa', 'xícara'}
BEEF_HEAD = {'bovin', 'boi', 'vaca'}
out = []
for t in TACO:
    T = set(toks(t['name'].replace('contra-filé', 'contrafilé').replace('contra-file', 'contrafile'))); prep = taco_prep(t['name']); cat = t['category']
    best = []
    for c, p in P.items():
        if not p <= T: continue
        wi = sum(idf(x) for x in p)
        best.append((wi, -len(T - p), c))
    best.sort(reverse=True)
    if not best: out.append(dict(taco=t, status='SEM_IBGE')); continue
    top = best[0]; second = best[1] if len(best) > 1 else None
    f = G[top[2]]
    # escolhe preparo: exato; sem preparo no TACO -> 99, depois 1 (frutas/verduras cruas)
    want = [prep] if prep else [99, 1]
    pk = next((str(w) for w in want if str(w) in f['preps']), None)
    ambiguous = bool(second and second[0] >= top[0] * 0.95 and second[2] != top[2])
    conf = 'ALTA'; why = []
    if pk is None:
        # sem preparo compatível: só aceita cozido↔grelhado↔assado entre si (nunca cru↔cozido)
        near = {3: [4, 2], 4: [3, 2], 2: [4, 3], 5: [], 1: [], 7: [2], 13: [2], 6: [5]}.get(prep, [])
        pk = next((str(w) for w in near if str(w) in f['preps']), None)
        if pk: conf = 'MEDIA'; why.append(f'preparo do IBGE: {f["preps"][pk]["prep"]}')
    if pk is None:
        out.append(dict(taco=t, status='SEM_PREPARO', ibge=top[2])); continue
    if ambiguous: conf = 'MEDIA'; why.append('ambíguo: ' + G[second[2]]['name'][:30])
    head = (toks(t['name'].split(',')[0]) or [''])[0]
    if head not in P[top[2]]: conf = 'MEDIA'; why.append('palavra principal do TACO não é a do IBGE')
    marks = sorted((T - P[top[2]]) & MARK)
    if marks: conf = 'MEDIA'; why.append('derivado/preparação (' + ', '.join(marks) + ')')
    extras = T - P[top[2]] - ALT[top[2]] - HARMLESS
    if extras: conf = 'MEDIA'; why.append('nome do TACO tem detalhe que o IBGE não tem (' + ', '.join(sorted(extras)) + ')')
    m = {k: v for k, v in f['preps'][pk]['m'].items() if k not in NEVER}
    if cat in ('Carnes e derivados', 'Pescados e frutos do mar') or top[2].startswith(('71', '72', '74', '76', '78', '81')):
        m = {k: v for k, v in m.items() if k in MEAT_OK}
    if not m: out.append(dict(taco=t, status='SEM_MEDIDA', ibge=top[2])); continue
    out.append(dict(taco=t, status=conf, ibge=top[2], prep=pk, m=m, why='; '.join(why), extra=len(extras)))
cnt = collections.Counter(o['status'] for o in out)
print(dict(cnt))
json.dump(out, open('taco_matches.json', 'w'), ensure_ascii=False)
import random; random.seed(7)
for o in random.sample([o for o in out if o['status'] in ('ALTA', 'MEDIA')], 28):
    f = G[o['ibge']]; print(f"  [{o['status'][:1]}] {o['taco']['name'][:44]:44} -> {f['name'][:26]:26} /{f['preps'][o['prep']]['prep'][:8]:8} {dict(list(o['m'].items())[:4])} {o['why']}")
