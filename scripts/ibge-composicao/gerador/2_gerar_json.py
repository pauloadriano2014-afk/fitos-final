# Passo 2: junta as Tabelas 1-5 (ibge_composicao_raw.json) numa lista de alimentos prontos pro app -> prisma/data/ibge/ibge-composicao.json
#   - uma entrada por alimento + composição DISTINTA: preparos com valores idênticos (ex.: milho cru/cozido/grelhado/assado...) viram uma
#     entrada só, com o nome dos preparos no rótulo. "Cru(a)" sai do rótulo quando tem os mesmos valores de "cozido/grelhado/assado":
#     segundo a metodologia do IBGE, pra vegetais, legumes, carnes e massas o "cru" usa a composição do alimento COZIDO;
#   - valores: "-" = sem dado (null); "Tr" (traço) = 0; "NA" = null;
#   - acrescenta as medidas caseiras do IBGE (ibge-medidas.json, mesmo código de alimento/preparo) em `portions`;
#   - entradas sem energia (kcal) não servem pra montar dieta e ficam de fora (`excluidas`).
# Uso: python3 2_gerar_json.py ibge_composicao_raw.json ../../../prisma/data/ibge/ibge-medidas.json ../../../prisma/data/ibge/ibge-composicao.json
import json, re, sys, collections

raw_path, med_path, out_path = sys.argv[1:4]
raw = json.load(open(raw_path)); medidas = json.load(open(med_path))

GROUPS = {'63': 'Cereais e leguminosas', '64': 'Hortaliças tuberosas', '65': 'Farinhas, féculas e massas', '66': 'Cocos, castanhas e nozes',
          '67': 'Hortaliças folhosas, frutosas e outras', '68': 'Frutas', '69': 'Açúcares e produtos de confeitaria', '70': 'Sais e condimentos',
          '71': 'Carnes e vísceras', '72': 'Pescados e frutos do mar', '74': 'Pescados e frutos do mar', '76': 'Pescados e frutos do mar',
          '77': 'Enlatados e conservas', '78': 'Aves e ovos', '79': 'Laticínios', '80': 'Panificados', '81': 'Carnes industrializadas',
          '82': 'Bebidas não alcoólicas e infusões', '83': 'Bebidas alcoólicas', '84': 'Óleos e gorduras', '85': 'Miscelâneas', '88': 'Miscelâneas'}
SOURCES = {1: 'NDSR (base de dados dos EUA)', 2: 'TACO', 3: 'Alimentos regionais brasileiros (Min. da Saúde)', 4: 'Tabela portuguesa (INSA)',
           5: 'Culinária goiana', 6: 'Tabela de equivalentes (Pacheco)', 7: 'Rótulo do produto', 8: 'Mista (receita)', 9: 'INPA'}
PREP_SHORT = {1: 'cru', 2: 'cozido', 3: 'grelhado', 4: 'assado', 5: 'frito', 6: 'empanado', 7: 'refogado', 8: 'molho vermelho', 9: 'molho branco',
              10: 'alho e óleo', 11: 'manteiga/óleo', 12: 'vinagrete', 13: 'ensopado', 14: 'mingau', 15: 'sopa'}
COOKED = {2, 3, 4, 12}
UNITS = ['colher', 'colher_sobremesa', 'colher_cha', 'colher_cafe', 'colher_servir', 'concha', 'escumadeira', 'xícara', 'fatia', 'unid',
         'pedaco', 'punhado', 'bife_p', 'bife_m', 'bife_g']
# o rodapé de página às vezes cola o nome do grupo no fim do texto da fonte: tira
HEADS = sorted(set(GROUPS.values()), key=len, reverse=True)

def num(s):
    if s in ('-', 'NA', '...', '..', 'x'): return None
    if s == 'Tr': return 0.0
    return float(s.rstrip('*').replace(',', '.'))

def clean_src(s):
    s = (s or '').strip()
    for h in HEADS:
        if s.endswith(' ' + h): s = s[: -len(h) - 1].strip()
    return s

