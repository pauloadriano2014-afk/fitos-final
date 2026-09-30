# Passo 5: junta tudo na planilha de revisão (revisao-ibge.csv) e na lista de alimentos sem correspondência
import json, csv, io
G = json.load(open('ibge_groups.json'))
CUS = json.load(open('curated_custom.json'))
TAC = json.load(open('taco_matches.json'))
UNITS = ['colher', 'colher_sobremesa', 'colher_cha', 'colher_cafe', 'colher_servir', 'concha', 'escumadeira', 'xícara', 'fatia', 'unid', 'pedaco', 'punhado', 'bife_p', 'bife_m', 'bife_g']
HEAD = ['origem', 'chave', 'alimento', 'ibge_codigo', 'ibge_alimento', 'ibge_preparo', 'confianca', 'aplicar'] + UNITS + ['observacao', 'conflito_com_o_app']
def num(v): return '' if v is None else str(round(float(v), 2)).rstrip('0').rstrip('.').replace('.', ',')
rows = []
for r in sorted(CUS, key=lambda r: r['alimento']):
    rows.append(['CUSTOM', r['chave'], r['alimento'], r['ibge_codigo'], r['ibge_alimento'], r['ibge_preparo'], r['confianca'], r['aplicar']] + [num(r['m'].get(u)) for u in UNITS] + [r['obs'], r['conflito']])
tac = [o for o in TAC if o['status'] in ('ALTA', 'MEDIA')]
tac.sort(key=lambda o: (o['status'], o['taco']['name']))
for o in tac:
    f = G[o['ibge']]
    rows.append(['TACO', str(o['taco']['id']), o['taco']['name'], o['ibge'], f['name'], f['preps'][o['prep']]['prep'], o['status'], 'SIM' if o['status'] == 'ALTA' else ''] + [num(o['m'].get(u)) for u in UNITS] + [o.get('why', ''), ''])
def write(path, head, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';', quoting=csv.QUOTE_MINIMAL); w.writerow(head); w.writerows(rows)
write('revisao-ibge.csv', HEAD, rows)
# sem correspondência
mapped = {r['alimento'] for r in CUS}
cat = [l.rstrip('\n').split('\t') for l in open('catalogo-custom.tsv', encoding='utf-8')]
sem = []
for ext, name, unit, c in cat:
    if name in mapped: continue
    why = 'suplemento/produto de marca: o IBGE não tem' if c == 'Suplementos' else 'sem equivalente na tabela do IBGE'
    sem.append(['CUSTOM', ext, name, why])
lab = {'SEM_IBGE': 'não achei alimento equivalente no IBGE', 'SEM_PREPARO': 'o IBGE não tem esse preparo (não misturo cru com cozido)', 'SEM_MEDIDA': 'o IBGE só tem medidas que o app não usa (ex.: prato, copo)'}
for o in TAC:
    if o['status'] in lab: sem.append(['TACO', str(o['taco']['id']), o['taco']['name'], lab[o['status']]])
write('sem-correspondencia.csv', ['origem', 'chave', 'alimento', 'motivo'], sem)
print('revisao-ibge.csv:', len(rows), 'linhas | aplicar=SIM:', sum(r[7] == 'SIM' for r in rows), '| sem-correspondencia.csv:', len(sem))
