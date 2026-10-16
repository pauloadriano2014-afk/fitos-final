import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST } from '/home/user/fitos-final/app/api/user/push-token/route';
import { sendPushToUser, sendPushToUsers } from '/home/user/fitos-final/app/utils/sendNotification';
const db = (prisma as any).__db;
const tok = (id: string, role = 'ALUNO') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const post = async (as: string, body: any) => { const r = await POST(new Request('http://x/api/user/push-token', { method: 'POST', headers: { authorization: 'Bearer ' + tok(as), 'content-type': 'application/json' }, body: JSON.stringify(body) })); return { status: r.status, json: await r.json() }; };
const TOKEN = 'ExponentPushToken[AbCdEfGh123456]';
(async () => {
  db.users.push({ id: 's1', role: 'ALUNO', name: 'Bruno', coachId: 'coach-a', pushToken: null }, { id: 's2', role: 'ALUNO', name: 'Outro', coachId: 'coach-b', pushToken: null });
  // o app nativo manda `pushToken` (era o que dava 400 e o token nunca era salvo) -- versões novas mandam `token`
  let r = await post('s1', { userId: 's1', pushToken: TOKEN }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(db.users[0].pushToken, TOKEN);
  db.users[0].pushToken = null; r = await post('s1', { userId: 's1', token: TOKEN }); assert.equal(r.status, 200); assert.equal(db.users[0].pushToken, TOKEN);
  r = await post('s1', { userId: 's1', token: 'ExpoPushToken[xyz]' }); assert.equal(r.status, 200);
  // inválidos / incompletos / de outra pessoa
  for (const b of [{ userId: 's1' }, { token: TOKEN }, { userId: 's1', token: 'lixo' }, { userId: 's1', token: 123 }, { userId: 's1', pushToken: '' }]) { r = await post('s1', b); assert.equal(r.status, 400, JSON.stringify(b)); }
  db.users[1].pushToken = null; r = await post('s1', { userId: 's2', pushToken: TOKEN }); assert.equal(r.status, 403); assert.equal(db.users[1].pushToken, null, 'aluno não grava token de outro');
  console.log('OK  /api/user/push-token: aceita `pushToken` (app nativo) e `token`, rejeita vazio/inválido e token de outra pessoa');

  // ── envio: manda pro Expo quando o token é válido e registra o motivo quando o Expo recusa ──
  const sent: any[] = []; const errs: string[] = []; const origErr = console.error; console.error = (...a: any[]) => { errs.push(a.join(' ')); };
  (globalThis as any).fetch = async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body) }); return { json: async () => ({ data: { status: 'error', message: 'The recipient device is not registered with FCM', details: { error: 'DeviceNotRegistered' } } }) }; };
  await sendPushToUser({ id: 's1', pushToken: TOKEN }, 'Oi', 'corpo', { type: 'exercise_note_alert', alertId: 'a1' });
  assert.equal(sent.length, 1); assert.equal(sent[0].body.to, TOKEN); assert.equal(sent[0].body.data.alertId, 'a1');
  assert.ok(errs.some((e) => /\[expo-push\].*DeviceNotRegistered/.test(e)), errs.join('|'));
  sent.length = 0; await sendPushToUser({ id: 's1', pushToken: 'qualquer-coisa' }, 'Oi', 'corpo'); assert.equal(sent.length, 0, 'token inválido não vai pro Expo');
  await sendPushToUser({ id: 's1', pushToken: 'ExpoPushToken[zzz]' }, 'Oi', 'corpo'); assert.equal(sent.length, 1, 'formato novo também');
  sent.length = 0; (globalThis as any).fetch = async (url: string, init: any) => { sent.push(JSON.parse(init.body)); return { json: async () => ({ data: [{ status: 'ok' }, { status: 'error', message: 'x', details: { error: 'InvalidCredentials' } }] }) }; };
  await sendPushToUsers([{ id: 'a', pushToken: TOKEN }, { id: 'b', pushToken: 'ExpoPushToken[y]' }, { id: 'c', pushToken: null }], 'T', 'B'); console.error = origErr;
  assert.equal(sent.length, 1); assert.equal(sent[0].length, 2, 'só os 2 tokens válidos'); assert.ok(errs.some((e) => /InvalidCredentials/.test(e)));
  console.log('OK  envio: só tokens do Expo válidos; motivo da recusa do Expo aparece no log ([expo-push])\n\nTODOS OS TESTES DO PUSH (BACKEND) PASSARAM');
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
