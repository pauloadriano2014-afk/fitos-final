# Passo 3: mapeamento MANUAL dos alimentos do time master (catalogo-custom.tsv) para o IBGE -> curated_custom.json. Edite a lista E para corrigir/ampliar.
import json, re, csv, sys
G = json.load(open('ibge_groups.json'))
CAT = {}
for line in open('catalogo-custom.tsv', encoding='utf-8'):
    ext, name, unit, cat = line.rstrip('\n').split('\t'); CAT[name] = (ext, unit, cat)

# medidas na ordem em que aparecem na planilha (mesma ordem do app)
UNITS = ['colher', 'colher_sobremesa', 'colher_cha', 'colher_cafe', 'colher_servir', 'concha', 'escumadeira',
         'xícara', 'fatia', 'unid', 'pedaco', 'punhado', 'bife_p', 'bife_m', 'bife_g']
NEVER = {'porcao'}      # "porção" do IBGE varia demais (Guia Alimentar etc.): fica de fora

# (nome exato no catálogo, código IBGE, preparo, confiança, opções)
#   only=[...]  -> só essas medidas    skip=[...] -> tira essas medidas    bife='bovino'|'aves'|'peixe' -> deriva P/G
#   extra={'unid': 65} -> medida que vem de outra linha do IBGE (citada na obs.)
A, M = 'ALTA', 'MEDIA'
E = [
 # ── frutas e gorduras ──
 ('Abacate', '6802701', 99, A, {}), ('Abacaxi', '6802601', 99, A, {}), ('Banana', '6801101', 1, A, {}),
 ('Kiwi', '6807801', 99, A, {}), ('Laranja', '6801801', 99, A, {}), ('Mamão', '6803101', 99, A, {}),
 ('Maçã', '6803001', 99, A, {}), ('Melancia', '6803401', 99, A, {}), ('Melão', '6803501', 99, A, {}),
 ('Morango', '6805201', 99, A, {}), ('Pera', '6803601', 99, A, {}), ('Tangerina', '6802201', 99, A, {}),
 ('Uva', '6803901', 99, A, dict(skip=['punhado'], note='punhado=170 g do IBGE parece alto; deixei de fora')),
 ('Castanha do Pará', '6600701', 99, A, {}), ('Nozes', '6601501', 99, A, {}),
 ('Azeite de Oliva', '8400101', 99, A, dict(skip=['colher_servir'])),
 ('Óleo de Coco', '8403201', 99, M, dict(note='IBGE só tem "óleo não especificado"')),
 ('Manteiga', '7901501', 99, A, dict(skip=['colher_servir', 'fatia'])),
 ('Manteiga Ghee', '7901501', 99, M, dict(skip=['colher_servir', 'fatia'], note='usei a manteiga comum')),
 ('Paçoca (Rolha)', '6903205', 99, M, dict(note='IBGE: paçoquinha de amendoim (30 g)')),
 ('Chocolate Meio Amargo (70%)', '8507601', 99, M, dict(only=['colher_sobremesa', 'pedaco'], note='IBGE só tem chocolate genérico')),
 # ── carboidratos ──
 ('Arroz Branco', '6300101', 99, A, {}), ('Arroz Parboilizado', '6300101', 99, A, dict(note='IBGE junta polido e parboilizado')),
 ('Arroz Integral', '6300201', 99, A, {}), ('Aveia em Flocos', '6500401', 99, A, {}),
 ('Batata Doce Assada', '6400401', 4, A, {}), ('Batata Doce Cozida', '6400401', 2, A, {}),
 ('Batata Inglesa Cozida', '6400101', 2, A, {}), ('Inhame (Cozido)', '6400501', 2, A, {}),
 ('Mandioca Cozida', '6400601', 2, A, {}), ('Mandioquinha / Batata Baroa', '6400303', 2, A, {}),
 ('Cuscuz de Milho', '6902901', 99, A, dict(skip=['fatia', 'pedaco'], note='fatia/pedaço do IBGE (135 g) são do cuscuz inteiro')),
 ('Feijão Carioca Cozido', '6303102', 99, A, dict(note='IBGE: feijão (preto, mulatinho, roxo, rosinha etc.)')),
 ('Feijão Preto Cozido', '6303102', 99, A, {}), ('Grão de Bico Cozido', '6302801', 99, A, {}),
 ('Lentilha Cozida', '6302901', 99, A, {}), ('Macarrão Cozido', '6503401', 2, A, {}),
 ('Macarrão Integral (Cozido)', '6503401', 2, A, dict(note='IBGE não separa integral')),
 ('Purê de Batata (Sem Leite)', '6503501', 99, A, {}), ('Granola Sem Açúcar', '6504101', 99, A, {}),
 ('Pão Francês', '8000105', 99, A, dict(note='IBGE: "pão de sal" = pão francês (50 g)')),
 ('Pão Integral', '8001401', 99, A, {}), ('Pão de Forma Tradicional', '8000501', 99, A, {}),
 ('Geleia de Frutas (100% Fruta)', '6901001', 99, A, {}),
 ('Tapioca (Goma)', '6501516', 99, M, dict(note='IBGE: tapioca de goma já hidratada (unid=50 g)')),
 ('Farinha de Linhaça', '6302001', 99, M, dict(note='IBGE é semente de linhaça, não a farinha')),
 # ── proteínas ──
 ('Alcatra Grelhada', '7100301', 3, A, dict(only=['bife_m', 'pedaco'], bife='bovino')),
 ('Filé Mignon Grelhado', '7100101', 3, A, dict(only=['bife_m', 'pedaco'], bife='bovino')),
 ('Patinho (Cozido / Iscas)', '7100501', 2, A, dict(only=['bife_m', 'pedaco'], bife='bovino')),
 ('Carne Moída (Patinho)', '7104301', 2, A, dict(skip=['fatia'])),
 ('Carne de Panela (Cozida)', '7109101', 2, A, dict(only=['colher_servir', 'colher', 'concha', 'escumadeira', 'pedaco'])),
 ('Músculo (Cozido)', '7101001', 2, A, dict(skip=['bife_m'])),
 ('Carne Seca / Charque (Desfiada)', '8100101', 2, A, dict(only=['colher_servir', 'colher', 'concha'])),
 ('Frango Grelhado', '7800401', 3, A, dict(only=['bife_m'], bife='aves', note='filé médio = 100 g')),
 ('Frango Desfiado (Cozido)', '7800401', 2, A, dict(only=['colher_servir', 'colher', 'concha'])),
 ('Sobrecoxa de Frango (Sem pele)', '7800302', 3, A, dict(only=[], extra={'unid': 65}, note='IBGE: "sobrecoxa média" = 65 g (registrada como unid.)')),
 ('Peito de Peru Grelhado', '7801801', 3, A, dict(only=['fatia'])),
 ('Tilápia Grelhada', '7400101', 3, A, dict(only=['bife_m'], bife='peixe', note='IBGE: peixe de água doce, filé médio = 120 g')),
 ('Salmão Grelhado', '7200101', 3, A, dict(only=['bife_m'], bife='peixe', note='IBGE: peixe de mar, filé médio = 120 g')),
 ('Pescada Branca Grelhada', '7200101', 3, A, dict(only=['bife_m'], bife='peixe')),
 ('Linguado Grelhado', '7200101', 3, A, dict(only=['bife_m'], bife='peixe')),
 ('Atum (Grelhado ou Assado)', '7200101', 3, M, dict(only=['bife_m'], bife='peixe', note='IBGE: usei peixe de mar (o atum em conserva é outro alimento)')),
 ('Bacalhau Dessalgado (Cozido)', '7270401', 2, A, dict(skip=[])),
 ('Camarão Grelhado', '7260101', 3, M, dict(note='só colher de sopa no preparo grelhado; unid (30 g) vem do assado')),
 ('Sardinha (Enlatada em Água)', '7703002', 99, A, dict(skip=['colher_servir'])),
 ('Moela de Frango (Cozida)', '7801101', 2, A, {}),
 ('Salsicha Cozida', '7801101' and '8102101', 2, A, dict(only=['unid', 'pedaco'])),
 ('Presunto Magro', '8102901', 99, A, dict(note='o app já tinha 20 g/fatia (vale o do app)')),
 ('Bacon Frito', '8101005', 99, A, {}),
 ('Ovos Inteiros', '7803301', 2, A, dict(only=['unid'])), ('Ovos Mexidos', '7803301', 7, A, dict(only=['unid'], note='IBGE: preparo "refogado(a)"')),
 ('Tofu (Queijo de Soja)', '7903402', 99, A, {}),
 ('Proteína de Soja (PTS Crua)', '6505601', 99, M, dict(note='IBGE mede a proteína de soja já hidratada')),
 ('Peito de Peru (Fatiado)', '8102801', 99, M, dict(note='IBGE: blanquet de peru (10 g); o app tinha 20 g')),
 # ── laticínios ──
 ('Iogurte Natural Desnatado', '7901204', 99, A, {}),
 ('Iogurte Grego Tradicional', '7901201', 99, M, dict(note='IBGE: iogurte de qualquer sabor')),
 ('Iogurte Grego Zero/Light', '7901201', 99, M, {}), ('Iogurte Proteico', '7901201', 99, M, {}),
 ('Leite Desnatado', '7903601', 99, A, {}), ('Leite Integral', '7900101', 99, A, {}),
 ('Leite Zero Lactose', '7900101', 99, M, dict(note='usei leite integral')),
 ('Queijo Minas Frescal Light', '7906001', 99, A, {}), ('Queijo Minas Padrão', '7902001', 99, A, {}),
 ('Queijo Mussarela Light', '7905104', 99, A, {}), ('Queijo Mussarela Tradicional', '7901801', 99, A, {}),
 ('Queijo Ricota Fresca', '7902201', 99, A, {}), ('Requeijão Light', '7906501', 99, A, {}),
 ('Cream Cheese Light', '7902902', 99, M, dict(note='IBGE: queijo cremoso')),
 # ── vegetais (o nome não diz cru/cozido: só sugestão) ──
 ('Alface (Qualquer tipo)', '6700101', 99, A, {}), ('Pepino (Com casca)', '6704001', 99, A, {}),
 ('Pimentão', '6704501', 99, A, {}), ('Rúcula', '6702001', 99, A, {}), ('Tomate', '6705101', 99, A, {}),
 ('Brócolis (Cozido)', '6701704', 2, A, {}), ('Cenoura (Cozida)', '6401201', 2, A, {}),
 ('Abobrinha', '6703701', 2, M, dict(note='sem preparo no nome: usei cozido')),
 ('Abóbora (Cabotiá)', '6703901', 2, M, dict(note='sem preparo no nome: usei cozido')),
 ('Agrião', '6701301', 1, M, dict(note='usei cru')), ('Berinjela', '6705401', 2, M, dict(note='usei cozido')),
 ('Beterraba', '6401101', 2, M, dict(note='usei cozida')), ('Cebola', '6705701', 1, M, dict(note='usei crua')),
 ('Chuchu', '6704101', 2, M, dict(note='usei cozido')), ('Couve (Manteiga)', '6700501', 2, M, dict(note='usei cozida')),
 ('Couve-flor', '6700601', 2, M, dict(note='usei cozida')), ('Espinafre', '6700701', 2, M, dict(note='usei cozido')),
 ('Repolho', '6700901', 1, M, dict(note='usei cru')), ('Vagem', '6705201', 2, M, dict(note='usei cozida')),
 ('Aspargos', '7700701', 99, M, dict(note='IBGE: aspargo em conserva')),
 # ── bebidas ──
 ('Café sem Açúcar', '8501302', 99, M, dict(note='xícara=200 ml do IBGE')), ('Chá sem Açúcar', '8206301', 99, M, dict(only=['xícara'])),
 ('Água de Coco', '8202101', 99, M, dict(only=['xícara'])), ('Gelatina Zero', '6913901', 99, M, dict(only=['colher', 'colher_servir', 'xícara'])),
]

