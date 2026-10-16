import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
import { sanitizeClientKey, autoClientKey, AUTO_KEY_WINDOW_MS } from '/home/user/fitos-final/lib/finishWorkout';
const P = prisma as any; const S = P.__state;
const tok = (id: string) => jwt.sign({ id, role: id.startsWith('c') ? 'COACH' : 'ALUNO', coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const ex = [{ exerciseId: 'e1', name: 'Supino', sets: [{ index: 1, weight: '40', reps: '10' }, { index: 2, weight: '42,5', reps: '10' }], note: '' }, { exerciseId: 'e2', name: 'Crucifixo', sets: [{ index: 1, weight: '12', reps: '12' }] }];
const body = (o: any = {}) => ({ userId: 's1', workoutName: 'FICHA PEITO', day: 'A', workoutId: 'w1', exercisesData: ex, duration: 45, rpe: 8, feedback: '', ...o });
const post = async (b: any, as = 's1') => { const r = await finishPOST(new Request('http://x/api/workout/finish', { method: 'POST', headers: { authorization: 'Bearer ' + tok(as), 'content-type': 'application/json' }, body: JSON.stringify(b) })); return { status: r.status, json: await r.json() }; };
const reset = () => { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH', pushToken: 'tok' }); P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1' }); P.__addUser({ id: 's2', name: 'Bia Lima', coachId: 'c1' }); };
const xpOf = (id: string) => S.users.get(id).currentXP;
const count = (uid = 's1') => S.histories.filter((h: any) => h.userId === uid).length;
const flush = () => new Promise((r) => setTimeout(r, 20));
const XP = 150 + 2 * 5;   // 150 base + 5 por exercício

