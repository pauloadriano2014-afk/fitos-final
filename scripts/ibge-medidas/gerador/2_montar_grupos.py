# Passo 2: agrupa por alimento x preparo e traduz as medidas do IBGE para as chaves do app -> ibge_groups.json (= prisma/data/ibge/ibge-medidas.json)
import json, re, collections, unicodedata
R = json.load(open('ibge_raw.json'))

MAP = {16:'colher', 15:'colher_sobremesa', 14:'colher_cha', 13:'colher_cafe', 12:'colher_servir',
       17:'concha', 28:'escumadeira', 32:'fatia', 103:'unid', 81:'pedaco', 87:'porcao', 88:'punhado', 106:'xícara'}
BIFE = {5, 33}
clean_src = lambda s: re.sub(r'\s*Código e descrição.*$', '', s).strip()

foods = {}
unmapped = collections.Counter()
for r in R:
    f = foods.setdefault(r['foodCode'], {'name': re.sub(r'\s+', ' ', r['food']).strip(), 'preps': {}})
    p = f['preps'].setdefault(r['prepCode'], {'prep': r['prep'], 'm': {}, 'src': {}})
    mc = r['measureCode']; g = r['grams']; sd = clean_src(r['srcDesc'])
    key = None
    if mc in MAP: key = MAP[mc]
    elif mc in BIFE:
        s = sd.lower()
        key = 'bife_g' if 'grande' in s else ('bife_p' if 'pequen' in s else 'bife_m')
    if key:
        p['m'][key] = g; p['src'][key] = sd
    elif mc not in (68, 94, 76, 79):   # grama, quilo, litro, mililitro: não são medidas caseiras
        unmapped[r['measure']] += 1
for f in foods.values():
    f['preps'] = {k: v for k, v in f['preps'].items() if v['m']}
foods = {k: v for k, v in foods.items() if v['preps']}
json.dump(foods, open('ibge_groups.json', 'w'), ensure_ascii=False)
n = sum(len(f['preps']) for f in foods.values())
print('alimentos com medida caseira mapeada:', len(foods), '| combinações alimento×preparo:', n)
print('medidas usadas:', collections.Counter(k for f in foods.values() for p in f['preps'].values() for k in p['m']).most_common())
print('NÃO mapeadas (linhas):', unmapped.most_common(25))