# medidas do sistema antigo (para mostrar conflito na planilha)
LEG = {}
for l in open('../../../lib/legacyFoodPortions.ts', encoding='utf-8'):
    m = re.match(r'\s*"([^"]+)": (\{.*\}),?\s*$', l)
    if m:
        try: d = json.loads(m.group(2)); LEG[d['name']] = d
        except Exception: pass
KEYMAP = {'colher': 'colher', 'fatia': 'fatia', 'unid': 'unid', 'xícara': 'xícara', 'scoop': 'scoop'}

def derive(m, kind):
    """bife P/M/G a partir do médio do IBGE. P = 75% (regra do próprio IBGE); G só p/ carne bovina (bife grande = 150 g no IBGE)."""
    out = dict(m); note = []
    if 'bife_m' in m:
        if 'bife_p' not in m: out['bife_p'] = round(m['bife_m'] * 0.75, 1); note.append('bife P = 75% do médio (regra IBGE)')
        if kind == 'bovino' and 'bife_g' not in m: out['bife_g'] = 150; note.append('bife G = 150 g (IBGE: bife bovino unidade grande)')
    return out, note

def fmt(g): return str(round(float(g), 2)).rstrip('0').rstrip('.').replace('.', ',') if g is not None else ''

rows = []
missing = []
for name, code, prep, conf, o in E:
    if name not in CAT: missing.append(name); continue
    ext, unit, cat = CAT[name]
    f = G.get(code)
    if not f: missing.append(f'{name}: IBGE {code} sem medidas'); continue
    p = f['preps'].get(str(prep))
    if not p: missing.append(f'{name}: IBGE {code} sem preparo {prep} ({list(f["preps"])})'); continue
    m = {k: v for k, v in p['m'].items() if k not in NEVER}
    if 'only' in o: m = {k: v for k, v in m.items() if k in o['only'] or k.startswith('bife') and 'bife_m' in o['only']}
    for k in o.get('skip', []): m.pop(k, None)
    notes = [o['note']] if o.get('note') else []
    if o.get('bife'):
        m, n = derive(m, o['bife']); notes += n
    for k, v in (o.get('extra') or {}).items(): m[k] = v
    if not m: missing.append(f'{name}: nenhuma medida sobrou'); continue
    leg = LEG.get(name); conflicts = []
    if leg:
        for lk, lv in leg['portions'].items():
            k = KEYMAP.get(lk)
            if k in m and abs(m[k] - lv) / lv > 0.15: conflicts.append(f'{k}: app {fmt(lv)} g × IBGE {fmt(m[k])} g')
    rows.append(dict(origem='CUSTOM', chave=ext, alimento=name, ibge_codigo=code, ibge_alimento=f['name'], ibge_preparo=p['prep'],
                     confianca=conf, aplicar='SIM' if conf == A else '', obs='; '.join(notes), m=m, conflito='; '.join(conflicts), legado=bool(leg)))

json.dump(rows, open('curated_custom.json', 'w'), ensure_ascii=False, indent=1)
print('linhas curadas:', len(rows), '| ALTA', sum(r['confianca'] == A for r in rows), '| MEDIA', sum(r['confianca'] == M for r in rows))
print('com valor do app conflitando:', sum(bool(r['conflito']) for r in rows), '| com legado:', sum(r['legado'] for r in rows))
print('PROBLEMAS:', *missing, sep='\n  ')
