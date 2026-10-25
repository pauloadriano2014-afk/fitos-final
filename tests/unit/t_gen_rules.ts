import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
import { generateWorkoutPlan } from '/home/user/fitos-final/lib/ai/workoutGen';
import { suggestImpact, suggestAvoid, pickExtra, cleanExtraPatch, mergeTags, effectiveExtra, EXTRA_KEYS } from '/home/user/fitos-final/lib/exerciseTags';
import { orderDayExercises, orderedGroupIds, kindOfDay, cleanOrderStyle } from '/home/user/fitos-final/lib/ai/exerciseOrder';
import { muscleTarget, targetMismatch } from '/home/user/fitos-final/lib/ai/muscleTarget';
import { effectiveEnvironments, cleanRules, emptyRules, isEmptyRules, mergeRules, describeRules, removalReason, applyRules, removedSummary, loadStudentRules, MAX_IDS } from '/home/user/fitos-final/lib/genRules';
import { GET as prefsGET, PUT as prefsPUT, DELETE as prefsDEL } from '/home/user/fitos-final/app/api/gen-prefs/route';
import { POST as previewPOST } from '/home/user/fitos-final/app/api/gen-prefs/preview/route';
import { classifyNote, buildConcerns, concernIssues } from '/home/user/fitos-final/lib/exerciseConcerns';
import { GET as concernsGET } from '/home/user/fitos-final/app/api/gen-prefs/concerns/route';
import { GET as presetsGET, POST as presetsPOST, DELETE as presetsDEL } from '/home/user/fitos-final/app/api/gen-presets/route';
import { GET as tagsGET, POST as tagsPOST } from '/home/user/fitos-final/app/api/exercise/tags-review/route';
import { PUT as exercisePUT } from '/home/user/fitos-final/app/api/exercise/route';
import { GET as syncTags } from '/home/user/fitos-final/app/api/exercise/sync-tags/route';
import { POST as workoutPOST } from '/home/user/fitos-final/app/api/workout/route';
import { PUT as workoutPUT } from '/home/user/fitos-final/app/api/workout/[id]/route';
import { GET as learnGET } from '/home/user/fitos-final/app/api/gen-learning/route';

const db: any = (prisma as any).__db; const G: any = globalThis;
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, e = console.error, l = console.log; console.warn = console.error = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; console.log = l; } };
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, as: string | null, o: { method?: string; path?: string; body?: any } = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + (o.path || '/api'), { method: o.method || 'GET', headers, body: o.body ? JSON.stringify(o.body) : undefined })); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, json: j };
};
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; } };

const lib = (id: string, name: string, target: string, mech = 'COMPOSTO', eq = 'MAQUINA', o: any = {}): any => ({ id, name, category: target === 'CARDIO' ? 'Cardio' : 'Musculação', subCategory: target, videoUrl: 'v', tags: { target, mechanic: mech, equipment: eq, jointRisk: o.risk || [], ...(o.extra || {}) }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });

