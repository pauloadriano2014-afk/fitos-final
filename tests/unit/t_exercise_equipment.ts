import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as bulkPOST } from '/home/user/wt-back/app/api/exercise/bulk-update/route';
import { GET as reviewGET } from '/home/user/wt-back/app/api/exercise/equipment-review/route';
import { guessEquipment, isEquipmentLocked, EQUIPMENT_IDS, EQUIPMENT_LABEL } from '/home/user/wt-back/lib/exerciseEquipment';
import { mergeTags } from '/home/user/wt-back/lib/exerciseTags';
import { cleanRules, EQUIPMENTS } from '/home/user/wt-back/lib/genRules';
import { PAULO_ID, ADRI_ID } from '/home/user/wt-back/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const bulk = async (as: string | null, o: any) => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + as; const r = await bulkPOST(new Request('http://x/api/exercise/bulk-update', { method: 'POST', headers: h, body: JSON.stringify(o) })); return { status: r.status, json: await r.json().catch(() => null) }; };
const review = async (as: string | null) => { const h: any = {}; if (as) h.authorization = 'Bearer ' + as; const r = await reviewGET(new Request('http://x/api/exercise/equipment-review', { headers: h })); return { status: r.status, json: await r.json().catch(() => null) }; };
const MASTER = tok(PAULO_ID, 'ADMIN');
const ex = (id: string, name: string, equipment: string | null, o: any = {}) => ({ id, name, category: 'Pernas', subCategory: 'Geral', coachId: PAULO_ID, hiddenFromCoaches: false, videoUrl: 'v', defaultSubstitutes: [], environments: ['UNIVERSAL'], tags: equipment ? { target: 'PERNAS', equipment, ...(o.tags || {}) } : {}, ...Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'tags')) });
const seed = () => {
  P.__reset();
  S.user.push({ id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', accountStatus: 'ACTIVE' }, { id: ADRI_ID, role: 'ADMIN', email: 'adri.personal@hotmail.com', accountStatus: 'ACTIVE' }, { id: 'c1', role: 'COACH', email: 'c1@x.com', accountStatus: 'ACTIVE' });
  S.exercise.push(
    ex('leg', 'Leg press 45º', 'LIVRE'), ex('abd', 'Abdução na Polia', 'POLIA'), ex('smi', 'Stiff no Smith', 'BARRA'), ex('hal', 'Stiff c/halter', 'HALTER'),
    ex('unk', 'Agachamento Livre', 'LIVRE'), ex('lock', 'Cadeira abdutora', 'OUTROS', { tags: { equipmentManual: true } }),
    ex('mob', 'Alongamento de quadril', 'LIVRE', { category: 'Mobilidade' }), ex('o', 'Do outro coach', 'LIVRE', { coachId: 'c1' }),
  );
};
const row = (id: string) => S.exercise.find((e: any) => e.id === id);
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { seed(); await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
const g = (n: string, c?: string) => guessEquipment(n, c)?.equipment ?? null;

(async () => {
  await t('palpite: Smith é um aparelho à parte (nunca BARRA), com o búlgaro e o supino no Smith dentro dele', () => {
    for (const n of ['Stiff no Smith', 'Supino no Smith', 'Agachamento no Smith 1', 'Búlgaro no Smith', 'Good morning - smith', 'Terra no Smith', 'Desenvolvimento no Smith', 'Panturrilha no Smith']) assert.equal(g(n), 'SMITH', n);
    for (const n of ['Búlgaro com tronco reto', 'Bulgaro Tronco Inclinado ', 'Búlgaro com apoio']) { assert.equal(g(n), 'SMITH', n); assert.ok(guessEquipment(n)!.reason.includes('confira'), 'búlgaro sem "Smith" no nome pede conferência'); }
    assert.equal(g('Búlgaro c/halteres'), 'HALTER', 'o aparelho escrito no nome vale mais que a regra do búlgaro');
  });
  await t('palpite: máquina (marca e aparelho), polia, barra, halter, outros e peso do corpo', () => {
    for (const n of ['Leg press 45º', 'Leg 45', 'Pelve MATRIX', 'Pelve Hammer', 'Voador frontal NEWTECH', 'Cadeira abdutora', 'Abdutora articulada', 'Agachamento Hack CIMERIAN', 'Pêndulo', 'Graviton pegada aberta', 'Remada T máquina', 'Pulldown máquina NEWTECH', 'Máq. Elevação lateral em pé', 'Tríceps banco Cimerian', 'Mesa flexora']) assert.equal(g(n), 'MAQUINA', n);
    for (const n of ['Abdução no cabo NEWTECH', 'Remada polia alta neutra aberta  NEWTECH', 'Pulldown no cross', 'Pulldown com barra', 'Rosca direta com barra no cross', 'Tríceps corda', 'Remada baixa c/triângulo', 'Coice na Polia de pé']) assert.equal(g(n), 'POLIA', n);
    for (const n of ['Supino reto c/barra', 'Terra Sumô', 'Stiff c/barra', 'Passada c/barra', 'Rosca martelo barra H']) assert.equal(g(n), 'BARRA', n);
    for (const n of ['Supino inclinado c/halteres', 'Serrote com halter', 'RDL com halter']) assert.equal(g(n), 'HALTER', n);
    for (const n of ['Elevação frontal c/anilha', 'Sumô c/anilha', 'Abdução em pé c/caneleira', 'Abdominal infra c/bola', 'Lombar no banco romano', 'Rodinha abdominal']) assert.equal(g(n), 'OUTROS', n);
    for (const n of ['Barra fixa pegada aberta', 'Barra livre fechada', 'Flexão de braços', 'Passada sem peso', 'Tríceps na paralela', 'Panturrilha no degrau', 'Prancha lateral', 'Elevação pélvica no colchonete', 'Tríceps banco com as pernas estendidas']) assert.equal(g(n), 'PESO_CORPORAL', n);
  });
  await t('palpite: o que o nome não diz fica sem palpite (nada de chute), "flexão de punho" não é peso do corpo, caneleira antiga vira OUTROS', () => {
    for (const n of ['Rosca martelo', 'Serrote', 'Desenvolvimento Arnold', 'Agachamento Livre', 'Flexão de punho', 'Remada T', 'Remada cavalinho pronada', '', null]) assert.equal(g(n as any), null, String(n));
    assert.ok(!EQUIPMENT_IDS.includes('LIVRE' as any) && !EQUIPMENT_IDS.includes('CANELEIRA' as any), 'o palpite novo nunca devolve os nomes antigos'); assert.equal(EQUIPMENT_IDS.length, 7);
    assert.equal(g('Abdominal crunch', 'Abdômen'), 'PESO_CORPORAL'); assert.equal(g('Abdominal crunch', 'Pernas'), null, 'o abdominal sem acessório só vale na categoria Abdômen');
  });
  await t('trava: a edição do exercício (mergeTags) NÃO refaz o equipamento marcado à mão; sem trava, refaz pelo nome', () => {
    const gen = { target: 'PERNAS', mechanic: 'COMPOSTO', equipment: 'MAQUINA', jointRisk: [] };
    const travado = mergeTags(gen, { equipment: 'SMITH', equipmentManual: true, target: 'X' }) as any; assert.equal(travado.equipment, 'SMITH'); assert.equal(travado.equipmentManual, true); assert.equal(travado.target, 'PERNAS');
    const solto = mergeTags(gen, { equipment: 'SMITH' }) as any; assert.equal(solto.equipment, 'MAQUINA'); assert.equal(solto.equipmentManual, undefined);
    assert.equal((mergeTags(gen, { equipmentManual: true }) as any).equipment, 'MAQUINA', 'trava sem valor não prende'); assert.equal(isEquipmentLocked({ equipmentManual: true }), true); assert.equal(isEquipmentLocked({ equipmentManual: 'true' }), false); assert.equal(isEquipmentLocked(null), false);
  });
  await t('regras do aluno: bloqueio por equipamento aceita os novos (Smith, Outros) e os antigos já salvos', () => {
    assert.ok(EQUIPMENTS.includes('SMITH' as any) && EQUIPMENTS.includes('OUTROS' as any) && EQUIPMENTS.includes('LIVRE' as any) && EQUIPMENTS.includes('CANELEIRA' as any));
    assert.deepEqual(cleanRules({ excludeEquipment: ['smith', 'OUTROS', 'LIVRE', 'PLANETA'] }).excludeEquipment, ['SMITH', 'OUTROS', 'LIVRE']);
    for (const id of EQUIPMENT_IDS) assert.ok(EQUIPMENT_LABEL[id], id);
  });
  await t('lote: equipment grava e TRAVA; só mexe nos campos de tags pedidos; mantém o resto das tags', async () => {
    const r = await bulk(MASTER, { ids: ['leg', 'abd'], equipment: 'MAQUINA' }); assert.equal(r.status, 200); assert.equal(r.json.count, 2, JSON.stringify(r.json));
    assert.deepEqual(row('leg').tags, { target: 'PERNAS', equipment: 'MAQUINA', equipmentManual: true }); assert.equal(row('abd').tags.equipment, 'MAQUINA'); assert.equal(row('abd').tags.equipmentManual, true);
    assert.equal(row('leg').name, 'Leg press 45º'); assert.deepEqual(row('leg').environments, ['UNIVERSAL']);
  });
  await t('lote: equipamento + ambiente + grupo juntos; o que já está certo e travado conta como "sem mudança"', async () => {
    await bulk(MASTER, { ids: ['smi'], equipment: 'SMITH' }); const again = await bulk(MASTER, { ids: ['smi'], equipment: 'SMITH' }); assert.equal(again.json.count, 0); assert.equal(again.json.unchanged, 1);
    const r = await bulk(MASTER, { ids: ['hal'], equipment: 'HALTER', environments: { mode: 'ADD', values: ['SMARTFIT'] }, category: 'Pernas', subCategory: 'Multiarticular' }); assert.equal(r.json.count, 1);
    assert.equal(row('hal').tags.equipmentManual, true); assert.deepEqual(row('hal').environments.sort(), ['SMARTFIT', 'UNIVERSAL']); assert.equal(row('hal').subCategory, 'Multiarticular');
  });
  await t('lote: AUTO destrava e volta ao palpite pelo nome (sem palpite = LIVRE)', async () => {
    let r = await bulk(MASTER, { ids: ['lock'], equipment: 'AUTO' }); assert.equal(r.json.count, 1); assert.equal(row('lock').tags.equipment, 'MAQUINA'); assert.equal(row('lock').tags.equipmentManual, undefined, 'destravou');
    r = await bulk(MASTER, { ids: ['unk'], equipment: 'AUTO' }); assert.equal(row('unk').tags.equipment, 'LIVRE');
  });
  await t('lote: equipamento inválido é 400, parceiro é barrado, exercício de outro coach não muda', async () => {
    assert.equal((await bulk(MASTER, { ids: ['leg'], equipment: 'LIVRE' })).status, 400, 'LIVRE é nome antigo: não se grava mais'); assert.equal((await bulk(MASTER, { ids: ['leg'], equipment: 'PLANETA' })).status, 400);
    const p = await bulk(tok('c1'), { ids: ['leg'], equipment: 'MAQUINA' }); assert.ok(p.status === 401 || p.status === 403); assert.equal(row('leg').tags.equipment, 'LIVRE');
    const r = await bulk(MASTER, { ids: ['o'], equipment: 'MAQUINA' }); assert.equal(r.json.count, 0); assert.equal(row('o').tags.equipment, 'LIVRE');
  });
  await t('revisão: sugere só o que muda, ignora travado/mobilidade, separa o sem palpite, conta o atual e NÃO grava nada', async () => {
    const antes = JSON.stringify(S.exercise);
    const r = await review(MASTER); assert.equal(r.status, 200);
    const sug = Object.fromEntries(r.json.items.map((i: any) => [i.id, i.suggested])); assert.deepEqual(sug, { leg: 'MAQUINA', smi: 'SMITH' }, JSON.stringify(sug));
    assert.equal(r.json.items.find((i: any) => i.id === 'leg').current, 'LIVRE'); assert.ok(r.json.items.find((i: any) => i.id === 'leg').reason);
    assert.deepEqual(r.json.noGuess.map((i: any) => i.id), ['unk']); assert.equal(r.json.locked, 1);
    assert.ok(!r.json.items.some((i: any) => ['lock', 'mob', 'o', 'abd', 'hal'].includes(i.id)), 'travado, mobilidade, outro coach e os já certos ficam fora');
    assert.equal(JSON.stringify(S.exercise), antes, 'só leitura'); assert.equal((await review(tok('c1'))).status === 200, false, 'parceiro não vê');
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