rows = {}
for t in ('t1', 't2', 't3', 't4'):
    for r in raw[t]:
        rows.setdefault((r['code'], r['prep']), {'code': r['code'], 'name': r['name'], 'prep': r['prep'], 'v': {}})['v'].update({k: v for k, v in r['v'].items()})
srcs = {(r['code'], r['prep']): r for r in raw['t5']}
order = [(r['code'], r['prep']) for r in raw['t1']]

by_code = collections.OrderedDict()
for k in order: by_code.setdefault(k[0], []).append(k)

entries, excluded = [], []
for code, keys in by_code.items():
    buckets = collections.OrderedDict()
    for k in keys:
        r = rows[k]
        sig = tuple(sorted(r['v'].items()))
        buckets.setdefault(sig, []).append(k)
    for sig, ks in buckets.items():
        preps = sorted(k[1] for k in ks)
        r0 = rows[ks[0]]; v = {k: num(x) for k, x in r0['v'].items()}
        name = r0['name'].strip()
        if 99 in preps: label = name
        else:
            shown = [p for p in preps if not (p == 1 and any(q in COOKED for q in preps))]
            label = f"{name} — {', '.join(PREP_SHORT[p] for p in shown)}"
        s = srcs.get(ks[0]) or {}
        src = {'code': s.get('srcCode'), 'desc': clean_src(s.get('srcDesc'))}
        # medidas caseiras do IBGE: primeiro preparo da entrada que tenha medidas (prefere 99, depois cozido, grelhado, assado...)
        pref = [p for p in [99, 2, 3, 4, 7, 5, 13, 12, 6, 8, 9, 10, 11, 14, 15, 1] if p in preps]
        portions = None
        for p in pref:
            m = (((medidas.get(code) or {}).get('preps') or {}).get(str(p)) or {}).get('m') or {}
            got = {u: round(float(g), 1) for u, g in m.items() if u in UNITS and g and round(float(g), 1) > 0}   # (depois de arredondar: 0,04 g vira 0 e não é medida)
            if got: portions = got; break
        n = {k: v[k] for k in v if k not in ('kcal', 'protein', 'fat', 'carbs', 'fiber') and v[k] is not None}
        e = {'id': f'ibge-{code}-{preps[0]}', 'code': code, 'preps': preps, 'name': name, 'label': label, 'category': GROUPS[code[:2]],
             'kcal': v['kcal'], 'protein': v['protein'], 'carbs': v['carbs'], 'fat': v['fat'], 'fiber': v['fiber'], 'n': n, 'src': src, 'portions': portions}
        if v['kcal'] is None: excluded.append({'id': e['id'], 'label': label, 'motivo': 'sem energia (kcal) na tabela'}); continue
        entries.append(e)

out = {'fonte': 'IBGE, Pesquisa de Orçamentos Familiares 2008-2009 - Tabelas de Composição Nutricional dos Alimentos Consumidos no Brasil (2011). Valores por 100 g de parte comestível.',
       'fontes': SOURCES, 'entradas': entries, 'excluidas': excluded}
json.dump(out, open(out_path, 'w'), ensure_ascii=False, separators=(',', ':'))

# resumo
print(f'{len(raw["t1"])} linhas (alimento+preparo) -> {len(by_code)} alimentos -> {len(entries)} entradas na lista ({len(excluded)} sem energia ficaram de fora)')
print('por grupo:', dict(collections.Counter(e['category'] for e in entries)))
print('por fonte:', {SOURCES.get(k, k): c for k, c in collections.Counter(e['src']['code'] for e in entries).items()})
print('com medidas caseiras:', sum(1 for e in entries if e['portions']), ' sem proteína:', sum(e['protein'] is None for e in entries), ' sem gordura:', sum(e['fat'] is None for e in entries), ' sem carboidrato:', sum(e['carbs'] is None for e in entries))
print('tamanho:', len(json.dumps(out, ensure_ascii=False, separators=(",", ":"))) // 1024, 'KB')