(async () => {
  // ═════ 1) tags novas (puro) ═════
  await t('suggestImpact/suggestAvoid: pulo e corrida são alto impacto; prancha/supino reto/terra/barra fixa têm perfis a evitar; o resto fica livre', () => {
    for (const n of ['Agachamento com salto', 'Burpee', 'Pular corda', 'Polichinelo', 'Corrida na esteira', 'Box jump', 'Mountain climber']) assert.equal(suggestImpact(n), 'ALTO', n);
    for (const n of ['Tríceps corda', 'Supino reto', 'Rosca direta', 'Cadeira extensora', 'Leg press 45', 'Elevação pélvica']) assert.equal(suggestImpact(n), 'BAIXO', n);
    assert.deepEqual(suggestAvoid('Prancha frontal'), ['GESTANTE']); assert.deepEqual(suggestAvoid('Levantamento terra'), ['GESTANTE', 'TERCEIRA_IDADE']); assert.deepEqual(suggestAvoid('Supino reto com barra'), ['GESTANTE']);
    assert.deepEqual(suggestAvoid('Supino inclinado com halteres'), [], 'inclinado fica de fora'); assert.deepEqual(suggestAvoid('Barra fixa'), ['TERCEIRA_IDADE']); assert.deepEqual(suggestAvoid('Rosca direta'), []);
    assert.deepEqual(suggestAvoid('Agachamento com salto'), ['GESTANTE', 'TERCEIRA_IDADE'], 'alto impacto vale para os dois'); assert.ok(!suggestAvoid('Terra').includes('POS_CIRURGIA'), 'pós-cirurgia só à mão');
    assert.equal(suggestImpact('Pulldown frontal'), 'BAIXO', '"pull" não é pulo'); assert.deepEqual(suggestAvoid('Abdominal supra'), ['GESTANTE']);
  });
  await t('pickExtra/cleanExtraPatch/mergeTags: só valores válidos; editar não perde marcação à mão; null apaga e volta à sugestão', () => {
    assert.deepEqual(EXTRA_KEYS, ['impact', 'avoid', 'favorite']);
    assert.deepEqual(pickExtra({ target: 'PEITO', impact: 'ALTO', avoid: ['gestante', 'XPTO', 'GESTANTE'], favorite: true }), { impact: 'ALTO', avoid: ['GESTANTE'], favorite: true });
    assert.deepEqual(pickExtra({ impact: 'MEDIO', avoid: 'x', favorite: 'sim' }), {}); assert.deepEqual(pickExtra(null), {}); assert.deepEqual(pickExtra('texto'), {});
    assert.deepEqual(cleanExtraPatch({ impact: 'baixo' }), { impact: null }, 'minúscula não vale: apaga'); assert.deepEqual(cleanExtraPatch({ impact: 'BAIXO', avoid: ['TERCEIRA_IDADE', 'zzz'], favorite: 1 }), { impact: 'BAIXO', avoid: ['TERCEIRA_IDADE'], favorite: false });
    assert.deepEqual(cleanExtraPatch({ avoid: 'x' }), { avoid: null }); assert.deepEqual(cleanExtraPatch({}), {}); assert.deepEqual(cleanExtraPatch(undefined), {});
    const gen = { target: 'PEITO', mechanic: 'COMPOSTO', equipment: 'BARRA', jointRisk: [] };
    assert.deepEqual(mergeTags(gen, { target: 'X', impact: 'ALTO', favorite: true, avoid: [] }), { ...gen, impact: 'ALTO', favorite: true, avoid: [] }, 'automáticas regeradas, marcações à mão mantidas');
    assert.deepEqual(mergeTags(gen, { impact: 'ALTO' }, { impact: null, favorite: true }), { ...gen, favorite: true }, 'null apaga'); assert.deepEqual(mergeTags(gen, null), gen);
    assert.deepEqual(mergeTags(gen, undefined, { avoid: ['GESTANTE'] }), { ...gen, avoid: ['GESTANTE'] });
  });
  await t('effectiveExtra: a marcação à mão vence a sugestão (e diz de onde veio)', () => {
    const sug = effectiveExtra({ name: 'Pular corda', tags: {} }); assert.equal(sug.impact, 'ALTO'); assert.deepEqual(sug.source, { impact: 'SUGESTAO', avoid: 'SUGESTAO' }); assert.deepEqual(sug.avoid, ['GESTANTE', 'TERCEIRA_IDADE']); assert.equal(sug.favorite, false);
    const hand = effectiveExtra({ name: 'Pular corda', tags: { impact: 'BAIXO', avoid: [], favorite: true } }); assert.equal(hand.impact, 'BAIXO'); assert.deepEqual(hand.avoid, [], 'lista vazia à mão = "serve para todos"'); assert.equal(hand.favorite, true); assert.deepEqual(hand.source, { impact: 'TAG', avoid: 'TAG' });
    assert.equal(effectiveExtra({ tags: undefined }).impact, 'BAIXO');
  });

  // ═════ 2) regras de filtro (puro) ═════
  await t('cleanRules: valor desconhecido some, sem repetição, bloqueado nunca fica fixado, teto de ids', () => {
    const r = cleanRules({ excludeIds: ['a', 'a', ' b ', '', null], pinIds: ['b', 'c', 'c'], excludeEquipment: ['maquina', 'xx', 'POLIA'], excludeJointRisk: ['joelho', 'PUNHO'], noHighImpact: 'sim', avoidProfiles: ['gestante', 'ALIEN'] });
    assert.deepEqual(r, { excludeIds: ['a', 'b'], pinIds: ['c'], excludeEquipment: ['MAQUINA', 'POLIA'], excludeJointRisk: ['JOELHO'], noHighImpact: false, avoidProfiles: ['GESTANTE'], includeEnvironments: [] });
    assert.deepEqual(cleanRules(null), emptyRules()); assert.deepEqual(cleanRules('x'), emptyRules()); assert.equal(cleanRules({ noHighImpact: true }).noHighImpact, true);
    assert.equal(cleanRules({ excludeIds: Array.from({ length: 900 }, (_, i) => 'id' + i) }).excludeIds.length, MAX_IDS);
    assert.ok(isEmptyRules(emptyRules()) && !isEmptyRules(cleanRules({ pinIds: ['x'] })) && !isEmptyRules(cleanRules({ noHighImpact: true })));
  });
  await t('mergeRules + describeRules: soma sem repetir e fala em português', () => {
    const m = mergeRules(cleanRules({ excludeIds: ['a'], excludeEquipment: ['MAQUINA'], avoidProfiles: ['GESTANTE'] }), cleanRules({ excludeIds: ['a', 'b'], pinIds: ['p'], noHighImpact: true, excludeJointRisk: ['LOMBAR'] }));
    assert.deepEqual(m, { excludeIds: ['a', 'b'], pinIds: ['p'], excludeEquipment: ['MAQUINA'], excludeJointRisk: ['LOMBAR'], noHighImpact: true, avoidProfiles: ['GESTANTE'], includeEnvironments: [] });
    assert.deepEqual(describeRules(m), ['sem máquina', 'poupa lombar', 'sem alto impacto', 'perfil: gestante', '2 exercícios bloqueados', '1 exercício fixado']); assert.deepEqual(describeRules(emptyRules()), []);
    assert.deepEqual(describeRules(cleanRules({ excludeIds: ['a'], excludeEquipment: ['PESO_CORPORAL', 'POLIA'] })), ['sem peso do corpo, polia', '1 exercício bloqueado']);
  });
  await t('removalReason: bloqueado > fixado > equipamento > articulação > impacto > perfil; máquina também pelo nome (a tag da biblioteca mente)', () => {
    const ex = (o: any = {}) => lib('e1', o.name || 'Supino', 'PEITO', 'COMPOSTO', o.eq || 'BARRA', { risk: o.risk, extra: o.extra });
    const R = (o: any) => cleanRules(o);
    assert.equal(removalReason(ex(), R({ excludeIds: ['e1'] })), 'excluded'); assert.equal(removalReason(ex(), R({ pinIds: ['e1'], excludeEquipment: ['BARRA'], noHighImpact: true })), null, 'fixar vence as regras');
    assert.equal(removalReason(ex(), R({ excludeEquipment: ['BARRA'] })), 'equipment'); assert.equal(removalReason(ex({ eq: 'LIVRE', name: 'Cadeira abdutora' }), R({ excludeEquipment: ['MAQUINA'] })), 'equipment', 'cadeira abdutora está como LIVRE na biblioteca');
    assert.equal(removalReason(ex({ eq: 'LIVRE', name: 'Flexão' }), R({ excludeEquipment: ['MAQUINA'] })), null);
    assert.equal(removalReason(ex({ risk: ['OMBRO'] }), R({ excludeJointRisk: ['OMBRO'] })), 'joint'); assert.equal(removalReason(ex({ risk: ['OMBRO'] }), R({ excludeJointRisk: ['JOELHO'] })), null);
    assert.equal(removalReason(ex({ name: 'Burpee' }), R({ noHighImpact: true })), 'impact'); assert.equal(removalReason(ex({ name: 'Burpee', extra: { impact: 'BAIXO' } }), R({ noHighImpact: true })), null, 'marcado à mão como baixo: fica');
    assert.equal(removalReason(ex({ name: 'Prancha' }), R({ avoidProfiles: ['GESTANTE'] })), 'profile'); assert.equal(removalReason(ex({ name: 'Prancha' }), R({ avoidProfiles: ['TERCEIRA_IDADE'] })), null);
    assert.equal(removalReason(ex({ name: 'Rosca', extra: { avoid: ['POS_CIRURGIA'] } }), R({ avoidProfiles: ['POS_CIRURGIA'] })), 'profile', 'marcado à mão');
    assert.equal(removalReason(ex({ risk: ['OMBRO'], name: 'Burpee' }), R({ excludeJointRisk: ['OMBRO'], noHighImpact: true })), 'joint', 'a primeira regra que bate conta');
    assert.equal(removalReason(ex(), { ...emptyRules(), excludeIds: ['e1'], pinIds: ['e1'] }), 'excluded', 'se (por erro) vier bloqueado e fixado, bloqueado vence');
  });
  await t('applyRules: conta o que cada filtro tirou, devolve fixados presentes e os que sumiram', () => {
    const L = [lib('a', 'Remada baixa', 'PEITO', 'COMPOSTO', 'BARRA'), lib('b', 'Crucifixo máquina', 'PEITO', 'ISOLADO', 'MAQUINA'), lib('c', 'Burpee', 'CARDIO', 'COMPOSTO', 'LIVRE'), lib('d', 'Prancha', 'ABDOMEN', 'ISOLADO', 'PESO_CORPORAL', { risk: [] }), lib('e', 'Rosca', 'BICEPS', 'ISOLADO', 'HALTER')];
    const r = applyRules(L, cleanRules({ excludeIds: ['e'], excludeEquipment: ['MAQUINA'], noHighImpact: true, avoidProfiles: ['GESTANTE'], pinIds: ['b', 'zzz'] }));
    assert.deepEqual(r.list.map((x) => x.id), ['a', 'b'], 'b fixado sobrevive ao filtro de máquina'); assert.deepEqual(r.removed, { excluded: 1, equipment: 0, joint: 0, impact: 1, profile: 1 }); assert.equal(r.removedTotal, 3);
    assert.deepEqual(r.pinned, ['b']); assert.deepEqual(r.droppedPins, ['zzz']); assert.equal(r.active, true); assert.equal(removedSummary(r.removed), '1 bloqueados à mão, 1 por alto impacto, 1 pelo perfil');
    const none = applyRules(L, emptyRules()); assert.equal(none.list.length, 5); assert.equal(none.active, false); assert.equal(none.removedTotal, 0); assert.deepEqual(none.list, L);
  });

  // ═════ 3) rotas ═════
  const seed = () => {
    for (const k of Object.keys(db)) db[k].length = 0; G.__AI_CALLS = [];
    db.user.push(
      { id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', name: 'Paulo', accountStatus: 'ACTIVE', active: true },
      { id: 'c1', role: 'COACH', email: 'c1@x.com', name: 'Coach 1', accountStatus: 'ACTIVE', active: true }, { id: 'c2', role: 'COACH', email: 'c2@x.com', name: 'Coach 2', accountStatus: 'ACTIVE', active: true },
      { id: 's1', role: 'USER', name: 'Aluna 1', coachId: 'c1', gender: 'Feminino' }, { id: 's2', role: 'USER', name: 'Aluna 2', coachId: 'c2', gender: 'Feminino' },
    );
  };
  const C1 = tok('c1'), C2 = tok('c2'), P = tok(PAULO_ID, 'ADMIN'), S1 = tok('s1', 'USER');
  await t('filtros do aluno (rota): só o coach dele ou o master; o próprio aluno não mexe; a limpeza é feita no servidor; sem tabela avisa', async () => {
    seed(); const P_ = '/api/gen-prefs?userId=s1';
    assert.equal((await call(prefsGET, null, { path: P_ })).status, 401); assert.equal((await call(prefsGET, C1, { path: '/api/gen-prefs' })).status, 400); assert.equal((await call(prefsGET, C1, { path: '/api/gen-prefs?userId=nada' })).status, 404);
    assert.equal((await call(prefsGET, C2, { path: P_ })).status, 403, 'coach de outro aluno'); assert.equal((await call(prefsGET, S1, { path: P_ })).status, 403, 'o aluno não mexe nos filtros dele');
    const g0 = await call(prefsGET, C1, { path: P_ }); assert.equal(g0.status, 200); assert.deepEqual(g0.json.rules, emptyRules()); assert.equal(g0.json.saved, false); assert.equal(g0.json.available, true);
    assert.equal((await call(prefsPUT, C2, { method: 'PUT', body: { userId: 's1', rules: {} } })).status, 403);
    const put = await call(prefsPUT, C1, { method: 'PUT', body: { userId: 's1', presetId: 'p-1', rules: { excludeIds: ['x', 'x'], pinIds: ['x', 'y'], excludeEquipment: ['maquina', 'foo'], noHighImpact: true } } });
    assert.equal(put.status, 200); assert.deepEqual(put.json.rules, { excludeIds: ['x'], pinIds: ['y'], excludeEquipment: ['MAQUINA'], excludeJointRisk: [], noHighImpact: true, avoidProfiles: [], includeEnvironments: [] }); assert.deepEqual(put.json.summary, ['sem máquina', 'sem alto impacto', '1 exercício bloqueado', '1 exercício fixado']);
    assert.equal(db.genPrefs.length, 1); assert.equal(db.genPrefs[0].coachId, 'c1'); const g1 = await call(prefsGET, P, { path: P_ }); assert.equal(g1.json.saved, true); assert.equal(g1.json.presetId, 'p-1'); assert.deepEqual(g1.json.rules.excludeIds, ['x']);
    await call(prefsPUT, P, { method: 'PUT', body: { userId: 's1', rules: { noHighImpact: false } } }); assert.equal(db.genPrefs.length, 1, 'salvar de novo troca, não duplica'); assert.equal(db.genPrefs[0].presetId, null);
    assert.equal((await call(prefsDEL, C2, { method: 'DELETE', path: P_ })).status, 403); assert.equal((await call(prefsDEL, C1, { method: 'DELETE', path: P_ })).status, 200); assert.equal(db.genPrefs.length, 0);
    const saved = (prisma as any).genPrefs; (prisma as any).genPrefs = undefined;   // simula "antes do db push"
    try { const g = await call(prefsGET, C1, { path: P_ }); assert.equal(g.status, 200); assert.equal(g.json.available, false); assert.deepEqual(g.json.rules, emptyRules()); const p = await call(prefsPUT, C1, { method: 'PUT', body: { userId: 's1', rules: {} } }); assert.equal(p.status, 503); assert.equal(p.json.code, 'SEM_TABELA'); assert.equal((await call(prefsDEL, C1, { method: 'DELETE', path: P_ })).status, 200); assert.deepEqual((await loadStudentRules(prisma, 's1')).rules, emptyRules()); } finally { (prisma as any).genPrefs = saved; }
  });
  await t('presets do coach (rota): cria, mesmo nome atualiza, renomear sem repetir, cada coach vê só os seus, apagar só o dono, limite de 30', async () => {
    seed(); const post = (as: string, body: any) => call(presetsPOST, as, { method: 'POST', body });
    assert.equal((await call(presetsGET, null)).status, 401); assert.equal((await post(C1, { name: '  ', rules: {} })).status, 400);
    const a = await post(C1, { name: 'Condomínio  sem máquina', rules: { excludeEquipment: ['MAQUINA'], excludeIds: ['z'] } }); assert.equal(a.status, 200); assert.equal(a.json.preset.name, 'Condomínio sem máquina', 'espaços acertados'); assert.deepEqual(a.json.preset.summary, ['sem máquina', '1 exercício bloqueado']); assert.equal(a.json.updated, false);
    const again = await post(C1, { name: 'Condomínio sem máquina', rules: { noHighImpact: true } }); assert.equal(again.json.updated, true); assert.equal(db.genPreset.length, 1); assert.deepEqual(again.json.preset.rules.excludeEquipment, [], 'trocou as regras do mesmo preset');
    const b = await post(C1, { name: 'Joelho sensível', rules: { excludeJointRisk: ['JOELHO'] } }); assert.equal(db.genPreset.length, 2);
    assert.equal((await post(C1, { id: b.json.preset.id, name: 'Condomínio sem máquina', rules: {} })).status, 409, 'nome já usado'); const ren = await post(C1, { id: b.json.preset.id, name: 'Joelho ruim', rules: { excludeJointRisk: ['JOELHO', 'LOMBAR'] } }); assert.equal(ren.status, 200); assert.equal(ren.json.preset.name, 'Joelho ruim'); assert.equal(db.genPreset.length, 2);
    assert.equal((await post(C2, { id: b.json.preset.id, name: 'x', rules: {} })).status, 404, 'preset de outro coach não se mexe');
    const l1 = await call(presetsGET, C1); assert.deepEqual(l1.json.presets.map((p: any) => p.name), ['Condomínio sem máquina', 'Joelho ruim']); assert.equal((await call(presetsGET, C2)).json.presets.length, 0); assert.equal((await call(presetsGET, C2, { path: '/api/gen-presets?coachId=c1' })).status, 403); assert.equal((await call(presetsGET, P, { path: '/api/gen-presets?coachId=c1' })).json.presets.length, 2, 'master vê');
    assert.equal((await call(presetsDEL, C2, { method: 'DELETE', path: '/api/gen-presets?id=' + b.json.preset.id })).status, 403); assert.equal((await call(presetsDEL, C1, { method: 'DELETE', path: '/api/gen-presets?id=' + b.json.preset.id })).status, 200); assert.equal(db.genPreset.length, 1); assert.equal((await call(presetsDEL, C1, { method: 'DELETE', path: '/api/gen-presets?id=nao-existe' })).status, 200);
    for (let i = 0; i < 29; i++) assert.equal((await post(C1, { name: 'P' + i, rules: {} })).status, 200); assert.equal(db.genPreset.length, 30); assert.equal((await post(C1, { name: 'um a mais', rules: {} })).status, 400, 'limite'); assert.equal((await post(C1, { name: 'P3', rules: { noHighImpact: true } })).status, 200, 'atualizar um existente continua valendo no limite');
    const saved = (prisma as any).genPreset; (prisma as any).genPreset = undefined;
    try { const g = await call(presetsGET, C1); assert.deepEqual(g.json, { presets: [], available: false }); const p = await post(C1, { name: 'x', rules: {} }); assert.equal(p.status, 503); assert.equal(p.json.code, 'SEM_TABELA'); } finally { (prisma as any).genPreset = saved; }
  });
  await t('prévia dos filtros (rota): conta a mesma biblioteca da geração, mostra o que cada filtro tirou e avisa grupo que ficaria sem opção', async () => {
    seed();
    const add = (id: string, name: string, target: string, mech: string, eq: string, extra: any = {}) => db.exercise.push({ ...lib(id, name, target, mech, eq, extra), coachId: 'c1' });
    for (let n = 1; n <= 4; n++) add('pe' + n, 'Peito ' + n, 'PEITO', 'COMPOSTO', n <= 3 ? 'MAQUINA' : 'BARRA'); add('bi1', 'Rosca 1', 'BICEPS', 'ISOLADO', 'HALTER'); add('bi2', 'Rosca 2', 'BICEPS', 'ISOLADO', 'HALTER'); add('bu', 'Burpee', 'CARDIO', 'COMPOSTO', 'LIVRE');
    const days = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2 }, { id: 'BICEPS', qty: 2 }] }];
    const q = (rules: any, as = C1, extra: any = {}) => call(previewPOST, as, { method: 'POST', body: { userId: 's1', rules, days, ...extra } });
    const base = await q({}); assert.equal(base.status, 200); assert.equal(base.json.total, 7); assert.equal(base.json.allowed, 7); assert.equal(base.json.ok, true); assert.deepEqual(base.json.coverage.find((c: any) => c.group === 'PEITO'), { group: 'PEITO', before: 4, after: 4, need: 2 });
    const r1 = await q({ excludeEquipment: ['MAQUINA'], noHighImpact: true, pinIds: ['pe1', 'nada'] }); assert.equal(r1.json.allowed, 4, 'tira 2 máquinas (a fixada fica) e o burpee'); assert.equal(r1.json.removed.equipment, 2); assert.equal(r1.json.removed.impact, 1); assert.deepEqual(r1.json.pinned, [{ id: 'pe1', name: 'Peito 1' }]); assert.deepEqual(r1.json.droppedPins, [{ id: 'nada', name: 'nada' }]); assert.equal(r1.json.removedText, '2 pelo equipamento, 1 por alto impacto'); assert.equal(r1.json.ok, true);
    const r2 = await q({ excludeEquipment: ['MAQUINA'] }); assert.equal(r2.json.coverage.find((c: any) => c.group === 'PEITO').after, 1); assert.equal(r2.json.ok, false); assert.ok(r2.json.issues[0].startsWith('PEITO: sobraram 1 de 4'), r2.json.issues.join());
    db.equipmentReport.push({ id: 'eq1', userId: 's1', exerciseId: 'pe4', status: 'OPEN' }); db.equipmentReport.push({ id: 'eq2', userId: 's1', exerciseId: 'bi1', status: 'RETURNED' });
    const un = await q({}); assert.equal(un.json.afterSafety, 6, 'o aparelho que a aluna disse não ter (aviso em aberto) já sai da conta, como na geração; aviso de "voltou a ter" não conta'); assert.equal(un.json.allowed, 6); db.equipmentReport.length = 0;
    const r3 = await q({ excludeIds: ['bi1'] }); assert.ok(r3.json.issues[0].startsWith('BICEPS: sobraram 1 de 2'));
    assert.equal((await q({}, C2)).status, 403, 'coach de outro aluno'); assert.equal((await q({}, S1)).status, 403); assert.equal((await call(previewPOST, C1, { method: 'POST', body: {} })).status, 400); assert.equal((await call(previewPOST, null, { method: 'POST', body: { userId: 's1' } })).status, 401);
    db.exercise.push({ ...lib('x', 'Peito do outro', 'PEITO'), coachId: 'c2' }); assert.equal((await q({})).json.total, 7, 'só a biblioteca do coach');
    const ok = await q({}, P, { adminId: 'c1' }); assert.equal(ok.json.total, 7, 'master vê a do coach pedido');
  });
  await t('revisão das tags (rota): mostra o valor que vale e de onde veio; coach só edita os próprios; aprovar sugestão grava; editar o exercício e o sync não apagam a marcação', async () => {
    seed();
    const add = (id: string, name: string, coach: string, extra: any = {}) => db.exercise.push({ ...lib(id, name, 'PEITO', 'COMPOSTO', 'LIVRE', { extra }), coachId: coach, category: 'Peito', environments: ['ACADEMIA_PADRAO'], instructions: 'x' });
    add('t1', 'Burpee', 'c1'); add('t2', 'Supino reto', 'c1', { impact: 'BAIXO', avoid: [], favorite: true }); add('t3', 'Rosca direta', 'c2'); add('t4', 'Prancha', PAULO_ID);
    const g = await call(tagsGET, C1, { path: '/api/exercise/tags-review' }); assert.equal(g.status, 200); const by = (id: string) => g.json.items.find((i: any) => i.id === id);
    assert.ok(by('t1') && by('t2') && !by('t3'), 'só a biblioteca visível ao coach'); assert.equal(by('t1').impact, 'ALTO'); assert.deepEqual(by('t1').source, { impact: 'SUGESTAO', avoid: 'SUGESTAO' }); assert.equal(by('t1').editable, true);
    assert.equal(by('t2').impact, 'BAIXO'); assert.deepEqual(by('t2').source, { impact: 'TAG', avoid: 'TAG' }); assert.equal(by('t2').favorite, true); assert.equal(g.json.summary.favorites, 1); assert.equal(g.json.summary.highImpact, 1); assert.equal(g.json.summary.pending, 1, 'só o t1 ainda depende de sugestão (o t4 do Paulo não aparece para o coach)');
    assert.equal((await call(tagsGET, C2, { path: '/api/exercise/tags-review?adminId=c1' })).status, 403); assert.equal((await call(tagsGET, null)).status, 401);
    assert.equal((await call(tagsPOST, C1, { method: 'POST', body: {} })).status, 400);
    const p1 = await call(tagsPOST, C1, { method: 'POST', body: { changes: [{ id: 't1', impact: 'BAIXO', favorite: true }, { id: 't3', impact: 'ALTO' }, { id: 'nao-existe', impact: 'ALTO' }] } }); assert.deepEqual({ updated: p1.json.updated, denied: p1.json.denied }, { updated: 1, denied: 1 });
    const t1 = db.exercise.find((e: any) => e.id === 't1'); assert.equal(t1.tags.impact, 'BAIXO'); assert.equal(t1.tags.favorite, true); assert.equal(t1.tags.target, 'PEITO', 'as outras tags ficam'); assert.equal(db.exercise.find((e: any) => e.id === 't3').tags.impact, undefined, 'exercício de outro coach não muda');
    await call(tagsPOST, C1, { method: 'POST', body: { changes: [{ id: 't1', impact: null, favorite: false, avoid: ['POS_CIRURGIA'] }] } }); assert.deepEqual({ impact: t1.tags.impact, favorite: t1.tags.favorite, avoid: t1.tags.avoid }, { impact: undefined, favorite: undefined, avoid: ['POS_CIRURGIA'] }, 'null apaga e volta à sugestão');
    add('t5', 'Pular corda', 'c1'); const ap = await call(tagsPOST, C1, { method: 'POST', body: { approveIds: ['t5', 't2'] } }); assert.equal(ap.json.updated, 2); const t5 = db.exercise.find((e: any) => e.id === 't5'); assert.equal(t5.tags.impact, 'ALTO'); assert.deepEqual(t5.tags.avoid, ['GESTANTE', 'TERCEIRA_IDADE']); assert.equal(db.exercise.find((e: any) => e.id === 't2').tags.impact, 'BAIXO', 'o que já estava marcado à mão é mantido');
    const both = await call(tagsPOST, C1, { method: 'POST', body: { changes: [{ id: 't1', impact: 'BAIXO' }], approveIds: ['t1'] } }); assert.equal(both.json.updated, 1, 'editado e "aprovado" no mesmo pedido: vale a edição'); assert.equal(db.exercise.find((e: any) => e.id === 't1').tags.impact, 'BAIXO', 'Burpee: a sugestão diria ALTO, mas o coach acabou de marcar BAIXO');
    const mp = await call(tagsPOST, P, { method: 'POST', body: { changes: [{ id: 't3', favorite: true }] } }); assert.equal(mp.json.updated, 1, 'master edita qualquer um'); assert.equal(db.exercise.find((e: any) => e.id === 't3').tags.favorite, true);
    // editar o exercício regera as tags automáticas mas mantém as marcações novas
    const e5 = db.exercise.find((e: any) => e.id === 't5'); e5.tags.equipment = 'ERRADO';
    const put = await call(exercisePUT, C1, { method: 'PUT', body: { id: 't5', adminId: 'c1', name: 'Pular corda', category: 'Cardio', environments: ['UNIVERSAL'] } }); assert.equal(put.status, 200);
    assert.equal(e5.tags.impact, 'ALTO'); assert.deepEqual(e5.tags.avoid, ['GESTANTE', 'TERCEIRA_IDADE']); assert.notEqual(e5.tags.equipment, 'ERRADO', 'as automáticas foram regeradas');
    await call(exercisePUT, C1, { method: 'PUT', body: { id: 't5', adminId: 'c1', name: 'Pular corda', category: 'Cardio', extraTags: { favorite: true, impact: 'BAIXO' } } }); assert.equal(e5.tags.favorite, true); assert.equal(e5.tags.impact, 'BAIXO', 'o formulário de edição também pode marcar');
    e5.tags.equipment = 'ERRADO'; const sy = await quiet(() => call(syncTags, P, { path: '/api/exercise/sync-tags' })); assert.equal(sy.status, 200); assert.equal(e5.tags.favorite, true); assert.equal(e5.tags.impact, 'BAIXO'); assert.notEqual(e5.tags.equipment, 'ERRADO', 'o sync-tags regera as automáticas, sem apagar as marcações');
  });

  // ═════ 4) a geração de treino respeita os filtros ═════
  const TG = ['PEITO', 'BICEPS', 'COSTAS_REMADA'];
  const groups = (qty = 2) => [{ name: 'A', groups: [{ id: 'PEITO', qty, sets: 3, rest: 60 }, { id: 'BICEPS', qty, sets: 3, rest: 30 }] }, { name: 'B', groups: [{ id: 'COSTAS_REMADA', qty, sets: 3, rest: 60 }] }];
  const seedGen = () => {
    seed(); db.user.find((u: any) => u.id === 's1').coachId = PAULO_ID;
    for (const tg of TG) for (let n = 1; n <= 6; n++) db.exercise.push({ id: `${tg.toLowerCase()}-${n}`, coachId: PAULO_ID, name: `${tg} ${n}`, category: 'Musculação', subCategory: tg, videoUrl: 'v', tags: { target: tg, equipment: n <= 3 ? 'MAQUINA' : 'HALTER', mechanic: n === 1 ? 'COMPOSTO' : 'ISOLADO', jointRisk: [] }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
    db.anamnese.push({ id: 'a', userId: 's1', objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 3, limitacoes: [], cirurgias: [], createdAt: new Date() });
    let hook: ((byDay: any) => any) | null = null;
    G.__GEMINI = async ({ contents }: any) => {
      const text = String(contents); const bank: Record<string, Array<{ code: string; name: string }>> = {}; let cur = '';
      for (const line of text.split('\n')) { const h = line.match(/^## ([A-Z_]+)/); if (h) { cur = h[1]; bank[cur] = []; continue; } const m = line.match(/^(E\d{3}) \| (.+?) \| /); if (m && cur) bank[cur].push({ code: m[1], name: m[2] }); }
      // modo antigo (cycleConfig.smart=false): a biblioteca vem em JSON no "BANCO (ambiente ...)"
      const jm = text.match(/BANCO \(ambiente [^)]*\):\n(\[.*\])\n/); if (jm) for (const b of JSON.parse(jm[1])) (bank[b.target] = bank[b.target] || []).push({ code: b.id, name: b.name });
      const out: any = {};
      for (const [, d, body] of text.matchAll(/Dia ([A-Z]):\n((?:    - .*\n?)*)/g)) { out[d] = []; for (const [, g, qty, sets] of (body as string).matchAll(/- ([A-Z_]+): (\d+) exercício\(s\), (\d+) séries/g)) for (let n = 0; n < Number(qty); n++) { const b = (bank[g] || [])[n]; if (b) out[d].push({ exerciseId: b.code, title: b.name, subCategory: g, blocks: Array.from({ length: Number(sets) }, () => ({ sets: '1', reps: '10', load: '', restTime: '60', technique: '' })) }); } }
      return { text: JSON.stringify({ workoutName: 'R', workoutModel: 'CARGA', reasoning: 'x', exercisesByDay: hook ? hook(out) : out }) };
    };
    return { setHook: (h: any) => { hook = h; } };
  };
  const gen = async (cycleConfig: any) => quiet(() => generateWorkoutPlan({ userId: 's1', adminId: PAULO_ID, cycleConfig: { selectedAI: 'GEMINI', phase: 'HIPERTROFIA', techniques: ['BISET'], techniqueScope: 'CYCLE', gender: 'Feminino', trainingEnvironment: 'ACADEMIA_PADRAO', manualExercisesByDay: {}, limitationRules: [], days: groups(), ...cycleConfig } })) as Promise<any>;
  const idsOf = (r: any) => Object.values<any[]>(r.body.exercisesByDay).flat().map((e: any) => e.exerciseId);
  const lastPrompt = () => String(G.__AI_CALLS.at(-1).contents);

  await t('geração: o que o coach bloqueou não chega à IA nem ao treino; o filtro vem no corpo da resposta e no registro de custo', async () => {
    seedGen(); const base = await gen({}); assert.equal(base.status, 200); assert.ok(!('filters' in base.body), 'sem filtros: corpo igual ao de sempre');
    const r = await gen({ genRules: { excludeIds: ['peito-2', 'peito-3'], excludeEquipment: ['MAQUINA'] } }); assert.equal(r.status, 200);
    const p = lastPrompt();
    for (const n of [1, 2, 3]) assert.ok(!new RegExp(`\\| (PEITO|BICEPS|COSTAS_REMADA) ${n} \\|`).test(p), 'máquinas (1–3) fora dos candidatos: ' + n);
    assert.ok(idsOf(r).every((id: string) => /-[456]$/.test(id)), idsOf(r).join()); assert.deepEqual(r.body.filters.summary, ['sem máquina', '2 exercícios bloqueados']); assert.equal(r.body.filters.removedTotal, 9, '9 máquinas (3 por músculo), 2 delas bloqueadas à mão');
    assert.equal(r.body.filters.removed.excluded, 2); assert.equal(r.body.filters.removed.equipment, 7, '9 máquinas − as 2 já bloqueadas à mão'); assert.equal(r.body.filters.pinned, 0);
    const lg = JSON.parse(db.aiLog.filter((l: any) => l.question === 'gerar-treino:GEMINI').at(-1).answer); assert.equal(lg.rulesRemoved, 9);
  });
  await t('geração: sem `genRules` no pedido vale o que está salvo no aluno; `genRules` (até vazio) vale mais; modo antigo (smart:false) também filtra', async () => {
    seedGen(); db.genPrefs.push({ id: 'g', userId: 's1', coachId: PAULO_ID, rules: { excludeIds: ['biceps-4'], excludeEquipment: [] }, presetId: null });
    let r = await gen({}); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(!idsOf(r).includes('biceps-4') && !new RegExp('\\| BICEPS 4 \\|').test(lastPrompt()), 'filtro salvo vale (plano automático também)'); assert.deepEqual(r.body.filters.summary, ['1 exercício bloqueado']);
    r = await gen({ genRules: {} }); assert.ok(!('filters' in r.body), 'a tela mandou "sem filtros": ignora o salvo'); assert.ok(new RegExp('\\| BICEPS 4 \\|').test(lastPrompt()));
    r = await gen({ smart: false, genRules: { excludeIds: ['peito-1'] } }); assert.ok(!idsOf(r).includes('peito-1') && !lastPrompt().includes('"id":"peito-1"'), 'modo antigo: biblioteca já sem o bloqueado'); assert.equal(r.body.filters.removedTotal, 1);
    const saved = (prisma as any).genPrefs; (prisma as any).genPrefs = undefined; try { r = await gen({}); assert.equal(r.status, 200, 'sem a tabela a geração segue normal'); assert.ok(!('filters' in r.body)); } finally { (prisma as any).genPrefs = saved; }
  });
  await t('geração: exercício FIXADO entra mesmo se a IA não escolher (no lugar de um acessório do mesmo músculo), nunca é trocado pela rotação, e aparece como FIXADO para a IA', async () => {
    const ctl = seedGen(); ctl.setHook((byDay: any) => byDay);   // a IA devolve os 2 primeiros de cada grupo
    let r = await gen({ genRules: { pinIds: ['biceps-6'] } }); assert.equal(r.status, 200, JSON.stringify(r.body)); const p = lastPrompt(); assert.ok(/E\d{3} \| BICEPS 6 \| ISOLADO\/HALTER \| FIXADO pelo coach \(obrigatório\)/.test(p), 'marcado FIXADO para a IA');
    assert.ok(idsOf(r).includes('biceps-6'), 'a IA recebeu o fixado no topo e usou'); assert.ok(/BICEPS 6/.test(p.slice(p.indexOf('## BICEPS')).split('\n')[1]), 'o fixado é o 1º da lista do músculo (sem o fixar ele seria o último)'); assert.equal(r.body.filters.pinned, 1);
    // a IA ignora o fixado: o servidor põe
    ctl.setHook((byDay: any) => { byDay.A = byDay.A.filter((e: any) => !/BICEPS 6/.test(e.title)); return byDay; });
    db.workoutHistory.length = 0; r = await gen({ genRules: { pinIds: ['biceps-6'] } }); assert.ok(idsOf(r).includes('biceps-6')); assert.equal(r.body.exercisesByDay.A.filter((e: any) => e.subCategory === 'BICEPS').length, 2, 'continua com 2 bíceps: entrou no lugar de um');
    ctl.setHook((byDay: any) => { let k = 0; byDay.A = byDay.A.map((e: any) => (e.subCategory === 'BICEPS' ? { ...e, exerciseId: `biceps-${++k}`, title: `BICEPS ${k}` } : e)); return byDay; });   // IA completa, mas sem o fixado
    r = await gen({ genRules: { pinIds: ['biceps-6'] } }); assert.ok(idsOf(r).includes('biceps-6'), idsOf(r).join()); assert.ok(r.body.quality.fixes.some((f: string) => f.includes('"BICEPS 6" (fixado por você) entrou no lugar de')), r.body.quality.fixes.join(' | ')); assert.equal(r.body.quality.stats.pinned >= 1, true);
    // fixado que o aluno não pode usar (fora do ambiente): aviso claro
    db.exercise.find((e: any) => e.id === 'peito-5').environments = ['EM_CASA']; r = await gen({ genRules: { pinIds: ['peito-5'] } }); assert.deepEqual(r.body.filters.droppedPins, [{ id: 'peito-5', name: 'PEITO 5' }]); assert.ok(r.body.quality.issues.some((i: string) => i.includes('"PEITO 5" fixado não está disponível')), r.body.quality.issues.join()); assert.equal(r.body.quality.score, 100 - 10 * r.body.quality.issues.length);
  });
  await t('locais (de onde vêm os exercícios): sem escolha vale Universal + o local do aluno (como sempre); com escolha vale a lista do coach; limpeza, resumo e junção de presets', async () => {
    assert.deepEqual(cleanRules({ includeEnvironments: ['condominio', 'ACADEMIA_PADRAO', 'MARTE', 'condominio'] }).includeEnvironments, ['CONDOMINIO', 'ACADEMIA_PADRAO'], 'desconhecido some, sem repetição');
    assert.deepEqual(cleanRules({}).includeEnvironments, []); assert.equal(isEmptyRules(cleanRules({ includeEnvironments: ['OVERALL'] })), false, 'escolher locais já conta como filtro');
    assert.deepEqual(describeRules(cleanRules({ includeEnvironments: ['CONDOMINIO', 'ACADEMIA_PADRAO', 'UNIVERSAL'] })), ['locais: condomínio, academia padrão, universal']);
    assert.deepEqual(mergeRules(cleanRules({ includeEnvironments: ['CONDOMINIO'] }), cleanRules({ includeEnvironments: ['CONDOMINIO', 'UNIVERSAL'] })).includeEnvironments, ['CONDOMINIO', 'UNIVERSAL']);
    assert.deepEqual(effectiveEnvironments(emptyRules(), 'CONDOMINIO'), ['UNIVERSAL', 'CONDOMINIO']); assert.equal(effectiveEnvironments(emptyRules(), 'UNIVERSAL'), null); assert.equal(effectiveEnvironments(emptyRules(), null), null);
    assert.deepEqual(effectiveEnvironments(cleanRules({ includeEnvironments: ['OVERALL'] }), 'CONDOMINIO'), ['OVERALL'], 'a escolha do coach manda');
  });
  await t('locais na geração e na prévia: Newtech (só Overall) não entra para aluno de condomínio; o coach pode somar Academia padrão; a prévia conta igual', async () => {
    const ctl = seedGen(); ctl.setHook((b: any) => b);
    const env = (id: string, e: string[]) => { db.exercise.find((x: any) => x.id === id).environments = e; };
    env('peito-1', ['OVERALL']); env('peito-2', ['OVERALL']); env('peito-3', ['ACADEMIA_PADRAO', 'OVERALL']); env('peito-4', ['ACADEMIA_PADRAO']); env('peito-5', ['CONDOMINIO']); env('peito-6', ['UNIVERSAL']);
    const has = (id: string) => new RegExp('\\| ' + id.replace('-', ' ').toUpperCase() + ' \\|').test(lastPrompt());
    let r = await gen({ trainingEnvironment: 'CONDOMINIO', days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3, rest: 60 }] }] }); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(has('peito-5') && has('peito-6'), 'condomínio e universal entram'); assert.ok(!has('peito-1') && !has('peito-2') && !has('peito-3') && !has('peito-4'), 'Overall e Academia padrão ficam de fora (comportamento de sempre)');
    r = await gen({ trainingEnvironment: 'CONDOMINIO', days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3, rest: 60 }] }], genRules: { includeEnvironments: ['CONDOMINIO', 'ACADEMIA_PADRAO', 'UNIVERSAL'] } }); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(has('peito-3') && has('peito-4') && has('peito-5') && has('peito-6'), 'coach somou a Academia padrão'); assert.ok(!has('peito-1') && !has('peito-2'), 'o que é só Overall continua fora'); assert.deepEqual(r.body.filters.summary, ['locais: condomínio, academia padrão, universal']);
    r = await gen({ trainingEnvironment: 'CONDOMINIO', days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3, rest: 60 }] }], genRules: { includeEnvironments: ['OVERALL', 'UNIVERSAL'] } }); assert.ok(has('peito-1') && has('peito-2') && has('peito-6') && !has('peito-5'), 'escolheu Overall + Universal: Overall entra e Condomínio sai');
    db.genPrefs.push({ id: 'ge', userId: 's1', coachId: PAULO_ID, rules: { includeEnvironments: ['ACADEMIA_PADRAO', 'UNIVERSAL'] }, presetId: null }); r = await gen({ trainingEnvironment: 'CONDOMINIO', days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3, rest: 60 }] }] }); assert.ok(has('peito-4') && !has('peito-5'), 'o que está salvo no aluno vale quando a tela não manda genRules'); db.genPrefs.length = 0;
    // prévia: mesma conta
    const pv = (rules: any) => call(previewPOST, tok(PAULO_ID), { method: 'POST', body: { userId: 's1', adminId: PAULO_ID, trainingEnvironment: 'CONDOMINIO', rules } });
    const a = await pv({}); const b = await pv({ includeEnvironments: ['CONDOMINIO', 'ACADEMIA_PADRAO', 'UNIVERSAL'] }); const c = await pv({ includeEnvironments: ['OVERALL'] });
    assert.equal(a.status, 200, JSON.stringify(a.json)); assert.ok(b.json.total > a.json.total, 'somar a Academia padrão aumenta o total'); assert.ok(c.json.total < b.json.total && c.json.total >= 2, 'só Overall: poucos'); assert.equal(b.json.total - a.json.total, 2, 'entram o peito-3 (Academia padrão + Overall) e o peito-4 (Academia padrão)');
  });
  await t('observações da aluna: dor, "não senti o músculo" e "muito difícil" são lidos; elogio ("sem dor", "não doeu") e texto vazio não alertam; articulação é reconhecida', () => {
    const k = (x: any) => classifyNote(x);
    assert.deepEqual(k('Tive dor no joelho nessa série'), { kind: 'DOR', joint: 'joelho', jointRule: 'JOELHO' }); assert.deepEqual(k('doeu o ombro direito'), { kind: 'DOR', joint: 'ombro', jointRule: 'OMBRO' }); assert.equal(k('Fisgada na lombar')!.jointRule, 'LOMBAR'); assert.deepEqual(k('senti desconforto no punho'), { kind: 'DOR', joint: 'punho', jointRule: null });
    assert.equal(k('NÃO SENTI O MÚSCULO')!.kind, 'SEM_ALVO'); assert.equal(k('não sinto o glúteo trabalhando')!.kind, 'SEM_ALVO'); assert.equal(k('sinto mais na lombar do que no glúteo')!.kind, 'SEM_ALVO'); assert.equal(k('muito difícil, não consigo fazer')!.kind, 'DIFICIL'); assert.equal(k('não gostei desse')!.kind, 'DIFICIL');
    for (const ok of ['sem dor', 'Não senti dor nenhuma', 'não doeu hoje', 'tudo certo, sem desconforto', 'Treino ótimo!', '', null, undefined, 'ok', '12kg']) assert.equal(k(ok), null, String(ok));
    assert.equal(k('não senti dor mas não senti o músculo')!.kind, 'SEM_ALVO', 'o elogio não esconde o outro problema'); assert.equal(k('dor no joelho e muito difícil')!.kind, 'DOR', 'o mais grave manda');
  });
  await t('observações da aluna: agrupa por exercício, vale o mais grave, só os últimos 120 dias, tratado vs pendente, ordem; frases do "Para você conferir"', () => {
    const now = new Date('2026-10-19T12:00:00Z'); const day = (n: number) => new Date(now.getTime() - n * 86400000);
    const hist = [
      { date: day(2), details: [{ exerciseId: 'q2', exerciseName: 'Leg press 45', note: 'não senti o músculo', resolvedAt: null }, { exerciseId: 'p1', exerciseName: 'Supino', note: 'sem dor, ótimo' }, { exerciseId: 'p2', exerciseName: 'Crucifixo', note: '   ' }] },
      { date: day(9), details: [{ exerciseId: 'q2', exerciseName: 'Leg press 45', note: 'dor no joelho', resolvedAt: new Date() }, { exerciseId: 'b1', exerciseName: 'Rosca', note: 'muito pesado, não consegui', coachReplyAt: null }] },
      { date: day(30), details: [{ exerciseId: 'q2', exerciseName: 'Leg press 45', note: 'doeu o joelho de novo' }] },
      { date: day(200), details: [{ exerciseId: 'c1', exerciseName: 'Remada', note: 'dor nas costas' }] },
    ];
    const c = buildConcerns(hist as any, { now }); assert.deepEqual(c.map((x) => [x.exerciseId, x.kind, x.count, x.handled]), [['q2', 'DOR', 3, false], ['b1', 'DIFICIL', 1, false]], 'Remada (200 dias) fora; Supino "sem dor" fora; o mais grave vence');
    const q2 = c[0]; assert.equal(q2.joint, 'joelho'); assert.equal(q2.last.text, 'não senti o músculo', 'a mais recente é a última'); assert.deepEqual(q2.texts, ['não senti o músculo', 'dor no joelho', 'doeu o joelho de novo']); assert.equal(q2.handled, false, 'a mais recente ainda não foi tratada');
    const inv = buildConcerns([...hist].reverse() as any, { now })[0]; assert.equal(inv.last.text, 'não senti o músculo', 'a ordem de entrada não importa: vale a data'); assert.equal(inv.handled, false);
    assert.equal(buildConcerns([{ date: day(1), details: [{ exerciseId: 'x', exerciseName: 'X', note: 'dor', resolvedAt: new Date() }] }] as any, { now })[0].handled, true);
    const issues = concernIssues(c, new Set(['q2'])); assert.equal(issues.length, 1); assert.ok(issues[0].startsWith('"Leg press 45" voltou no treino, mas a aluna anotou em 17/10 (dor ou desconforto, joelho): "não senti o músculo"') && issues[0].endsWith('Vale trocar?'), issues[0]);
    assert.deepEqual(concernIssues(c, new Set(['zzz'])), [], 'não voltou: sem aviso'); assert.ok(concernIssues(buildConcerns([{ date: day(1), details: [{ exerciseId: 'x', exerciseName: 'X', note: 'dor', coachReplyAt: new Date() }] }] as any, { now }), new Set(['x']))[0].includes('você já respondeu'));
    assert.deepEqual(buildConcerns(null as any), []);
  });
  await t('observações da aluna (rota): só o coach dele/master, lista com tipo em português e o que continua na rotina atual; sem observação: lista vazia', async () => {
    seed(); db.workoutHistory.length = 0; db.workout.length = 0;
    db.workout.push({ id: 'wcur', userId: 's1', name: 'Atual', workoutModel: 'CARGA', createdAt: new Date(), exercises: [{ exerciseId: 'q2' }] });
    const ago = (n: number) => new Date(Date.now() - n * 86400000);
    db.workoutHistory.push({ id: 'h1', userId: 's1', date: ago(3), details: [{ exerciseId: 'q2', exerciseName: 'Leg press 45', note: 'dor no joelho' }, { exerciseId: 'b1', exerciseName: 'Rosca', note: 'não senti o bíceps' }] });
    const g = (as: string | null, uid = 's1') => call(concernsGET, as, { path: '/api/gen-prefs/concerns?userId=' + uid });
    const r = await g(C1); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.total, 2); assert.deepEqual(r.json.concerns.map((c: any) => [c.exerciseId, c.kind, c.kindLabel, c.joint, c.inCurrent]), [['q2', 'DOR', 'dor ou desconforto', 'joelho', true], ['b1', 'SEM_ALVO', 'não sentiu o músculo', null, false]]);
    assert.equal((await g(C2)).status, 403, 'coach de outro aluno'); assert.equal((await g(S1)).status, 403, 'o próprio aluno não vê'); assert.equal((await g(null)).status, 401); assert.equal((await call(concernsGET, C1, { path: '/api/gen-prefs/concerns' })).status, 400); assert.equal((await g(C1, 'nao-existe')).status, 404);
    db.workoutHistory.length = 0; const vazio = await g(C1); assert.deepEqual(vazio.json, { concerns: [], total: 0 });
  });
  await t('observações da aluna na geração: exercício com dor/"não senti" que VOLTOU no treino novo aparece em "Para você conferir" (sem trocar nada e sem mudar a nota); se não voltou, nada aparece', async () => {
    const ctl = seedGen(); ctl.setHook((b: any) => b); db.workoutHistory.length = 0;
    const ago = (n: number) => new Date(Date.now() - n * 86400000);
    db.workoutHistory.push({ id: 'hh', userId: 's1', date: ago(2), details: [{ exerciseId: 'peito-1', exerciseName: 'PEITO 1', note: 'tive dor no ombro nesse', setNumber: 1, weight: 10, reps: '10' }, { exerciseId: 'zzz-fora', exerciseName: 'Outro', note: 'dor no joelho', setNumber: 1, weight: 10, reps: '10' }] });
    let r = await gen({ genRules: { pinIds: ['peito-1'] } }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(idsOf(r).includes('peito-1'));
    const found = r.body.quality.issues.filter((i: string) => i.includes('voltou no treino')); assert.equal(found.length, 1, r.body.quality.issues.join(' | ')); assert.ok(found[0].includes('"PEITO 1"') && found[0].includes('dor ou desconforto, ombro') && found[0].includes('tive dor no ombro nesse'), found[0]);
    assert.ok(!r.body.quality.issues.some((i: string) => i.includes('Outro')), 'quem não voltou não alerta'); assert.ok(r.body.exercisesByDay.A.some((e: any) => e.exerciseId === 'peito-1'), 'nada foi trocado sozinho');
    r = await gen({ genRules: { excludeIds: ['peito-1'] } }); assert.ok(!r.body.quality.issues.some((i: string) => i.includes('voltou no treino')), 'bloqueado: não volta, não alerta');
    db.workoutHistory.length = 0;
  });
  await t('geração: o fixado repete mesmo que a rotação mandasse trocar (e o fixado de outro músculo sem vaga no plano vira aviso)', async () => {
    const ctl = seedGen(); ctl.setHook((b: any) => b);
    db.workout.push({ id: 'wp', userId: 's1', name: 'Anterior', workoutModel: 'CARGA', createdAt: new Date(Date.now() - 5000) }); let o = 0;
    for (const [d, g, n] of [['A', 'peito', 1], ['A', 'peito', 2], ['A', 'biceps', 2], ['B', 'costas_remada', 1]] as const) db.workoutExercise.push({ id: `w-${g}-${n}`, workoutId: 'wp', exerciseId: `${g}-${n}`, day: d, order: o++, sets: 3, reps: '10', restTime: 60, technique: JSON.stringify({ t: '', b: [{ sets: '1', reps: '10', restTime: '60', technique: '' }] }) });
    let r = await gen({}); assert.ok(!idsOf(r).includes('biceps-2'), 'acessório da rotina anterior gira'); assert.ok(/BICEPS 2 · \[acessório, 1 rotina seguidas\].* → TROCAR/.test(lastPrompt()), lastPrompt().slice(lastPrompt().indexOf('ROTINA ANTERIOR'), lastPrompt().indexOf('ROTINA ANTERIOR') + 500)); r = await gen({ genRules: { pinIds: ['biceps-2'] } }); assert.ok(idsOf(r).includes('biceps-2'), 'fixado repete: ' + idsOf(r).join()); assert.ok(/BICEPS 2 · \[acessório, 1 rotina seguidas\].* → MANTER/.test(lastPrompt()), 'a IA lê o fixado como MANTER, não como TROCAR');
    ctl.setHook((b: any) => { b.A = [...b.A, { exerciseId: 'biceps-2', title: 'BICEPS 2', blocks: b.A[0].blocks }]; return b; }); r = await gen({ genRules: { pinIds: ['biceps-2'] } }); assert.equal(idsOf(r).filter((id: string) => id === 'biceps-2').length, 1, 'sem duplicar');
    ctl.setHook((b: any) => b); db.exercise.push({ id: 'perna-1', coachId: PAULO_ID, name: 'PERNA 1', category: 'Musculação', subCategory: 'QUADRICEPS', videoUrl: 'v', tags: { target: 'QUADRICEPS', equipment: 'LIVRE', mechanic: 'COMPOSTO', jointRisk: [] }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
    r = await gen({ genRules: { pinIds: ['perna-1'] } }); assert.ok(!idsOf(r).includes('perna-1')); assert.ok(r.body.quality.issues.some((i: string) => i.includes('"PERNA 1" fixado não coube')), r.body.quality.issues.join());
  });
  await t('geração: filtros que esvaziam um grupo param antes da IA (BANCO_INSUFICIENTE) e a IA nem é chamada; favorito sobe na lista', async () => {
    seedGen(); let r = await gen({ genRules: { excludeEquipment: ['MAQUINA'], excludeIds: ['peito-4', 'peito-5'] } }); assert.equal(r.status, 422); assert.equal(r.body.code, 'BANCO_INSUFICIENTE'); assert.ok(r.body.error.includes('PEITO: sobraram 1 de 6'), r.body.error); assert.equal(G.__AI_CALLS.length, 0, 'IA não foi chamada');
    seedGen(); db.exercise.find((e: any) => e.id === 'costas_remada-6').tags.favorite = true; r = await gen({}); assert.equal(r.status, 200); const p = lastPrompt(); const sec = p.slice(p.indexOf('## COSTAS_REMADA')); assert.ok(sec.indexOf('COSTAS_REMADA 6') < sec.indexOf('COSTAS_REMADA 2'), 'favorito do coach sobe na lista (sem a marca, o 2 vem antes do 6 pela ordem do nome): ' + sec.slice(0, 400));
    seedGen(); r = await gen({ genRules: { excludeJointRisk: [], noHighImpact: true, avoidProfiles: ['GESTANTE'] } }); assert.equal(r.status, 200); assert.ok(r.body.filters.summary.includes('sem alto impacto'));
  });

  await t('substitutos: por padrão SÓ vale o que o coach marcou na biblioteca (a IA e o servidor não escolhem outro)', async () => {
    const ctl = seedGen();
    db.exercise.find((e: any) => e.id === 'biceps-1').defaultSubstitutes = ['biceps-5'];
    ctl.setHook((byDay: any) => { for (const d of Object.keys(byDay)) for (const ex of byDay[d]) ex.substitute = { exerciseId: 'biceps-4', title: 'qualquer' }; return byDay; });
    const r = await gen({}); assert.equal(r.status, 200);
    const all = Object.values<any[]>(r.body.exercisesByDay).flat();
    assert.ok(all.length > 0);
    const tagged = new Map<string, string[]>(db.exercise.filter((e: any) => (e.defaultSubstitutes || []).length).map((e: any) => [e.id, e.defaultSubstitutes]));
    for (const e of all) { if (e.substitute) assert.ok((tagged.get(e.exerciseId) || []).includes(e.substitute.id), 'substituto não marcado: ' + e.exerciseId + '>' + e.substitute.id); }
    const b1 = all.find((e: any) => e.exerciseId === 'biceps-1'); if (b1) assert.equal(b1.substitute.id, 'biceps-5', 'o marcado pelo coach vence');
    const other = all.find((e: any) => !tagged.has(e.exerciseId)); assert.ok(other && !other.substitute, 'sem marcação = sem substituto');
  });

  await t('substitutos (subsOnlyTagged:false): o que o coach marcou manda; a IA nunca coloca alongamento/mobilidade no lugar de musculação (cai num exercício do mesmo músculo)', async () => {
    const ctl = seedGen();
    db.exercise.push({ id: 'mob-1', coachId: PAULO_ID, name: 'Alongamento de bíceps', category: 'Mobilidade', subCategory: 'Geral', videoUrl: 'v', tags: { target: 'MOBILIDADE', equipment: 'LIVRE', mechanic: 'ISOLADO', jointRisk: [] }, environments: ['UNIVERSAL'] } as any);
    db.exercise.find((e: any) => e.id === 'biceps-1').defaultSubstitutes = ['biceps-5'];
    ctl.setHook((byDay: any) => { for (const d of Object.keys(byDay)) for (const ex of byDay[d]) ex.substitute = { exerciseId: 'mob-1', title: 'Alongamento de bíceps' }; return byDay; });
    const r = await gen({ subsOnlyTagged: false }); assert.equal(r.status, 200);
    const all = Object.values<any[]>(r.body.exercisesByDay).flat();
    assert.ok(all.length > 0 && all.every((e: any) => !e.substitute || e.substitute.id !== 'mob-1'), 'nenhum substituto de mobilidade');
    const withSub = all.filter((e: any) => e.substitute);
    assert.ok(withSub.length > 0 && withSub.every((e: any) => String(e.substitute.id).split('-')[0] === String(e.exerciseId).split('-')[0]), 'substituto do mesmo músculo: ' + withSub.map((e: any) => e.exerciseId + '>' + e.substitute.id).join());
    const b1 = all.find((e: any) => e.exerciseId === 'biceps-1'); if (b1) assert.equal(b1.substitute.id, 'biceps-5', 'o marcado pelo coach vence');
  });

  await t('muscleTarget: a categoria corrige a etiqueta errada (abdominal "PEITO" vira ABDOMEN); o resto fica como o coach etiquetou', () => {
    const e = (category: string, target: string | undefined, subCategory = 'Geral') => ({ category, subCategory, tags: target ? { target } : {} });
    assert.equal(muscleTarget(e('Abdômen', 'PEITO', 'Supra')), 'ABDOMEN'); assert.equal(muscleTarget(e('Abdômen', 'ABDÔMEN')), 'ABDOMEN'); assert.equal(muscleTarget(e('Abdômen', undefined)), 'ABDOMEN');
    assert.equal(muscleTarget(e('Bíceps', 'PEITO')), 'BICEPS'); assert.equal(muscleTarget(e('Tríceps', 'PEITO')), 'TRICEPS'); assert.equal(muscleTarget(e('Bíceps', 'TRICEPS')), 'BICEPS');
    assert.equal(muscleTarget(e('Costas', 'PEITO', 'Puxadas')), 'COSTAS_PUXADA'); assert.equal(muscleTarget(e('Costas', 'PEITO', 'Remadas')), 'COSTAS_REMADA'); assert.equal(muscleTarget(e('Costas', 'PEITO', 'Geral')), 'COSTAS');
    assert.equal(muscleTarget(e('Ombros', 'PEITO', 'Lateral')), 'OMBRO_LATERAL'); assert.equal(muscleTarget(e('Ombros', 'PEITO', 'Geral')), 'OMBROS'); assert.equal(muscleTarget(e('Ombros', 'POSTERIOR')), 'OMBRO_POST', 'posterior de ombros não é coxa');
    assert.equal(muscleTarget(e('Pernas', 'PEITO', 'Glúteos')), 'GLUTEOS'); assert.equal(muscleTarget(e('Pernas', 'PEITO', 'Posteriores')), 'POSTERIOR'); assert.equal(muscleTarget(e('Pernas', 'PEITO', 'Geral')), 'PERNAS');
    assert.equal(muscleTarget(e('Peito', 'PEITO')), 'PEITO', 'peito de verdade continua peito'); assert.equal(muscleTarget(e('Costas', 'COSTAS_REMADA')), 'COSTAS_REMADA'); assert.equal(muscleTarget(e('Pernas', 'GLUTEOS')), 'GLUTEOS'); assert.equal(muscleTarget(e('Pernas', 'PERNAS')), 'PERNAS');
    // 🦵 Pernas > Multiarticular (agachamento, leg press, passada...) é o grupo "Pernas — Multi.", seja QUADRICEPS ou o genérico PERNAS; os isolados continuam no músculo
    assert.equal(muscleTarget(e('Pernas', 'PERNAS', 'Multiarticular')), 'PERNAS_MULTI'); assert.equal(muscleTarget(e('Pernas', 'QUADRICEPS', 'Multiarticular')), 'PERNAS_MULTI'); assert.equal(muscleTarget(e('Pernas', undefined, 'Multiarticular')), 'PERNAS_MULTI');
    assert.equal(muscleTarget(e('Pernas', 'QUADRICEPS', 'Quadríceps')), 'QUADRICEPS'); assert.equal(muscleTarget(e('Pernas', 'PERNAS', 'Geral')), 'PERNAS'); assert.equal(muscleTarget(e('Peito', 'PEITO', 'Multiarticular')), 'PEITO', 'multi de outra categoria não vira perna'); assert.equal(muscleTarget(e('Ombros', 'PEITO', 'Multiarticular')), 'OMBRO_MULTI');
    assert.equal(muscleTarget(e('Musculação', undefined)), 'MUSCULACAO', 'sem etiqueta: a categoria'); assert.equal(muscleTarget(null), '');
    assert.deepEqual(targetMismatch(e('Abdômen', 'PEITO', 'Supra')), { from: 'PEITO', to: 'ABDOMEN' }); assert.equal(targetMismatch(e('Peito', 'PEITO')), null); assert.equal(targetMismatch(e('Abdômen', 'ABDÔMEN')), null);
  });

  await t('geração: abdômen mal etiquetado como PEITO entra no grupo de abdômen e fica DEPOIS de peito e braços (o erro do treino do Paulo)', async () => {
    const ctl = seedGen();
    for (let n = 1; n <= 6; n++) db.exercise.push({ id: `abdomen-${n}`, coachId: PAULO_ID, name: `Abdominal ${n}`, category: 'Abdômen', subCategory: 'Supra', videoUrl: 'v', tags: { target: 'PEITO', equipment: 'LIVRE', mechanic: 'ISOLADO', jointRisk: [] }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
    // a IA põe o abdômen no meio do treino (como saiu no dia E)
    ctl.setHook((byDay: any) => { for (const d of Object.keys(byDay)) { const ab = byDay[d].filter((e: any) => String(e.exerciseId).length && /Abdominal/.test(e.title)); const rest = byDay[d].filter((e: any) => !ab.includes(e)); byDay[d] = [rest[0], ...ab, ...rest.slice(1)]; } return byDay; });
    const r = await gen({ days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3, rest: 60 }, { id: 'BICEPS', qty: 2, sets: 3, rest: 30 }, { id: 'ABDOMEN', qty: 1, sets: 3, rest: 30 }] }] });
    assert.equal(r.status, 200); const ids = idsOf(r).map((x: string) => x.split('-')[0]);
    assert.equal(ids.filter((x: string) => x === 'abdomen').length, 1, 'o abdômen entrou como abdômen: ' + ids.join());
    assert.ok(ids.indexOf('abdomen') > ids.lastIndexOf('biceps') && ids.indexOf('abdomen') > ids.lastIndexOf('peito'), 'abdômen por último: ' + ids.join());
    // um dia só de peito nunca recebe o abdominal como "peito"
    const p = await gen({ days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 6, sets: 3, rest: 60 }] }] }); assert.ok(idsOf(p).every((x: string) => !x.startsWith('abdomen')), 'abdominal fora do peito: ' + idsOf(p).join());
  });

  await t('repetições: teto de 15 por padrão (nunca 18/20), panturrilha até 20, e o coach pode escolher outro teto', async () => {
    const ctl = seedGen();
    for (let n = 1; n <= 4; n++) db.exercise.push({ id: `panturrilha-${n}`, coachId: PAULO_ID, name: `Panturrilha ${n}`, category: 'Pernas', subCategory: 'Panturrilha', videoUrl: 'v', tags: { target: 'PANTURRILHA', equipment: 'MAQUINA', mechanic: 'ISOLADO', jointRisk: [] }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
    ctl.setHook((byDay: any) => { for (const d of Object.keys(byDay)) for (const ex of byDay[d]) ex.blocks = ex.blocks.map((b: any, i: number) => ({ ...b, reps: String([20, 18, 15, 15][i % 4]) })); return byDay; });
    const days = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 4, rest: 60 }, { id: 'PANTURRILHA', qty: 1, sets: 4, rest: 30 }] }];
    const reps = (r: any, pre: string) => Object.values<any[]>(r.body.exercisesByDay).flat().filter((e: any) => e.exerciseId.startsWith(pre)).flatMap((e: any) => e.blocks.map((b: any) => Number(b.reps)));
    const r = await gen({ phase: 'EMAGRECIMENTO', days }); assert.equal(r.status, 200);
    assert.ok(reps(r, 'peito').length > 0 && reps(r, 'peito').every((n: number) => n <= 15), 'peito até 15: ' + reps(r, 'peito').join());
    assert.ok(Math.max(...reps(r, 'panturrilha')) > 15 && reps(r, 'panturrilha').every((n: number) => n <= 20), 'panturrilha pode passar de 15: ' + reps(r, 'panturrilha').join());
    assert.ok(lastPrompt().includes('NENHUMA série passa de 15'), 'a IA recebe o teto');
    const hi = await gen({ phase: 'EMAGRECIMENTO', days, maxReps: 20 }); assert.ok(Math.max(...reps(hi, 'peito')) >= 18, 'teto 20 do coach: ' + reps(hi, 'peito').join()); assert.ok(lastPrompt().includes('TETO DE REPETIÇÕES DESTE COACH: nenhuma série passa de 20'));
    const lo = await gen({ phase: 'HIPERTROFIA', days, maxReps: 12 }); assert.ok(Math.max(...reps(lo, 'peito')) <= 12 && Math.max(...reps(lo, 'panturrilha')) <= 12, 'teto 12 vale até na panturrilha: ' + reps(lo, 'peito').join() + ' / ' + reps(lo, 'panturrilha').join());
  });

  await t('estilo do coach: ordem por tipo de dia, regras entre músculos e entre exercícios, cardio no começo; estilo quebrado não atrapalha', () => {
    assert.equal(kindOfDay(['PEITO', 'ABDOMEN']), 'UPPER'); assert.equal(kindOfDay(['GLUTEOS', 'PANTURRILHA', 'ABDOMEN']), 'LOWER'); assert.equal(kindOfDay(['QUADRICEPS', 'BICEPS']), 'FULL'); assert.equal(kindOfDay(['ABDOMEN']), 'UPPER');
    const ex = (id: string, g: string | null, comp = false, tech = '', kind: any = 'FORCA') => ({ id, g, comp, tech, kind });
    const run = (list: any[], groups: string[], style: any, cardioAt?: string) => orderDayExercises(list, { groups, groupOf: (e: any) => e.g, isCompound: (e: any) => e.comp, kind: (e: any) => e.kind, technique: (e: any) => e.tech, style, exId: (e: any) => e.id, cardioAt });
    const ids = (r: any) => r.list.map((e: any) => e.id).join();
    const day = () => [ex('ab1', 'ABDOMEN'), ex('bi1', 'BICEPS'), ex('pe1', 'PEITO', true), ex('tri1', 'TRICEPS')];
    // ordem por tipo de dia: a lista do coach manda (aqui o coach quer abdômen no meio, antes dos braços)
    let r = run(day(), ['PEITO', 'ABDOMEN', 'BICEPS', 'TRICEPS'], { orders: { UPPER: ['PEITO', 'ABDOMEN', 'TRICEPS', 'BICEPS'] }, rules: [] }); assert.equal(ids(r), 'pe1,ab1,tri1,bi1', 'a lista do coach manda');
    r = run(day(), ['PEITO', 'ABDOMEN', 'BICEPS', 'TRICEPS'], { orders: { UPPER: ['PEITO', 'ABDOMEN', 'BICEPS', 'TRICEPS'] }, rules: [{ a: { k: 'G', id: 'ABDOMEN' }, rel: 'DEPOIS', b: { k: 'G', id: 'TRICEPS' }, when: 'SEMPRE' }] }); assert.equal(ids(r), 'pe1,bi1,tri1,ab1', 'regra "abdômen depois de tríceps" vence a lista');
    r = run(day(), ['PEITO', 'ABDOMEN', 'BICEPS', 'TRICEPS'], { orders: {}, rules: [{ a: { k: 'G', id: 'ABDOMEN' }, rel: 'DEPOIS', b: { k: 'G', id: 'TRICEPS' }, when: 'LOWER' }] }); assert.equal(ids(r), 'pe1,ab1,bi1,tri1', 'regra só para pernas não vale num dia de cima (sem lista: ordem da estrutura)');
    // full body: regra entre exercício específico e músculo / exercício
    const fb = () => [ex('bi1', 'BICEPS'), ex('hack', 'QUADRICEPS', true), ex('ab1', 'ABDOMEN'), ex('stiff', 'POSTERIORES', true)];
    const groups = ['BICEPS', 'QUADRICEPS', 'ABDOMEN', 'POSTERIORES'];
    r = run(fb(), groups, { orders: { FULL: ['BICEPS', 'ABDOMEN', 'QUADRICEPS', 'POSTERIORES'] }, rules: [{ a: { k: 'E', id: 'hack' }, rel: 'ANTES', b: { k: 'G', id: 'BICEPS' }, when: 'FULL' }] }); assert.equal(ids(r), 'hack,bi1,ab1,stiff', 'Hack antes de bíceps (o resto segue a lista)');
    r = run(fb(), groups, { orders: { FULL: ['QUADRICEPS', 'POSTERIORES', 'BICEPS', 'ABDOMEN'] }, rules: [{ a: { k: 'E', id: 'stiff' }, rel: 'DEPOIS', b: { k: 'E', id: 'ab1' }, when: 'SEMPRE' }] }); assert.equal(ids(r), 'hack,bi1,ab1,stiff', 'Stiff depois do abdominal');
    r = run(fb(), groups, { orders: { FULL: ['BICEPS', 'ABDOMEN', 'QUADRICEPS', 'POSTERIORES'] }, rules: [{ a: { k: 'E', id: 'hack' }, rel: 'ANTES', b: { k: 'G', id: 'BICEPS' }, when: 'UPPER' }] }); assert.equal(ids(r), 'bi1,ab1,hack,stiff', 'regra de "só parte de cima" não vale no full body');
    r = run(fb(), groups, { orders: { FULL: ['BICEPS', 'ABDOMEN', 'QUADRICEPS', 'POSTERIORES'] }, rules: [{ a: { k: 'E', id: 'naoexiste' }, rel: 'ANTES', b: { k: 'G', id: 'BICEPS' }, when: 'SEMPRE' }] }); assert.equal(ids(r), 'bi1,ab1,hack,stiff', 'exercício que não está no dia: regra ignorada');
    // bi-set continua inteiro e cardio no começo vai depois da mobilidade
    r = run([ex('c1', null, false, '', 'CARDIO'), ex('m1', null, false, '', 'MOB'), ex('pe1', 'PEITO', true), ex('bi1', 'BICEPS', false, 'BISET'), ex('bi2', 'BICEPS', false, 'BISET')], ['PEITO', 'BICEPS'], { orders: { UPPER: ['BICEPS', 'PEITO'] }, rules: [] }, 'COMECO'); assert.equal(ids(r), 'm1,c1,bi1,bi2,pe1', 'mobilidade, cardio, depois o bi-set inteiro');
    r = run([ex('c1', null, false, '', 'CARDIO'), ex('pe1', 'PEITO', true), ex('bi1', 'BICEPS')], ['PEITO', 'BICEPS'], { orders: { UPPER: ['PEITO', 'BICEPS'] }, rules: [] }); assert.equal(ids(r), 'pe1,bi1,c1', 'cardio no fim por padrão');
    // seguir a ordem que o coach deixou no dia (keepGroupOrder): vale no lugar da lista por tipo de dia, e as regras entre músculos ainda mandam por cima
    const runKeep = (list: any[], groups: string[], style: any) => orderDayExercises(list, { groups, keepGroupOrder: true, groupOf: (e: any) => e.g, isCompound: (e: any) => e.comp, kind: (e: any) => e.kind, technique: (e: any) => e.tech, style, exId: (e: any) => e.id });
    const lista = { orders: { UPPER: ['PEITO', 'ABDOMEN', 'BICEPS', 'TRICEPS'] }, rules: [] as any[] };
    assert.equal(ids(runKeep(day(), ['BICEPS', 'TRICEPS', 'PEITO', 'ABDOMEN'], lista)), 'bi1,tri1,pe1,ab1', 'o dia está bíceps, tríceps, peito, abdômen: a lista do coach por tipo de dia é ignorada');
    assert.equal(ids(run(day(), ['BICEPS', 'TRICEPS', 'PEITO', 'ABDOMEN'], lista)), 'pe1,ab1,bi1,tri1', 'sem seguir o dia, a lista por tipo de dia manda (como antes)');
    assert.equal(ids(runKeep(day(), ['BICEPS', 'TRICEPS', 'PEITO', 'ABDOMEN'], { ...lista, rules: [{ a: { k: 'G', id: 'ABDOMEN' }, rel: 'ANTES', b: { k: 'G', id: 'BICEPS' }, when: 'SEMPRE' }] })), 'ab1,bi1,tri1,pe1', 'seguindo o dia, a regra "abdômen antes de bíceps" ainda vale');
    assert.equal(ids(runKeep([ex('c1', null, false, '', 'CARDIO'), ex('m1', null, false, '', 'MOB'), ...day()], ['BICEPS', 'PEITO', 'TRICEPS', 'ABDOMEN'], lista)), 'm1,bi1,pe1,tri1,ab1,c1', 'mobilidade no começo e cardio no fim continuam');
    // estilo quebrado: volta para a ordem padrão
    assert.equal(cleanOrderStyle(null), null); assert.equal(cleanOrderStyle('x'), null); assert.equal(cleanOrderStyle({ orders: { UPPER: 'x' }, rules: [{ a: { k: 'X', id: 'a' }, rel: 'ANTES', b: { k: 'G', id: 'PEITO' } }] }), null);
    assert.deepEqual(cleanOrderStyle({ orders: { UPPER: ['PEITO', 'PEITO', 'XYZ', 'BICEPS'] }, rules: [{ a: { k: 'G', id: 'PEITO' }, rel: 'ANTES', b: { k: 'G', id: 'PEITO' } }] })!.orders.UPPER, ['PEITO', 'BICEPS'], 'repetido e desconhecido saem');
    assert.equal(ids(run(day(), ['PEITO', 'ABDOMEN', 'BICEPS', 'TRICEPS'], 'lixo')), 'pe1,bi1,tri1,ab1', 'sem estilo válido: padrão por nível (abdômen por último)');
  });

  await t('geração: o estilo do coach (orderStyle) muda a ordem do treino gerado; sem ele vale a ordem padrão', async () => {
    seedGen();
    const days = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3, rest: 60 }, { id: 'BICEPS', qty: 2, sets: 3, rest: 30 }] }];
    const base = await gen({ days }); const g = (r: any) => idsOf(r).map((x: string) => x.split('-')[0]);
    assert.ok(g(base).lastIndexOf('peito') < g(base).indexOf('biceps'), 'padrão: peito antes de bíceps: ' + g(base).join());
    const own = await gen({ days, orderStyle: { orders: { UPPER: ['BICEPS', 'PEITO'] }, rules: [] } });
    assert.ok(g(own).lastIndexOf('biceps') < g(own).indexOf('peito'), 'o coach mandou bíceps primeiro: ' + g(own).join());
    const ds = [{ name: 'A', groups: [{ id: 'BICEPS', qty: 2, sets: 3, rest: 30 }, { id: 'PEITO', qty: 2, sets: 3, rest: 60 }] }];
    const follow = await gen({ days: ds, keepGroupOrder: true, orderStyle: { orders: { UPPER: ['PEITO', 'BICEPS'] }, rules: [] } });
    assert.ok(g(follow).lastIndexOf('biceps') < g(follow).indexOf('peito'), 'keepGroupOrder + estilo: segue o dia (bíceps primeiro): ' + g(follow).join());
    const notFollow = await gen({ days: ds, orderStyle: { orders: { UPPER: ['PEITO', 'BICEPS'] }, rules: [] } });
    assert.ok(g(notFollow).lastIndexOf('peito') < g(notFollow).indexOf('biceps'), 'sem seguir o dia: vale a lista (peito primeiro): ' + g(notFollow).join());
    const fixes = (own.body.quality?.fixes || []).join(' '); assert.ok(/que você escolheu/.test(fixes), 'o resumo diz que seguiu a ordem do coach: ' + fixes);
  });

  await t('ordem: músculo grande antes de pequeno, cada músculo junto, composto antes do isolado, bi/tri-set inteiros, mobilidade no começo e cardio no fim', () => {
    assert.deepEqual(orderedGroupIds(['BICEPS', 'TRICEPS', 'COSTAS_PUXADA', 'COSTAS_REMADA']), ['COSTAS_PUXADA', 'COSTAS_REMADA', 'BICEPS', 'TRICEPS'], 'costas antes de braços');
    assert.deepEqual(orderedGroupIds(['GLUTEOS', 'QUADRICEPS', 'PANTURRILHA']), ['GLUTEOS', 'QUADRICEPS', 'PANTURRILHA'], 'mesmo nível: ordem do coach (glúteos foco)');
    assert.deepEqual(orderedGroupIds(['BICEPS', 'PEITO'], true), ['BICEPS', 'PEITO'], 'keepGroupOrder segue a estrutura');
    const ex = (id: string, g: string | null, comp = false, tech = '', kind: any = 'FORCA') => ({ id, g, comp, tech, kind });
    const run = (list: any[], groups: string[], keep = false) => orderDayExercises(list, { groups, keepGroupOrder: keep, groupOf: (e: any) => e.g, isCompound: (e: any) => e.comp, kind: (e: any) => e.kind, technique: (e: any) => e.tech });
    const ids = (r: any) => r.list.map((e: any) => e.id).join();
    // o exemplo do Paulo: bíceps, costas, tríceps, bíceps, costas
    let r = run([ex('b1', 'BICEPS'), ex('c1', 'COSTAS_PUXADA'), ex('t1', 'TRICEPS'), ex('b2', 'BICEPS'), ex('c2', 'COSTAS_REMADA', true)], ['COSTAS_PUXADA', 'COSTAS_REMADA', 'BICEPS', 'TRICEPS']);
    assert.equal(ids(r), 'c1,c2,b1,b2,t1'); assert.ok(r.changed);
    r = run([ex('i1', 'PEITO'), ex('m1', 'PEITO', true), ex('i2', 'PEITO')], ['PEITO']); assert.equal(ids(r), 'm1,i1,i2', 'composto primeiro, resto na ordem');
    r = run([ex('cardio', 'CARDIO', false, '', 'CARDIO'), ex('p1', 'PEITO'), ex('mob', null, false, '', 'MOB')], ['PEITO']); assert.equal(ids(r), 'mob,p1,cardio');
    r = run([ex('b1', 'BICEPS', false, 'BISET'), ex('b2', 'BICEPS', false, 'BISET'), ex('p1', 'PEITO', true)], ['PEITO', 'BICEPS']); assert.equal(ids(r), 'p1,b1,b2', 'o bi-set anda inteiro');
    r = run([ex('p1', 'PEITO', true), ex('b1', 'BICEPS')], ['PEITO', 'BICEPS']); assert.ok(!r.changed, 'já certo: nada muda');
    r = run([ex('p1', 'PEITO', true), ex('x', null), ex('b1', 'BICEPS')], ['PEITO', 'BICEPS']); assert.equal(ids(r), 'p1,x,b1', 'sem grupo conhecido fica colado ao de cima');
  });
  await t('ordem na geração: a IA embaralha (bíceps → peito → bíceps → peito) e o treino sai com peito primeiro, cada músculo junto, composto antes do isolado', async () => {
    const ctl = seedGen();
    ctl.setHook((byDay: any) => ({ ...byDay, A: [...(byDay.A || [])].reverse() }));   // a IA devolve o dia de trás para frente
    const r = await gen({ days: [{ name: 'A', groups: [{ id: 'BICEPS', qty: 2, sets: 3, rest: 30 }, { id: 'PEITO', qty: 2, sets: 3, rest: 60 }] }, { name: 'B', groups: [{ id: 'COSTAS_REMADA', qty: 2, sets: 3, rest: 60 }] }] }); assert.equal(r.status, 200);
    const a = r.body.exercisesByDay.A.map((e: any) => e.exerciseId.split('-')[0]);
    const firstBiceps = a.indexOf('biceps'); const lastPeito = a.lastIndexOf('peito');
    assert.ok(lastPeito >= 0 && firstBiceps > lastPeito, 'peito (grande) antes de bíceps: ' + a.join());
    const k = await gen({ keepGroupOrder: true, days: [{ name: 'A', groups: [{ id: 'BICEPS', qty: 2, sets: 3, rest: 30 }, { id: 'PEITO', qty: 2, sets: 3, rest: 60 }] }, { name: 'B', groups: [{ id: 'COSTAS_REMADA', qty: 2, sets: 3, rest: 60 }] }] }); assert.equal(k.status, 200);
    const ka = k.body.exercisesByDay.A.map((e: any) => e.exerciseId.split('-')[0]); assert.ok(ka.lastIndexOf('biceps') < ka.indexOf('peito'), 'keepGroupOrder: segue a estrutura, cada músculo junto: ' + ka.join());
    const first = r.body.exercisesByDay.A.find((e: any) => e.exerciseId.startsWith('peito'));
    assert.equal(first.exerciseId, 'peito-1', 'o composto (peito-1) abre o grupo: ' + r.body.exercisesByDay.A.map((e: any) => e.exerciseId).join());
  });

  // ═════ 5) aprender com as edições do coach (etapa 2): a geração guarda uma cópia; ao salvar, registra o que o coach mudou ═════
  const rowsOf = (byDay: any, edit?: (day: string, list: any[]) => any[]) => {
    const out: any[] = [];
    for (const [day, list0] of Object.entries<any[]>(byDay)) for (const e of (edit ? edit(day, list0) : list0)) out.push({ exerciseId: e.exerciseId, day, sets: e.blocks[0].sets, reps: e.blocks[0].reps, restTime: 60, technique: JSON.stringify({ t: e.blocks[0].technique || '', b: e.blocks, o: '' }), observation: '', substitutes: [] });
    return out;
  };
  const savePost = (rows: any[]) => call(workoutPOST, P, { method: 'POST', body: { userId: 's1', name: 'R', exercises: rows, startDate: new Date().toISOString() } });
  const savePut = async (id: string, rows: any[]) => { const r = await quiet(() => workoutPUT(new Request('http://x/api/workout/' + id, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + P }, body: JSON.stringify({ name: 'R', exercises: rows, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000 * 30).toISOString() }) }), { params: { id } })) as Response; return { status: r.status }; };

  await t('aprender: a geração devolve o id da cópia guardada (ordem já corrigida pelo servidor); sem a tabela a geração segue normal e sem id', async () => {
    seedGen(); db.workoutGenSnapshot.length = 0;
    const r = await gen({}); assert.equal(r.status, 200); assert.ok(r.body.genSnapshotId, 'id da cópia no corpo'); assert.equal(db.workoutGenSnapshot.length, 1);
    const snap = db.workoutGenSnapshot[0]; assert.equal(snap.coachId, PAULO_ID); assert.equal(snap.studentId, 's1'); assert.equal(snap.engine, 'GEMINI'); assert.equal(snap.workoutId, null);
    assert.deepEqual(Object.keys(snap.generated), ['A', 'B']); assert.equal(snap.generated.A.length, 4); assert.deepEqual(snap.generated.A.map((x: any) => x.id), r.body.exercisesByDay.A.map((e: any) => e.exerciseId)); assert.ok(snap.generated.A[0].n && snap.generated.A[0].g && snap.generated.A[0].s === 3 && snap.generated.A[0].r, 'nome, grupo, séries e repetições');
    const keep = (prisma as any).workoutGenSnapshot; (prisma as any).workoutGenSnapshot = undefined;
    try { const r2 = await gen({}); assert.equal(r2.status, 200); assert.ok(!('genSnapshotId' in r2.body), 'sem tabela: sem id e sem erro'); } finally { (prisma as any).workoutGenSnapshot = keep; }
    const old = db.workoutGenSnapshot[0]; old.createdAt = new Date(Date.now() - 130 * 86400000); await gen({}); assert.ok(!db.workoutGenSnapshot.includes(old), 'cópias com mais de 120 dias são apagadas');
  });
  await t('aprender: ao salvar o treino da IA, o servidor registra a troca, a ordem e as séries que o coach mudou; salvar de novo atualiza; fora dos 3 dias não registra', async () => {
    seedGen(); db.workoutGenSnapshot.length = 0; const r = await gen({}); const sid = r.body.genSnapshotId;
    const A = r.body.exercisesByDay.A.map((e: any) => e.exerciseId); const pe = A.filter((id: string) => id.startsWith('peito')); const bi = A.filter((id: string) => id.startsWith('biceps'));
    // coach: troca um peito por outro peito, inverte os bíceps e põe 5 séries no 1º exercício
    const spare = ['peito-1', 'peito-2', 'peito-3', 'peito-4', 'peito-5', 'peito-6'].find((id) => !pe.includes(id)) as string;
    const rows = rowsOf(r.body.exercisesByDay, (day, list) => day !== 'A' ? list : [...list.filter((e) => e.exerciseId === pe[0]), { ...list.find((e) => e.exerciseId === pe[1]), exerciseId: spare, title: 'x' }, ...list.filter((e) => e.exerciseId === bi[1]), ...list.filter((e) => e.exerciseId === bi[0])]);
    rows[0].sets = 5; rows[0].technique = JSON.stringify({ t: '', b: [{ sets: '5', reps: r.body.exercisesByDay.A[0].blocks[0].reps, technique: '' }], o: '' });
    const post = await savePost(rows); assert.equal(post.status, 200, JSON.stringify(post.json));
    let snap = db.workoutGenSnapshot.find((x: any) => x.id === sid); assert.ok(snap.workoutId, 'ligou ao treino criado'); assert.ok(snap.savedAt && snap.saved && snap.edits);
    const types = snap.edits.map((e: any) => e.type).sort(); assert.ok(types.includes('swapped') && types.includes('moved') && types.includes('sets'), types.join());
    const sw = snap.edits.find((e: any) => e.type === 'swapped'); assert.equal(sw.fromId, pe[1]); assert.equal(sw.toId, spare); assert.equal(sw.day, 'A'); assert.equal(snap.editCount, snap.edits.length); assert.equal(snap.edits.find((e: any) => e.type === 'sets').to, 5);
    // salvar de novo (PUT no mesmo treino) sem mudar mais nada: continua com as mesmas correções; tirar um exercício acrescenta
    const wid = snap.workoutId; db.workout.push(db.workout.find((w: any) => w.id === wid) || { id: wid, userId: 's1' });
    const before = snap.editCount; assert.equal((await savePut(wid, rows)).status, 200); snap = db.workoutGenSnapshot.find((x: any) => x.id === sid); assert.equal(snap.editCount, before);
    assert.equal((await savePut(wid, rows.filter((x) => x.exerciseId !== bi[0]))).status, 200); snap = db.workoutGenSnapshot.find((x: any) => x.id === sid); assert.ok(snap.edits.some((e: any) => e.type === 'removed' && e.id === bi[0]), JSON.stringify(snap.edits.map((e: any) => e.type)));
    // depois de 3 dias não é mais "correção da IA": nada muda
    snap.createdAt = new Date(Date.now() - 4 * 86400000); const frozen = JSON.stringify(snap.edits); await savePut(wid, rows.slice(0, 2)); assert.equal(JSON.stringify(db.workoutGenSnapshot.find((x: any) => x.id === sid).edits), frozen);
  });
  await t('aprender: salvar treino que não veio da IA (outro aluno ou sem cópia) não registra nada nem atrapalha; tabela ausente não derruba o salvar', async () => {
    seedGen(); db.workoutGenSnapshot.length = 0; const r = await gen({}); const rows = rowsOf(r.body.exercisesByDay);
    db.user.push({ id: 's9', role: 'USER', name: 'Outro', coachId: PAULO_ID }); const other = await call(workoutPOST, P, { method: 'POST', body: { userId: 's9', name: 'R', exercises: rows } }); assert.equal(other.status, 200);
    assert.equal(db.workoutGenSnapshot[0].workoutId, null, 'a cópia do s1 não foi ligada ao treino do s9'); assert.equal(db.workoutGenSnapshot[0].savedAt, null);
    // um 2º treino do MESMO aluno salvo depois que a cópia já foi ligada ao 1º não mexe nessa cópia
    assert.equal((await savePost(rows)).status, 200); const linked = db.workoutGenSnapshot[0]; const wid1 = linked.workoutId; assert.ok(wid1); const edits1 = JSON.stringify(linked.edits);
    assert.equal((await savePost(rows.slice(0, 2))).status, 200); assert.equal(db.workoutGenSnapshot[0].workoutId, wid1); assert.equal(JSON.stringify(db.workoutGenSnapshot[0].edits), edits1, 'outro treino do aluno não vira "correção" da mesma cópia');
    const keep = (prisma as any).workoutGenSnapshot; (prisma as any).workoutGenSnapshot = undefined; try { assert.equal((await savePost(rows)).status, 200, 'sem tabela o salvar funciona'); } finally { (prisma as any).workoutGenSnapshot = keep; }
  });
  await t('aprender: /api/gen-learning lista só as do próprio coach com o resumo; master vê as de outro; coach não vê as de outro', async () => {
    seedGen(); db.workoutGenSnapshot.length = 0; const r = await gen({}); const rows = rowsOf(r.body.exercisesByDay, (d, l) => (d === 'A' ? l.slice().reverse() : l)); await savePost(rows);
    const mine = await call(learnGET, P, { path: '/api/gen-learning' }); assert.equal(mine.status, 200); assert.equal(mine.json.items.length, 1); const it = mine.json.items[0]; assert.equal(it.saved, true); assert.ok(it.summary.moved > 0 && it.summary.total === it.summary.moved + it.summary.removed + it.summary.added + it.summary.swapped + it.summary.changed); assert.ok(!('generated' in it) && !('edits' in it), 'a lista é só o resumo');
    assert.equal((await call(learnGET, C1, { path: '/api/gen-learning' })).json.items.length, 0, 'coach 1 não tem as do Paulo'); assert.equal((await call(learnGET, C1, { path: '/api/gen-learning?coachId=' + PAULO_ID })).status, 403);
    assert.equal((await call(learnGET, P, { path: '/api/gen-learning?coachId=c1' })).json.items.length, 0); assert.equal((await call(learnGET, null, { path: '/api/gen-learning' })).status, 401);
    const keep = (prisma as any).workoutGenSnapshot; (prisma as any).workoutGenSnapshot = undefined; try { assert.deepEqual((await call(learnGET, P, { path: '/api/gen-learning' })).json, { items: [], missingTable: true }); } finally { (prisma as any).workoutGenSnapshot = keep; }
  });

  console.log(`\n${ok} verificações dos filtros de exercícios`);
})();
