import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET, PUT } from '/home/user/fitos-final/app/api/admin/diet-targets/[userId]/route';
import { sanitizeTargets as serverSanitize } from '/home/user/fitos-final/lib/dietTargets';
import { sanitizeTargets as appSanitize } from '/home/user/FIT-OS-FRONTEND/src/utils/macroPlanner.js';

const P = prisma as any; const db = P.__db;
const MASTER = '3c82f763-66b4-48da-836e-16817d4f57c0';
const tok = (id: string) => jwt.sign({ id, role: 'ADMIN', coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const call = (fn: any, id: string | null, body?: any, uid = 'aluno1') => fn(new Request('http://x/t', { method: fn === PUT ? 'PUT' : 'GET', headers: { ...(id ? { authorization: 'Bearer ' + tok(id) } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), { params: { userId: uid } });
db.users = { aluno1: { coachId: 'coachA', nutritionistId: 'nutriN' }, aluno2: { coachId: 'coachB', nutritionistId: null } };

(async () => {
  let r = await call(GET, null); assert.equal(r.status, 401);
  r = await call(GET, 'coachB'); assert.equal(r.status, 403);                       // coach de outro aluno
  r = await call(PUT, 'coachB', { config: { equation: 'harris' } }); assert.equal(r.status, 403);
  r = await call(GET, 'coachA'); let j = await r.json(); assert.deepEqual([r.status, j.available, j.config], [200, true, null]);
  console.log('OK  401 sem token / 403 coach de outro aluno / sem metas gravadas = config null (app usa o padrão)');

  const cfg = { equation: 'harris', activity: { mode: 'factor', factor: 1.4 }, goal: { mode: 'percent', value: -15 }, macros: { mode: 'gkg', protGkg: 2.4, fatGkg: 0.8 }, kcalManual: { TREINO: 2300 } };
  r = await call(PUT, 'coachA', { config: cfg }); j = await r.json(); assert.equal(r.status, 200);
  assert.equal(j.config.equation, 'harris'); assert.equal(j.config.kcalManual.TREINO, 2300); assert.equal(db.rows.aluno1.updatedById, 'coachA');
  r = await call(GET, 'nutriN'); j = await r.json(); assert.equal(j.config.macros.protGkg, 2.4);                   // nutricionista do aluno lê
  r = await call(GET, MASTER); j = await r.json(); assert.equal(j.config.activity.factor, 1.4);                     // master também
  r = await call(PUT, 'nutriN', { config: { ...cfg, equation: 'fao' } }); assert.equal(r.status, 200); assert.equal(db.rows.aluno1.updatedById, 'nutriN');
  console.log('OK  coach, nutricionista e master do aluno gravam e leem; fica registrado quem alterou por último');

  r = await call(PUT, 'coachA', { config: { equation: 'xyz', activity: { factor: 99, mode: 'factor' }, kcalManual: { TREINO: 5 }, macros: { protGkg: 50 }, extra: 'lixo'.repeat(10) } }); j = await r.json();
  assert.deepEqual([j.config.equation, j.config.activity.factor, j.config.kcalManual, j.config.macros.protGkg, 'extra' in j.config], ['mifflin', 2.5, {}, 4.5, false]);
  r = await call(PUT, 'coachA', 'x'.repeat(9000)); assert.equal(r.status, 413);
  r = await call(PUT, 'coachA', '{nao json'); assert.equal(r.status, 400);
  r = await call(PUT, 'coachA', { foo: 1 }); assert.equal(r.status, 400);
  console.log('OK  valores absurdos são corrigidos/descartados; corpo gigante 413; JSON inválido 400; sem config 400');

  r = await call(PUT, 'coachA', { reset: true }); j = await r.json(); assert.deepEqual([r.status, j.config], [200, null]); assert.equal(db.rows.aluno1, undefined);
  r = await call(GET, 'coachA'); j = await r.json(); assert.equal(j.config, null);
  console.log('OK  restaurar padrão apaga as metas do aluno');

  db.missing = true;
  r = await call(GET, 'coachA'); j = await r.json(); assert.deepEqual([r.status, j.available, j.config], [200, false, null]);
  r = await call(PUT, 'coachA', { config: cfg }); assert.equal(r.status, 503); assert.ok(/atualização do banco/.test((await r.json()).error));
  db.missing = false;
  console.log('OK  antes do db push: GET responde available:false (o app segue no padrão) e PUT responde 503 com mensagem clara');

  // o servidor valida IGUAL ao app (mesmas faixas): 3000 configurações aleatórias/lixo
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a: any[]) => a[Math.floor(rnd() * a.length)];
  const junk = () => pick([undefined, null, 'abc', '12,5', 7, -3, 0, 1e9, [], {}, true, '  ', NaN, Infinity, '1.4', 2300, 5, 700]);
  for (let i = 0; i < 3000; i++) {
    const c: any = { equation: pick(['mifflin', 'harris', 'fao', 'cunningham', 'manual', 'zz', junk()]), manualTmb: junk(), bodyFatPct: junk(),
      activity: { mode: pick(['auto', 'factor', junk()]), factor: junk() }, goal: { mode: pick(['auto', 'percent', 'kcal', junk()]), value: junk() },
      dayMult: { TREINO: junk(), CARDIO: junk(), DESCANSO: junk(), TREINO_CARDIO: junk() }, kcalManual: { TREINO: junk(), CARDIO: junk(), DESCANSO: junk(), OUTRO: junk() },
      macros: { mode: pick(['auto', 'gkg', 'pct', junk()]), protGkg: junk(), fatGkg: junk(), pct: { prot: junk(), carb: junk(), fat: junk() } } };
    const a = JSON.parse(JSON.stringify(appSanitize(c))), b = JSON.parse(JSON.stringify(serverSanitize(c)));
    assert.deepStrictEqual(b, a, 'divergiu com: ' + JSON.stringify(c));
  }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(serverSanitize(null))), JSON.parse(JSON.stringify(appSanitize(null))));
  console.log('OK  validação do servidor idêntica à do app em 3000 configurações aleatórias/lixo');
  console.log('\nTODOS OS TESTES DAS METAS (SERVIDOR) PASSARAM');
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