(async () => {
  // ── 1. chave do app: o 2º envio da MESMA sessão devolve o 1º resultado e não grava nada ──
  reset();
  let r1 = await post(body({ clientKey: 'w1:A:1700000000000' })); await flush();
  assert.equal(r1.status, 200); assert.equal(r1.json.success, true); assert.equal(r1.json.duplicate, undefined); assert.equal(r1.json.xpGained, XP); assert.equal(r1.json.newTotalXP, XP);
  assert.equal(count(), 1); assert.equal(globalThis.__pushes.length, 1, 'o coach recebe UM aviso'); assert.equal(globalThis.__analyze, 1);
  const r2 = await post(body({ clientKey: 'w1:A:1700000000000' })); await flush();
  assert.equal(r2.status, 200); assert.equal(r2.json.success, true); assert.equal(r2.json.duplicate, true); assert.equal(r2.json.xpGained, XP, 'devolve o XP do 1º envio (a tela de resumo mostra o mesmo valor)'); assert.equal(r2.json.newTotalXP, XP);
  for (let i = 0; i < 4; i++) await post(body({ clientKey: 'w1:A:1700000000000' }));
  await flush(); assert.equal(count(), 1, 'cinco toques extras = continua 1 treino'); assert.equal(xpOf('s1'), XP, 'XP uma vez só'); assert.equal(globalThis.__pushes.length, 1, 'nenhum aviso a mais para o coach'); assert.equal(globalThis.__analyze, 1);
  assert.equal(S.histories[0].details.length, 3, 'séries gravadas uma vez'); assert.equal(S.histories[0].clientKey, 'w1:A:1700000000000');
  console.log('OK  mesma chave: 1 treino, 1 XP, 1 aviso ao coach, mesmo resultado nos reenvios');

  // ── 2. toques SIMULTÂNEOS (o caso da internet lenta): o índice único segura ──
  reset();
  const many = await Promise.all(Array.from({ length: 8 }, () => post(body({ clientKey: 'sessao-simultanea' })))); await flush();
  assert.ok(many.every((m) => m.status === 200 && m.json.success), 'todos recebem sucesso');
  assert.equal(many.filter((m) => !m.json.duplicate).length, 1, 'exatamente um criou'); assert.equal(count(), 1); assert.equal(xpOf('s1'), XP); assert.equal(globalThis.__pushes.length, 1); assert.equal(globalThis.__analyze, 1);
  assert.ok(many.every((m) => m.json.xpGained === XP && m.json.newTotalXP === XP), 'todos veem o mesmo resultado');
  console.log('OK  8 toques simultâneos: 1 treino, 1 XP, 1 aviso (índice único)');

  // ── 3. sessões diferentes continuam valendo (treinar o mesmo dia em outro momento) e usuários não se misturam ──
  reset();
  await post(body({ clientKey: 'w1:A:111' })); await post(body({ clientKey: 'w1:A:222' })); await post(body({ clientKey: 'w1:B:333', day: 'B' })); await flush();
  assert.equal(count(), 3); assert.equal(xpOf('s1'), 3 * XP);
  await post(body({ userId: 's2', clientKey: 'w1:A:111' }), 's2'); await flush(); assert.equal(count('s2'), 1, 'a mesma chave em outro aluno é outro treino');
  console.log('OK  chaves diferentes = treinos diferentes; a chave vale por aluno');

  // ── 4. app ANTIGO (sem chave): chave automática + janela de 20 min ──
  reset();
  const old1 = await post(body()); assert.equal(old1.json.duplicate, undefined);
  const old2 = await post(body()); assert.equal(old2.json.duplicate, true); await flush();
  assert.equal(count(), 1); assert.equal(xpOf('s1'), XP); assert.equal(globalThis.__pushes.length, 1);
  reset(); const oldMany = await Promise.all(Array.from({ length: 6 }, () => post(body()))); await flush();
  assert.equal(oldMany.filter((m) => !m.json.duplicate).length, 1); assert.equal(count(), 1); assert.equal(xpOf('s1'), XP); assert.equal(globalThis.__pushes.length, 1, 'app antigo, toques simultâneos: 1 aviso');
  reset(); await post(body({ day: 'A' })); await post(body({ day: 'B' })); await flush(); assert.equal(count(), 2, 'dia diferente = treino diferente, mesmo sem chave');
  // treino igual há 25 min (fora da janela) é um treino novo; há 5 min (mesmo em outra janela de 20 min) é duplicata
  reset(); S.histories.push({ id: 'old', userId: 's1', name: 'FICHA PEITO', day: 'A', workoutId: 'w1', clientKey: null, date: new Date(Date.now() - 25 * 60000), xpEarned: XP, details: [] });
  const far = await post(body()); assert.equal(far.json.duplicate, undefined, 'há 25 min: é outro treino'); assert.equal(count(), 2);
  reset(); S.histories.push({ id: 'recent', userId: 's1', name: 'FICHA PEITO', day: 'A', workoutId: 'w1', clientKey: 'auto:w1:A:1', date: new Date(Date.now() - 5 * 60000), xpEarned: XP, details: [] });
  const near = await post(body()); assert.equal(near.json.duplicate, true, 'há 5 min (outra janela): duplicata'); assert.equal(count(), 1); assert.equal(near.json.xpGained, XP);
  // sem dia nem ficha (app muito antigo): pelo nome do treino
  reset(); await post(body({ day: undefined, workoutId: undefined })); const noDay = await post(body({ day: undefined, workoutId: undefined })); assert.equal(noDay.json.duplicate, true); assert.equal(count(), 1);
  console.log('OK  app antigo (sem chave): toques repetidos e simultâneos viram 1 treino; dia diferente e treino de 25 min atrás continuam válidos');

  // ── 5. chave inválida cai na regra do app antigo; chave limpa ──
  assert.equal(sanitizeClientKey('w1:A:123'), 'w1:A:123'); assert.equal(sanitizeClientKey(' ok_key-1.2 '), 'ok_key-1.2');
  for (const bad of ['', '   ', 'tem espaço', 'ação', 'a'.repeat(121), 123, null, undefined, {}, 'x;DROP TABLE']) assert.equal(sanitizeClientKey(bad as any), null, `inválida: ${String(bad).slice(0, 20)}`);
  assert.equal(autoClientKey({ workoutId: 'w1', day: 'A', now: new Date(0) }), 'auto:w1:A:0'); assert.equal(autoClientKey({ workoutId: 'w1', day: 'A', now: new Date(AUTO_KEY_WINDOW_MS - 1) }), 'auto:w1:A:0'); assert.equal(autoClientKey({ workoutId: 'w1', day: 'A', now: new Date(AUTO_KEY_WINDOW_MS) }), 'auto:w1:A:1');
  reset(); const badKey = await post(body({ clientKey: 'tem espaço e ação' })); assert.equal(badKey.status, 200); assert.ok(S.histories[0].clientKey.startsWith('auto:'), 'chave inválida vira automática');
  console.log('OK  chave do app é validada; inválida cai na chave automática');

  // ── 6. atomicidade: se somar o XP falhar, o treino NÃO fica gravado; a nova tentativa (mesma chave) grava e dá XP uma vez ──
  reset(); S.failUserUpdateOnce = true;
  const failed = await post(body({ clientKey: 'tentativa' })); assert.equal(failed.status, 500); assert.equal(count(), 0, 'nada gravado pela metade'); assert.equal(xpOf('s1'), 0);
  const retry = await post(body({ clientKey: 'tentativa' })); await flush(); assert.equal(retry.status, 200); assert.equal(retry.json.duplicate, undefined); assert.equal(count(), 1); assert.equal(xpOf('s1'), XP, 'XP na nova tentativa');
  console.log('OK  gravar o treino e somar o XP são uma transação só: falhou = nada pela metade, a nova tentativa funciona');

  // ── 7. o que já existia continua: sem token 401, aluno de outro coach 403, userId obrigatório ──
  reset();
  const noTok = await finishPOST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body({ clientKey: 'k' })) })); assert.equal(noTok.status, 401);
  const other = await post(body({ userId: 's2', clientKey: 'k' }), 's1'); assert.equal(other.status, 403); assert.equal(count('s2'), 0);
  const noUser = await post({ workoutName: 'X', exercisesData: [] }); assert.equal(noUser.status, 400);
  const noEx = await post(body({ exercisesData: undefined, clientKey: 'sem-exercicios' })); assert.equal(noEx.status, 200); assert.equal(noEx.json.xpGained, 150, 'sem exercícios não quebra (XP base)');
  console.log('OK  autenticação e permissões iguais; lista de exercícios ausente não derruba');

  // ── 8. o aviso ao coach: comentário do aluno vem uma vez, no 1º envio ──
  reset(); await post(body({ clientKey: 'cmt', feedback: 'Senti o ombro' })); await post(body({ clientKey: 'cmt', feedback: 'Senti o ombro' })); await flush();
  assert.equal(globalThis.__pushes.length, 1); assert.ok(globalThis.__pushes[0].title.includes('comentário') && globalThis.__pushes[0].body.includes('Senti o ombro'));
  console.log('OK  o aviso com comentário vai uma vez só');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); });
