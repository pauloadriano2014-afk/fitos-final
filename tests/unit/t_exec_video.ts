import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as hojeGET } from '/home/user/fitos-final/app/api/agenda/hoje/route';
import { POST as resPOST } from '/home/user/fitos-final/app/api/agenda/hoje/resolvidas/route';
import { POST as vidPOST, GET as vidGET } from '/home/user/fitos-final/app/api/exec-video/route';
import { GET as allowGET } from '/home/user/fitos-final/app/api/exec-video/allowance/route';
import { GET as oneGET, PATCH as onePATCH, DELETE as oneDEL } from '/home/user/fitos-final/app/api/exec-video/[id]/route';
import { POST as fbPOST } from '/home/user/fitos-final/app/api/exec-video/[id]/feedback/route';
import { DELETE as fbDEL } from '/home/user/fitos-final/app/api/exec-video/feedback/[fid]/route';
import { POST as replyPOST } from '/home/user/fitos-final/app/api/exec-video/reply-upload/route';
import { POST as reqPOST, GET as reqGET } from '/home/user/fitos-final/app/api/exec-video/request/route';
import { DELETE as reqDEL } from '/home/user/fitos-final/app/api/exec-video/request/[id]/route';
import { GET as polGET, PUT as polPUT } from '/home/user/fitos-final/app/api/exec-video/policy/route';
import { GET as qrGET, POST as qrPOST, DELETE as qrDEL } from '/home/user/fitos-final/app/api/exec-video/quick-replies/route';
import { GET as cronGET } from '/home/user/fitos-final/app/api/cron/agenda/route';
import * as EV from '/home/user/fitos-final/lib/execVideo';
import * as VS from '/home/user/fitos-final/lib/videoStream';
import * as SV from '/home/user/fitos-final/lib/execVideoService';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

process.env.CLOUDFLARE_ACCOUNT_ID = 'acc'; process.env.CLOUDFLARE_API_TOKEN = 'tk'; process.env.CRON_SECRET = 'segredo';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}, ctx?: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers: { ...headers, ...(init.headers || {}) } }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) });
const put = (o: any) => ({ method: 'PUT', body: JSON.stringify(o) });
const patch = (o: any) => ({ method: 'PATCH', body: JSON.stringify(o) });
const pushes = () => (globalThis as any).__pushes || [];
const clearPushes = () => { (globalThis as any).__pushes = []; };
const DAY = 86400000, H = 3600000;
const cA = tok('cA'), cB = tok('cB'), s1 = tok('s1', 'USER'), s2 = tok('s2', 'USER'), sT = tok('sT', 'USER'), master = tok(PAULO_ID, 'ADMIN');

// ── Cloudflare de mentira ──
const CF: any = { videos: new Map(), deleted: [] as string[], uploads: [] as any[], down: false, n: 0 };
const hex = () => (++CF.n).toString(16).padStart(32, '0');
const okj = (j: any) => ({ ok: true, json: async () => j });
const notFound = { ok: false, json: async () => ({ success: false, errors: [{ code: 10003, message: 'not found' }] }) };
const BASE = 'https://api.cloudflare.com/client/v4/accounts/acc/stream';
(globalThis as any).fetch = async (url: any, init: any = {}) => {
  const u = String(url), m = init.method || 'GET';
  if (!u.startsWith(BASE)) throw new Error('rota não prevista: ' + u);
  if (CF.down) return { ok: false, json: async () => ({ success: false, errors: [{ message: 'fora do ar' }] }) };
  const rest = u.slice(BASE.length);
  if (rest === '/direct_upload' && m === 'POST') { const body = JSON.parse(init.body); CF.uploads.push(body); const uid = hex(); CF.videos.set(uid, { ready: false, duration: 12 }); return okj({ success: true, result: { uid, uploadURL: 'https://upload.cf/' + uid } }); }
  const mm = rest.match(/^\/([a-f0-9]{32})(\/token)?$/); if (!mm) throw new Error('rota não prevista: ' + rest);
  const uid = mm[1], v = CF.videos.get(uid);
  if (m === 'DELETE') { if (!v) return notFound; CF.videos.delete(uid); CF.deleted.push(uid); return okj({ success: true }); }
  if (!v) return notFound;
  if (mm[2] && m === 'POST') return okj({ success: true, result: { token: 'TOK' + uid.slice(-4) } });
  return okj({ success: true, result: { readyToStream: v.ready, status: { state: v.ready ? 'ready' : 'queued' }, duration: v.ready ? v.duration : -1, playback: { hls: `https://customer-x.cloudflarestream.com/${uid}/manifest/video.m3u8` }, thumbnail: `https://customer-x.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg` } });
};
const makeReady = (uid: string, duration = 14) => { CF.videos.get(uid).ready = true; CF.videos.get(uid).duration = duration; };

const seed = () => {
  P.__reset(); clearPushes(); CF.videos.clear(); CF.deleted.length = 0; CF.uploads.length = 0; CF.down = false;
  const u = (o: any) => S.user.push({ role: 'USER', active: true, isFinanceActive: true, isTestAccount: false, name: o.id, phone: null, photoUrl: null, coachId: null, nutritionistId: null, ...o });
  u({ id: PAULO_ID, role: 'ADMIN', name: 'Paulo Master' }); u({ id: 'cA', role: 'COACH', name: 'Coach A', pushToken: 'ExponentPushToken[cA]' }); u({ id: 'cB', role: 'COACH', name: 'Coach B' });
  for (const c of ['cA', 'cB']) S.coachFeature.push({ id: 'cf' + c, coachId: c, feature: 'execVideo', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null });   // 12 out: o recurso agora depende da chave por coach
  u({ id: 's1', name: 'Samara Franco', coachId: 'cA', pushToken: 'ExponentPushToken[s1]' }); u({ id: 's2', name: 'Bia Costa', coachId: 'cB' });
  u({ id: 'sT', name: 'Aluno Teste (Coach)', coachId: 'cA', isTestAccount: true });
  S.exercise.push({ id: 'e1', name: 'Agachamento no Smith', category: 'PERNAS', subCategory: 'Geral', defaultSubstitutes: [], videoUrl: 'https://cdn/agacha.m3u8', coachId: 'cA', tags: null }, { id: 'e2', name: 'Leg press', category: 'PERNAS', subCategory: 'Geral', defaultSubstitutes: [], videoUrl: null, coachId: 'cA', tags: null });
};
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => {
  try { seed(); await fn(); passed++; console.log('  ok  ' + name); }
  catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); }
};
const setPolicy = (o: any = {}) => S.videoPolicy.push({ id: 'p' + S.nextId++, coachId: 'cA', studentId: 's1', enabled: true, monthlyLimit: null, ...o });
const upload = (as: string | null, o: any = {}) => call(vidPOST, '/api/exec-video', as, post({ exerciseId: 'e1', day: 'A', workoutId: 'w1', ...o }));
const mkVideo = (o: any = {}) => { const uid = hex(); CF.videos.set(uid, { ready: true, duration: 14 }); const v = { id: 'v' + S.nextId++, userId: 's1', coachId: 'cA', exerciseId: 'e1', exerciseName: 'Agachamento no Smith', status: 'READY', cfUid: uid, durationSec: 14, createdAt: new Date(), expiresAt: new Date(Date.now() + 80 * DAY), priority: false, requestId: null, coachViewedAt: null, studentNote: null, day: 'A', workoutId: 'w1', ...o }; S.executionVideo.push(v); return v; };
const detail = (as: string | null, id: string, q = '') => call(oneGET, `/api/exec-video/${id}${q}`, as, {}, { params: { id } });
const markUploaded = (as: string | null, id: string) => call(onePATCH, `/api/exec-video/${id}`, as, patch({ action: 'uploaded' }), { params: { id } });
const feedback = (as: string | null, id: string, o: any) => call(fbPOST, `/api/exec-video/${id}/feedback`, as, post(o), { params: { id } });
const hoje = async (as = cA, coach = 'cA') => (await call(hojeGET, `/api/agenda/hoje?coachId=${coach}`, as)).json.tasks as any[];

(async () => {
  await block('regras puras: recado com dor/lesão sobe na frente; mês começa dia 1 no horário de Brasília; link assinado troca o id pelo token; desenho é limpo e limitado', () => {
    assert.ok(EV.isPriorityNote('senti DOR no joelho') && EV.isPriorityNote('Machuquei o ombro') && EV.isPriorityNote('estalou') && EV.isPriorityNote('ombro doeu') && EV.isPriorityNote('tive uma lesão') && EV.isPriorityNote('dores nas costas'));
    assert.ok(!EV.isPriorityNote('tá pesado') && !EV.isPriorityNote(null) && !EV.isPriorityNote('remada dorsal') && !EV.isPriorityNote('dormi mal') && !EV.isPriorityNote('Indo bem'));
    assert.strictEqual(EV.monthStartBrt(new Date('2026-10-15T12:00:00Z')).toISOString(), '2026-10-01T03:00:00.000Z');
    assert.strictEqual(EV.monthStartBrt(new Date('2026-11-01T01:00:00Z')).toISOString(), '2026-10-01T03:00:00.000Z');   // 1/nov 01:00 UTC ainda é 31/out em Brasília
    assert.strictEqual(VS.withToken('https://c.x/UID123/manifest/video.m3u8', 'UID123', 'TK'), 'https://c.x/TK/manifest/video.m3u8'); assert.strictEqual(VS.withToken(null, 'u', 't'), null); assert.strictEqual(VS.withToken('https://c.x/a', 'u', ''), null);
    const d = EV.cleanDrawing([{ color: '#FF3B30', points: [[0, 0], [2, -1], [0.5, 0.5]] }, { color: 'rosa', points: [[0.1, 0.1], [0.2, 0.2]] }, { points: [[0.1, 0.1]] }, 'x']);
    assert.deepStrictEqual(d, [{ type: 'free', color: '#FF3B30', points: [[0, 0], [1, 0], [0.5, 0.5]] }, { type: 'free', color: '#FF3B30', points: [[0.1, 0.1], [0.2, 0.2]] }]);
    assert.strictEqual(EV.cleanDrawing([]), null); assert.strictEqual(EV.cleanDrawing('x'), null);
    assert.strictEqual(EV.cleanDrawing(Array.from({ length: 50 }, () => ({ points: [[0, 0], [1, 1]] })))!.length, EV.MAX_STROKES);
    assert.strictEqual(EV.cleanDrawing([{ points: Array.from({ length: 500 }, (_, i) => [i / 500, 0]) }])![0].points.length, EV.MAX_POINTS);
    assert.strictEqual(EV.isGuid('a'.repeat(32)), true); assert.strictEqual(EV.isGuid('xyz'), false);
  });

  await block('liberação e limite: sem regra só a pedido; liberado sem limite; com limite conta o mês; pedido do coach não conta; apagados contam, falhos não; regra do aluno vence o padrão', async () => {
    const A = (o: any = {}) => EV.checkAllowance(prisma, { studentId: 's1', coachId: 'cA', ...o });
    let a = await A(); assert.strictEqual(a.canUpload, false); assert.strictEqual(a.mode, 'NONE'); assert.ok(/ainda não liberou/.test(a.reason!));
    assert.strictEqual((await EV.checkAllowance(prisma, { studentId: 's1', coachId: null })).canUpload, false);
    setPolicy({ monthlyLimit: 2 }); a = await A(); assert.deepStrictEqual([a.canUpload, a.mode, a.used, a.limit], [true, 'FREE', 0, 2]);
    mkVideo({ status: 'UPLOADING' }); mkVideo({ status: 'DELETED' }); mkVideo({ status: 'FAILED' }); mkVideo({ requestId: 'rq-x' });
    a = await A(); assert.strictEqual(a.used, 2, 'enviado + apagado contam; falho e a pedido não'); assert.strictEqual(a.canUpload, false); assert.ok(/já enviou os 2 vídeos/.test(a.reason!));
    mkVideo({ createdAt: new Date(Date.now() - 45 * DAY) }); assert.strictEqual((await A()).used, 2, 'mês passado não conta');
    S.videoRequest.push({ id: 'rq1', userId: 's1', coachId: 'cA', exerciseId: 'e1', exerciseName: 'Agachamento no Smith', status: 'OPEN', createdAt: new Date() });
    a = await A({ exerciseId: 'e1' }); assert.deepStrictEqual([a.canUpload, a.mode, a.requestId], [true, 'REQUEST', 'rq1']);
    a = await A({ exerciseId: 'e2' }); assert.strictEqual(a.canUpload, false, 'pedido de outro exercício não vale');
    a = await A({ requestId: 'rq1' }); assert.strictEqual(a.mode, 'REQUEST');
    a = await A({ requestId: 'nao-existe' }); assert.strictEqual(a.canUpload, false); assert.ok(/atendido ou cancelado/.test(a.reason!));
    S.videoRequest.push({ id: 'rq2', userId: 's1', coachId: 'cA', exerciseId: null, exerciseName: 'qualquer', status: 'OPEN', createdAt: new Date() });
    a = await A({ exerciseId: 'e2' }); assert.deepStrictEqual([a.canUpload, a.requestId], [true, 'rq2'], 'pedido sem exercício vale para qualquer um');
    S.videoRequest.length = 0; S.videoPolicy.length = 0;
    S.videoPolicy.push({ id: 'pd', coachId: 'cA', studentId: '*', enabled: true, monthlyLimit: 5 });
    const p = await EV.resolvePolicy(prisma, 'cA', 's1'); assert.deepStrictEqual([p.enabled, p.monthlyLimit, p.source], [true, 5, 'DEFAULT']);
    setPolicy({ enabled: false }); const p2 = await EV.resolvePolicy(prisma, 'cA', 's1'); assert.deepStrictEqual([p2.enabled, p2.source], [false, 'STUDENT']);
    assert.strictEqual((await EV.resolvePolicy(prisma, 'cA', 's2')).source, 'DEFAULT'); assert.strictEqual((await EV.resolvePolicy(prisma, 'cB', 's2')).source, 'NONE');
  });

  await block('o aluno envia: privado, teto técnico de 20 s (o app pede 15), grava UPLOADING com expiração em 90 dias; recado com dor vira prioridade; nome do exercício vem da biblioteca', async () => {
    setPolicy();
    const r = await upload(s1, { note: 'senti dor no joelho', setNumber: 2 }); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(/^https:\/\/upload\.cf\//.test(r.json.uploadURL)); assert.strictEqual(r.json.mode, 'FREE'); assert.strictEqual(r.json.maxSeconds, 20);
    assert.strictEqual(CF.uploads.length, 1); assert.strictEqual(CF.uploads[0].requireSignedURLs, true); assert.strictEqual(CF.uploads[0].maxDurationSeconds, 20); assert.strictEqual(CF.uploads[0].creator, 's1');
    const row = S.executionVideo[0]; assert.deepStrictEqual([row.userId, row.coachId, row.exerciseName, row.status, row.priority, row.setNumber, row.day, row.workoutId], ['s1', 'cA', 'Agachamento no Smith', 'UPLOADING', true, 2, 'A', 'w1']);
    const days = (new Date(row.expiresAt).getTime() - Date.now()) / DAY; assert.ok(days > 89.9 && days < 90.1, String(days));
    const r2 = await upload(s1, { exerciseId: undefined, exerciseName: 'Remada livre', note: 'ok' }); assert.strictEqual(r2.status, 200); assert.strictEqual(S.executionVideo[1].priority, false); assert.strictEqual(S.executionVideo[1].exerciseName, 'Remada livre');
    assert.strictEqual((await upload(s1, { exerciseId: undefined, exerciseName: '' })).status, 400);
    assert.strictEqual(pushes().length, 0, 'enviar não avisa o coach antes de o vídeo ficar pronto');
  });

  await block('quem não pode enviar: sem liberação, limite estourado, outro aluno, coach no aluno real, sem login; coach pode no aluno TESTE', async () => {
    let r = await upload(s1); assert.strictEqual(r.status, 403); assert.ok(/ainda não liberou/.test(r.json.error)); assert.strictEqual(r.json.allowance.mode, 'NONE'); assert.strictEqual(S.executionVideo.length, 0); assert.strictEqual(CF.uploads.length, 0);
    setPolicy({ monthlyLimit: 1 }); assert.strictEqual((await upload(s1)).status, 200); r = await upload(s1); assert.strictEqual(r.status, 403); assert.ok(/já enviou/.test(r.json.error));
    assert.strictEqual((await upload(s2, { userId: 's1' })).status, 403, 'outro aluno'); assert.strictEqual((await upload(cA, { userId: 's1' })).status, 403, 'coach não age como aluno real'); assert.strictEqual((await upload(null)).status, 401);
    S.videoPolicy.push({ id: 'pt', coachId: 'cA', studentId: 'sT', enabled: true, monthlyLimit: null }); assert.strictEqual((await upload(cA, { userId: 'sT' })).status, 200, 'aluno teste: o coach pode');
    assert.strictEqual((await upload(cB, { userId: 'sT' })).status, 403, 'mas só o coach dele');
    assert.strictEqual((await call(vidPOST, '/api/exec-video', s1, post({ userId: 'cA', exerciseId: 'e1' }))).status, 404, 'só alunos'); assert.strictEqual((await upload(s1, { userId: 'nao' })).status, 404);
  });

  await block('Cloudflare fora do ar ou sem configuração: o envio falha com mensagem e NADA é gravado; mais de 3 envios parados → 429', async () => {
    setPolicy({}); CF.down = true; let r = await upload(s1); assert.strictEqual(r.status, 502); assert.strictEqual(S.executionVideo.length, 0); CF.down = false;
    const keep = process.env.CLOUDFLARE_API_TOKEN; delete process.env.CLOUDFLARE_API_TOKEN; r = await upload(s1); assert.strictEqual(r.status, 503); process.env.CLOUDFLARE_API_TOKEN = keep;
    for (let i = 0; i < 3; i++) assert.strictEqual((await upload(s1)).status, 200); r = await upload(s1); assert.strictEqual(r.status, 429); assert.strictEqual(S.executionVideo.length, 3);
    S.executionVideo[0].createdAt = new Date(Date.now() - 7 * H); assert.strictEqual((await upload(s1)).status, 200, 'envio parado há horas não segura a fila');
  });

  await block('terminou de enviar: ainda processando segue UPLOADING sem avisar; pronto vira READY, grava duração, avisa o coach UMA vez e atende o pedido', async () => {
    S.videoRequest.push({ id: 'rq1', userId: 's1', coachId: 'cA', exerciseId: 'e1', exerciseName: 'Agachamento no Smith', status: 'OPEN', createdAt: new Date() });
    const r = await upload(s1, { note: 'tá pesado' }); assert.strictEqual(r.json.mode, 'REQUEST'); const id = r.json.video.id; const uid = S.executionVideo[0].cfUid; assert.strictEqual(S.executionVideo[0].requestId, 'rq1'); assert.strictEqual(S.executionVideo[0].priority, true, 'a pedido sobe na frente');
    let p = await markUploaded(s1, id); assert.strictEqual(p.status, 200); assert.strictEqual(p.json.video.status, 'UPLOADING'); assert.strictEqual(pushes().length, 0); assert.strictEqual(S.videoRequest[0].status, 'OPEN');
    makeReady(uid, 17.5); p = await markUploaded(s1, id); assert.strictEqual(p.json.video.status, 'READY'); assert.strictEqual(S.executionVideo[0].durationSec, 17.5);
    assert.strictEqual(pushes().length, 1); assert.strictEqual(pushes()[0].to, 'cA'); assert.ok(/Samara enviou um vídeo/.test(pushes()[0].title)); assert.strictEqual(pushes()[0].data.type, 'exec_video'); assert.strictEqual(pushes()[0].data.videoId, id);
    assert.deepStrictEqual([S.videoRequest[0].status, S.videoRequest[0].videoId], ['FULFILLED', id]);
    await markUploaded(s1, id); assert.strictEqual(pushes().length, 1, 'confirmar de novo não avisa de novo');
    assert.strictEqual((await markUploaded(s2, id)).status, 403); assert.strictEqual((await markUploaded(cA, id)).status, 403, 'coach não confirma envio do aluno real');
    assert.strictEqual((await call(onePATCH, `/api/exec-video/${id}`, s1, patch({ action: 'x' }), { params: { id } })).status, 400);
  });

  await block('envio que falhou: "retry" troca o link (e apaga o antigo); depois de pronto não dá mais para repetir', async () => {
    setPolicy(); const r = await upload(s1); const id = r.json.video.id; const old = S.executionVideo[0].cfUid;
    const t = await call(onePATCH, `/api/exec-video/${id}`, s1, patch({ action: 'retry' }), { params: { id } }); assert.strictEqual(t.status, 200); assert.ok(t.json.uploadURL);
    assert.notStrictEqual(S.executionVideo[0].cfUid, old); assert.ok(CF.deleted.includes(old)); assert.ok(t.json.uploadURL.endsWith(S.executionVideo[0].cfUid));
    makeReady(S.executionVideo[0].cfUid); await markUploaded(s1, id);
    assert.strictEqual((await call(onePATCH, `/api/exec-video/${id}`, s1, patch({ action: 'retry' }), { params: { id } })).status, 409);
  });

  await block('abrir o vídeo: link ASSINADO (token no lugar do id), miniatura, só aluno dono e o coach dele; coach marca "visto" (peek não); processando = sem link', async () => {
    const v = mkVideo(); const d = await detail(s1, v.id); assert.strictEqual(d.status, 200, JSON.stringify(d.json));
    assert.strictEqual(d.json.video.playback.hls, `https://customer-x.cloudflarestream.com/TOK${v.cfUid.slice(-4)}/manifest/video.m3u8`); assert.ok(d.json.video.playback.thumb.includes('/TOK')); assert.ok(!d.json.video.playback.hls.includes(v.cfUid)); assert.strictEqual(d.json.role, 'STUDENT');
    assert.strictEqual((await detail(s2, v.id)).status, 403); assert.strictEqual((await detail(cB, v.id)).status, 403); assert.strictEqual((await detail(null, v.id)).status, 401); assert.strictEqual((await detail(s1, 'nao')).status, 404);
    assert.strictEqual(S.executionVideo[0].coachViewedAt, null); const pk = await detail(cA, v.id, '?peek=1'); assert.strictEqual(pk.json.role, 'COACH'); assert.strictEqual(S.executionVideo[0].coachViewedAt, null);
    await detail(cA, v.id); assert.ok(S.executionVideo[0].coachViewedAt); assert.strictEqual((await detail(master, v.id)).status, 200);
    const pr = mkVideo({ status: 'UPLOADING' }); CF.videos.get(pr.cfUid).ready = false; const d2 = await detail(s1, pr.id); assert.strictEqual(d2.json.video.playback.ready, false); assert.strictEqual(d2.json.video.playback.hls, null);
  });

  await block('abrir um vídeo que ficou UPLOADING mas já está pronto na Cloudflare confirma na hora (e avisa o coach)', async () => {
    const v = mkVideo({ status: 'UPLOADING' }); const d = await detail(cA, v.id); assert.strictEqual(d.json.video.status, 'READY'); assert.strictEqual(pushes().length, 1);
  });

  await block('respostas do coach: texto, comentário no instante, desenho, vídeo-resposta e comparação com a biblioteca; validação de cada tipo', async () => {
    const v = mkVideo(); const F = (o: any, as = cA) => feedback(as, v.id, o);
    assert.strictEqual((await F({ kind: 'TEXT', body: 'Joelho entrando.' })).status, 200);
    for (const bad of [{ kind: 'X' }, { kind: 'TEXT', body: '  ' }, { kind: 'MOMENT', body: 'aqui' }, { kind: 'MOMENT', atSec: 3 }, { kind: 'MOMENT', body: 'x', atSec: -1 }, { kind: 'DRAWING', atSec: 2 }, { kind: 'DRAWING', drawing: [{ points: [[0, 0], [1, 1]] }] }, { kind: 'VIDEO' }, { kind: 'VIDEO', replyCfUid: 'abc' }, { kind: 'REFERENCE' }]) assert.strictEqual((await F(bad)).status, 400, JSON.stringify(bad));
    const m = await F({ kind: 'MOMENT', body: 'Aqui o quadril sobe antes.', atSec: 7.26 }); assert.strictEqual(m.status, 200); assert.strictEqual(m.json.feedback.atSec, 7.3);
    const d = await F({ kind: 'DRAWING', atSec: 4, drawing: [{ color: '#0A84FF', points: [[0.1, 0.2], [0.5, 1.4]] }], body: 'ângulo' }); assert.strictEqual(d.status, 200); assert.deepStrictEqual(d.json.feedback.drawing, [{ type: 'free', color: '#0A84FF', points: [[0.1, 0.2], [0.5, 1]] }]);
    const rup = await call(replyPOST, '/api/exec-video/reply-upload', cA, post({ videoId: v.id })); assert.strictEqual(rup.status, 200); assert.strictEqual(CF.uploads.pop().maxDurationSeconds, 60);
    assert.strictEqual((await F({ kind: 'VIDEO', replyCfUid: 'f'.repeat(32) })).status, 400, 'vídeo-resposta que não existe na Cloudflare'); makeReady(rup.json.uid);
    assert.strictEqual((await F({ kind: 'VIDEO', replyCfUid: rup.json.uid, body: 'veja como faço' })).status, 200);
    assert.strictEqual((await F({ kind: 'REFERENCE', referenceExerciseId: 'e2' })).status, 400, 'sem vídeo na biblioteca'); assert.strictEqual((await F({ kind: 'REFERENCE', referenceExerciseId: 'nao' })).status, 404);
    const ref = await F({ kind: 'REFERENCE', referenceExerciseId: 'e1' }); assert.strictEqual(ref.status, 200); assert.strictEqual(ref.json.feedback.referenceName, 'Agachamento no Smith');
    assert.strictEqual((await F({ kind: 'TEXT', body: 'x' }, cB)).status, 403); assert.strictEqual((await F({ kind: 'TEXT', body: 'x' }, s1)).status, 403, 'aluno não responde'); assert.strictEqual((await F({ kind: 'TEXT', body: 'x' }, null)).status, 401);
    assert.strictEqual((await F({ kind: 'TEXT', body: 'ok' }, master)).status, 200); assert.ok(S.executionVideo[0].coachViewedAt, 'responder conta como visto');
    const r404 = await feedback(cA, 'nao', { kind: 'TEXT', body: 'x' }); assert.strictEqual(r404.status, 404);
  });

  await block('formas no desenho: seta, reta, círculo e retângulo guardam só início e fim; figura sem tamanho não vale; tipo desconhecido vira livre', async () => {
    const d = EV.cleanDrawing([
      { type: 'arrow', color: '#FFD60A', points: [[0.1, 0.1], [0.3, 0.3], [0.8, 0.9]] }, { type: 'circle', color: '#34C759', points: [[0.2, 0.2], [0.6, 0.5]] }, { type: 'rect', points: [[0.1, 0.1], [0.4, 0.4]] }, { type: 'line', color: '#FFFFFF', points: [[0, 0], [1, 1]] },
      { type: 'arrow', points: [[0.5, 0.5], [0.5, 0.5]] }, { type: 'estrela', points: [[0.1, 0.1], [0.9, 0.9], [0.2, 0.2]] }, { type: 'circle', points: [[0.5, 0.5]] }])!;
    assert.deepStrictEqual(d.map((x: any) => x.type), ['arrow', 'circle', 'rect', 'line', 'free'], 'figura sem tamanho e com 1 ponto saem; tipo desconhecido vira livre');
    assert.deepStrictEqual(d[0].points, [[0.1, 0.1], [0.8, 0.9]], 'seta = início e fim'); assert.strictEqual(d[2].color, '#FF3B30', 'cor fora da lista vira vermelho'); assert.strictEqual(d[4].points.length, 3, 'livre mantém todos os pontos');
  });

  await block('resposta composta (COMBO): texto + marcações no vídeo do aluno + vídeo do coach com marcações + comparação, tudo numa resposta; validação, push e o aluno vê', async () => {
    const v = mkVideo(); const F = (o: any, as = cA) => feedback(as, v.id, o); clearPushes();
    const mk = (at: number, note?: string, draw = true) => ({ atSec: at, note, drawing: draw ? [{ type: 'arrow', color: '#FF3B30', points: [[0.2, 0.2], [0.6, 0.7]] }] : undefined });
    for (const bad of [{ kind: 'COMBO' }, { kind: 'COMBO', body: '  ' }, { kind: 'COMBO', marks: [{ atSec: 2 }] }, { kind: 'COMBO', marks: [{ atSec: -1, note: 'x' }] }, { kind: 'COMBO', coach: { replyCfUid: 'curto' } }]) assert.strictEqual((await F(bad)).status, 400, JSON.stringify(bad));
    const solo = await F({ kind: 'COMBO', body: 'Só texto também vale.' }); assert.strictEqual(solo.status, 200, 'só texto'); assert.deepStrictEqual(solo.json.feedback.parts, { marks: [], coach: null });
    const rup = await call(replyPOST, '/api/exec-video/reply-upload', cA, post({ videoId: v.id })); makeReady(rup.json.uid);
    assert.strictEqual((await F({ kind: 'COMBO', coach: { replyCfUid: 'f'.repeat(32), marks: [] } })).status, 400, 'vídeo do coach que não existe na Cloudflare');
    assert.strictEqual((await F({ kind: 'COMBO', referenceExerciseId: 'e2' })).status, 400, 'comparação sem vídeo na biblioteca'); assert.strictEqual((await F({ kind: 'COMBO', referenceExerciseId: 'nao' })).status, 404);
    const r = await F({ kind: 'COMBO', body: 'Veja a lombar.', marks: [mk(6.04, 'Aqui arredonda'), mk(2, undefined, true), { atSec: 9, note: 'só nota', drawing: [{ type: 'circle', points: [[0.5, 0.5], [0.5, 0.5]] }] }, { atSec: 99999, note: 'fora' }], coach: { replyCfUid: rup.json.uid, marks: [mk(3.2, 'Assim')] }, referenceExerciseId: 'e1', saveAsQuickReply: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); const fb = r.json.feedback;
    assert.strictEqual(fb.kind, 'COMBO'); assert.strictEqual(fb.replyCfUid, rup.json.uid, 'o vídeo do coach fica também na coluna (varredura e apagar)'); assert.strictEqual(fb.referenceExerciseId, 'e1'); assert.strictEqual(fb.referenceName, 'Agachamento no Smith');
    assert.deepStrictEqual(fb.parts.marks.map((m: any) => m.atSec), [2, 6, 9], 'marcações em ordem do instante; sem desenho e sem nota é descartada; instante fora do limite sai (e figura sem tamanho vira só a nota)');
    assert.strictEqual(fb.parts.marks[2].drawing, null); assert.strictEqual(fb.parts.marks[2].note, 'só nota'); assert.strictEqual(fb.parts.coach.marks[0].note, 'Assim'); assert.strictEqual(S.videoQuickReply.some((q: any) => q.text === 'Veja a lombar.'), true, 'o texto vira resposta pronta');
    assert.strictEqual((await F({ kind: 'COMBO', marks: Array.from({ length: 30 }, (_, i) => mk(i, 'x')) })).json.feedback.parts.marks.length, EV.MAX_MARKS, 'limite de marcações');
    assert.strictEqual((await F({ kind: 'COMBO', body: 'x' }, cB)).status, 403); assert.strictEqual((await F({ kind: 'COMBO', body: 'x' }, s1)).status, 403, 'aluno não responde');
    assert.strictEqual(pushes().length, 1, 'um só push'); assert.strictEqual(pushes()[0].to, 's1');
    const d = await detail(s1, v.id); const got = d.json.video.feedbacks.find((f: any) => f.id === fb.id);
    assert.strictEqual(got.kind, 'COMBO'); assert.strictEqual(got.body, 'Veja a lombar.'); assert.strictEqual(got.parts.marks.length, 3); assert.strictEqual(got.parts.coachMarks.length, 1); assert.strictEqual(got.parts.hasCoachVideo, true);
    assert.ok(got.reply && got.reply.hls && !got.reply.hls.includes(rup.json.uid + '/'), 'vídeo do coach com link assinado'); assert.strictEqual(got.reference.name, 'Agachamento no Smith'); assert.ok(got.reference.videoUrl);
    const del = await call(fbDEL, `/api/exec-video/feedback/${fb.id}`, cA, { method: 'DELETE' }, { params: { fid: fb.id } }); assert.strictEqual(del.status, 200); assert.ok(!S.videoFeedback.some((f: any) => f.id === fb.id)); assert.ok(CF.deleted.includes(rup.json.uid), 'apagar a resposta apaga o vídeo do coach na Cloudflare');
  });

  await block('o aluno vê as respostas (isNew só na 1ª vez; vídeo-resposta com link assinado; referência com o vídeo da biblioteca) e recebe UM push por 10 min', async () => {
    const v = mkVideo(); clearPushes();
    await feedback(cA, v.id, { kind: 'TEXT', body: 'Primeira' }); await feedback(cA, v.id, { kind: 'MOMENT', body: 'Segunda', atSec: 3 }); assert.strictEqual(pushes().length, 1); assert.strictEqual(pushes()[0].to, 's1'); assert.strictEqual(pushes()[0].data.type, 'exec_video_feedback'); assert.strictEqual(pushes()[0].data.videoId, v.id);
    S.videoFeedback.forEach((f: any) => { f.createdAt = new Date(Date.now() - 20 * 60000); }); await feedback(cA, v.id, { kind: 'TEXT', body: 'Terceira' }); assert.strictEqual(pushes().length, 2, 'depois de 10 min avisa de novo');
    const rup = await call(replyPOST, '/api/exec-video/reply-upload', cA, post({ videoId: v.id })); makeReady(rup.json.uid); await feedback(cA, v.id, { kind: 'VIDEO', replyCfUid: rup.json.uid }); await feedback(cA, v.id, { kind: 'REFERENCE', referenceExerciseId: 'e1' });
    const peekCoach = await detail(cA, v.id, '?peek=1'); assert.ok(peekCoach.json.video.feedbacks.every((f: any) => f.isNew === false), 'coach não vê "novo"');
    const d = await detail(s1, v.id); const fb = d.json.video.feedbacks; assert.strictEqual(fb.length, 5); assert.ok(fb.every((f: any) => f.isNew === true));
    const vid = fb.find((f: any) => f.kind === 'VIDEO'); assert.ok(/\/TOK/.test(vid.reply.hls) && !vid.reply.hls.includes(rup.json.uid)); const ref = fb.find((f: any) => f.kind === 'REFERENCE'); assert.deepStrictEqual([ref.reference.name, ref.reference.videoUrl], ['Agachamento no Smith', 'https://cdn/agacha.m3u8']);
    assert.ok(S.videoFeedback.every((f: any) => f.studentReadAt)); const d2 = await detail(s1, v.id); assert.ok(d2.json.video.feedbacks.every((f: any) => f.isNew === false));
    const list = await call(vidGET, '/api/exec-video', s1); assert.strictEqual(list.json.videos[0].feedbackCount, 5); assert.strictEqual(list.json.videos[0].unreadFeedback, 0);
  });

  await block('lista de vídeos: só os do aluno (ou do aluno que o coach abriu); apagados e falhos não aparecem; sem acesso = 403', async () => {
    mkVideo(); mkVideo({ status: 'DELETED' }); mkVideo({ status: 'FAILED' }); mkVideo({ userId: 's2', coachId: 'cB' });
    const own = await call(vidGET, '/api/exec-video', s1); assert.strictEqual(own.json.videos.length, 1);
    const co = await call(vidGET, '/api/exec-video?userId=s1', cA); assert.strictEqual(co.json.videos.length, 1); assert.strictEqual((await call(vidGET, '/api/exec-video?userId=s1', cB)).status, 403); assert.strictEqual((await call(vidGET, '/api/exec-video?userId=s1', s2)).status, 403); assert.strictEqual((await call(vidGET, '/api/exec-video?userId=s1', master)).status, 200);
  });

  await block('pedido do coach: avisa o aluno, libera UM envio mesmo sem liberação, não duplica, cancela, limita abertos e só o coach do aluno mexe', async () => {
    let r = await call(reqPOST, '/api/exec-video/request', cA, post({ studentId: 's1', exerciseId: 'e1', day: 'A', workoutId: 'w1', note: 'quero ver a descida' })); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(S.videoRequest[0].exerciseName, 'Agachamento no Smith'); assert.strictEqual(pushes().length, 1); assert.strictEqual(pushes()[0].to, 's1'); assert.strictEqual(pushes()[0].data.type, 'exec_video_request'); assert.ok(pushes()[0].body.includes('Agachamento no Smith'));
    const dup = await call(reqPOST, '/api/exec-video/request', cA, post({ studentId: 's1', exerciseId: 'e1' })); assert.strictEqual(dup.json.already, true); assert.strictEqual(S.videoRequest.length, 1);
    const al = await call(allowGET, '/api/exec-video/allowance?exerciseId=e1', s1); assert.strictEqual(al.json.allowance.canUpload, true); assert.strictEqual(al.json.allowance.mode, 'REQUEST'); assert.strictEqual(al.json.requests.length, 1);
    const al2 = await call(allowGET, '/api/exec-video/allowance?exerciseId=e2', s1); assert.strictEqual(al2.json.allowance.canUpload, false);
    assert.strictEqual((await call(reqGET, '/api/exec-video/request', s1)).json.requests.length, 1); assert.strictEqual((await call(reqGET, '/api/exec-video/request?userId=s1', cB)).status, 403);
    const id = S.videoRequest[0].id; assert.strictEqual((await call(reqDEL, `/api/exec-video/request/${id}`, cB, { method: 'DELETE' }, { params: { id } })).status, 403); assert.strictEqual((await call(reqDEL, `/api/exec-video/request/${id}`, s1, { method: 'DELETE' }, { params: { id } })).status, 403, 'aluno não cancela');
    assert.strictEqual((await call(reqDEL, `/api/exec-video/request/${id}`, cA, { method: 'DELETE' }, { params: { id } })).status, 200); assert.strictEqual(S.videoRequest[0].status, 'CANCELED'); assert.strictEqual((await upload(s1)).status, 403, 'cancelado: volta a valer a regra geral');
    assert.strictEqual((await call(reqPOST, '/api/exec-video/request', cB, post({ studentId: 's1', exerciseId: 'e1' }))).status, 403); assert.strictEqual((await call(reqPOST, '/api/exec-video/request', s1, post({ studentId: 's1', exerciseId: 'e1' }))).status, 403); assert.strictEqual((await call(reqPOST, '/api/exec-video/request', cA, post({}))).status, 400);
    assert.strictEqual((await call(reqPOST, '/api/exec-video/request', cA, post({ studentId: 's1', exerciseId: 'nao' }))).status, 404);
    const any = await call(reqPOST, '/api/exec-video/request', cA, post({ studentId: 's1' })); assert.strictEqual(any.status, 200); assert.strictEqual(S.videoRequest[1].exerciseId, null); assert.ok(/qualquer exercício/.test(S.videoRequest[1].exerciseName));
    for (let i = 0; i < 12; i++) S.videoRequest.push({ id: 'x' + i, userId: 's1', coachId: 'cA', exerciseId: 'ex' + i, exerciseName: 'E', status: 'OPEN', createdAt: new Date() });
    assert.strictEqual((await call(reqPOST, '/api/exec-video/request', cA, post({ studentId: 's1', exerciseId: 'e2' }))).status, 409);
  });

  await block('liberação pelo coach (PUT/GET): liga, limita, padrão do coach, apaga a regra; valida o limite; só coach do aluno (ou master); a regra vale no envio', async () => {
    let r = await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: 's1', enabled: true, monthlyLimit: 3 })); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.own, { enabled: true, monthlyLimit: 3 });
    let g = await call(polGET, '/api/exec-video/policy?studentId=s1', cA); assert.deepStrictEqual([g.json.own, g.json.effective.source, g.json.used], [{ enabled: true, monthlyLimit: 3 }, 'STUDENT', 0]);
    for (const bad of [0, 101, 'abc', 1.5, -2]) assert.strictEqual((await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: 's1', enabled: true, monthlyLimit: bad }))).status, 400, String(bad));
    r = await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: 's1', enabled: true, monthlyLimit: '' })); assert.strictEqual(r.json.own.monthlyLimit, null); assert.strictEqual(S.videoPolicy.length, 1, 'regravar não duplica');
    await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: '*', enabled: true, monthlyLimit: 2 })); const g2 = await call(polGET, '/api/exec-video/policy?studentId=*', cA); assert.deepStrictEqual(g2.json.default, { enabled: true, monthlyLimit: 2 });
    assert.strictEqual((await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: '*', clear: true }))).status, 400);
    r = await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: 's1', clear: true })); assert.strictEqual(r.json.own, null); g = await call(polGET, '/api/exec-video/policy?studentId=s1', cA); assert.strictEqual(g.json.effective.source, 'DEFAULT'); assert.strictEqual(g.json.effective.monthlyLimit, 2);
    assert.strictEqual((await upload(s1)).status, 200, 'o padrão do coach vale para o aluno sem regra');
    assert.strictEqual((await call(polPUT, '/api/exec-video/policy', cB, put({ studentId: 's1', enabled: true }))).status, 403); assert.strictEqual((await call(polPUT, '/api/exec-video/policy', s1, put({ studentId: 's1', enabled: true }))).status, 403); assert.strictEqual((await call(polGET, '/api/exec-video/policy?studentId=s1', s1)).status, 403);
    assert.strictEqual((await call(polPUT, '/api/exec-video/policy', cA, put({ enabled: true }))).status, 400); assert.strictEqual((await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: 'nao', enabled: true }))).status, 404);
    await call(polPUT, '/api/exec-video/policy', master, put({ studentId: 's2', enabled: true, monthlyLimit: 1 })); assert.deepStrictEqual([S.videoPolicy.find((p: any) => p.studentId === 's2').coachId], ['cB'], 'o master grava na regra do coach DO aluno');
  });

  await block('respostas prontas: criar (sem duplicar), listar só as do coach, apagar só as dele; "salvar como pronta" ao responder', async () => {
    assert.strictEqual((await call(qrPOST, '/api/exec-video/quick-replies', cA, post({ text: 'Mantenha a lombar neutra.' }))).status, 200); await call(qrPOST, '/api/exec-video/quick-replies', cA, post({ text: 'Mantenha a lombar neutra.' })); assert.strictEqual(S.videoQuickReply.length, 1);
    assert.strictEqual((await call(qrPOST, '/api/exec-video/quick-replies', cA, post({ text: '  ' }))).status, 400); assert.strictEqual((await call(qrPOST, '/api/exec-video/quick-replies', s1, post({ text: 'x' }))).status, 403);
    await call(qrPOST, '/api/exec-video/quick-replies', cB, post({ text: 'do B' })); const l = await call(qrGET, '/api/exec-video/quick-replies', cA); assert.deepStrictEqual(l.json.replies.map((x: any) => x.text), ['Mantenha a lombar neutra.']);
    const idB = S.videoQuickReply.find((x: any) => x.text === 'do B').id; await call(qrDEL, `/api/exec-video/quick-replies?id=${idB}`, cA, { method: 'DELETE' }); assert.strictEqual(S.videoQuickReply.length, 2, 'não apaga a de outro coach');
    const id = S.videoQuickReply.find((x: any) => x.text.startsWith('Mantenha')).id; await call(qrDEL, `/api/exec-video/quick-replies?id=${id}`, cA, { method: 'DELETE' }); assert.strictEqual(S.videoQuickReply.length, 1); assert.strictEqual((await call(qrDEL, '/api/exec-video/quick-replies', cA, { method: 'DELETE' })).status, 400);
    const v = mkVideo(); await feedback(cA, v.id, { kind: 'TEXT', body: 'Abra mais o pé.', saveAsQuickReply: true }); await feedback(cA, v.id, { kind: 'TEXT', body: 'Abra mais o pé.', saveAsQuickReply: true }); await feedback(cA, v.id, { kind: 'TEXT', body: 'Sem salvar' });
    assert.deepStrictEqual(S.videoQuickReply.filter((x: any) => x.coachId === 'cA').map((x: any) => x.text), ['Abra mais o pé.']);
    for (let i = 0; i < 70; i++) S.videoQuickReply.push({ id: 'q' + i, coachId: 'cA', text: 'r' + i }); assert.strictEqual((await call(qrPOST, '/api/exec-video/quick-replies', cA, post({ text: 'mais uma' }))).status, 409);
  });

  await block('apagar: o aluno apaga o dele (some da Cloudflare, continua contando no limite); o coach também; outros não; apagar resposta do coach remove o vídeo-resposta', async () => {
    setPolicy({ monthlyLimit: 1 }); const r = await upload(s1); const id = r.json.video.id; const uid = S.executionVideo[0].cfUid; makeReady(uid); await markUploaded(s1, id);
    assert.strictEqual((await call(oneDEL, `/api/exec-video/${id}`, s2, { method: 'DELETE' }, { params: { id } })).status, 403);
    const rup = await call(replyPOST, '/api/exec-video/reply-upload', cA, post({ videoId: id })); makeReady(rup.json.uid); const fb = await feedback(cA, id, { kind: 'VIDEO', replyCfUid: rup.json.uid });
    assert.strictEqual((await call(fbDEL, `/api/exec-video/feedback/${fb.json.feedback.id}`, s1, { method: 'DELETE' }, { params: { fid: fb.json.feedback.id } })).status, 403, 'aluno não apaga resposta do coach');
    assert.strictEqual((await call(fbDEL, `/api/exec-video/feedback/${fb.json.feedback.id}`, cB, { method: 'DELETE' }, { params: { fid: fb.json.feedback.id } })).status, 403);
    assert.strictEqual((await call(fbDEL, `/api/exec-video/feedback/${fb.json.feedback.id}`, cA, { method: 'DELETE' }, { params: { fid: fb.json.feedback.id } })).status, 200); assert.ok(CF.deleted.includes(rup.json.uid)); assert.strictEqual(S.videoFeedback.length, 0);
    assert.strictEqual((await call(fbDEL, '/api/exec-video/feedback/nao', cA, { method: 'DELETE' }, { params: { fid: 'nao' } })).status, 404);
    const rup2 = await call(replyPOST, '/api/exec-video/reply-upload', cA, post({ videoId: id })); makeReady(rup2.json.uid); await feedback(cA, id, { kind: 'VIDEO', replyCfUid: rup2.json.uid });
    assert.strictEqual((await call(oneDEL, `/api/exec-video/${id}`, s1, { method: 'DELETE' }, { params: { id } })).status, 200); assert.ok(CF.deleted.includes(uid) && CF.deleted.includes(rup2.json.uid)); assert.strictEqual(S.executionVideo[0].status, 'DELETED'); assert.ok(S.executionVideo[0].deletedAt);
    assert.strictEqual((await detail(s1, id)).status, 404); assert.strictEqual((await upload(s1)).status, 403, 'apagar não devolve o limite do mês');
    const v2 = mkVideo(); assert.strictEqual((await call(oneDEL, `/api/exec-video/${v2.id}`, cA, { method: 'DELETE' }, { params: { id: v2.id } })).status, 200, 'o coach também apaga');
  });

  await block('varredura automática: confirma envio esquecido, dá como falho o parado há horas, apaga os de 90 dias (e as respostas em vídeo), respeita o lote e funciona sem Cloudflare', async () => {
    const cf = VS.cfConfig()!;
    const forgot = mkVideo({ status: 'UPLOADING' }); const slow = mkVideo({ status: 'UPLOADING', createdAt: new Date(Date.now() - 7 * H) }); CF.videos.get(slow.cfUid).ready = false; const fresh = mkVideo({ status: 'UPLOADING' }); CF.videos.get(fresh.cfUid).ready = false;
    const old = mkVideo({ expiresAt: new Date(Date.now() - H) }); const rep = hex(); CF.videos.set(rep, { ready: true, duration: 9 }); S.videoFeedback.push({ id: 'fb1', videoId: old.id, coachId: 'cA', kind: 'VIDEO', replyCfUid: rep });
    const young = mkVideo(); clearPushes();
    const out = await SV.sweepExecVideos(prisma, cf); assert.deepStrictEqual(out, { refreshed: 1, failed: 1, expired: 1 });
    const by = (id: string) => S.executionVideo.find((v: any) => v.id === id); assert.strictEqual(by(forgot.id).status, 'READY'); assert.strictEqual(by(slow.id).status, 'FAILED'); assert.ok(CF.deleted.includes(slow.cfUid)); assert.strictEqual(by(fresh.id).status, 'UPLOADING');
    assert.strictEqual(by(old.id).status, 'DELETED'); assert.ok(CF.deleted.includes(old.cfUid) && CF.deleted.includes(rep)); assert.strictEqual(by(young.id).status, 'READY'); assert.strictEqual(pushes().length, 1, 'avisou o coach do vídeo esquecido');
    assert.deepStrictEqual(await SV.sweepExecVideos(prisma, cf), { refreshed: 0, failed: 0, expired: 0 }, 'rodar de novo não repete'); assert.deepStrictEqual(await SV.sweepExecVideos(prisma, null), { refreshed: 0, failed: 0, expired: 0 });
    for (let i = 0; i < 30; i++) mkVideo({ expiresAt: new Date(Date.now() - H) }); assert.strictEqual((await SV.sweepExecVideos(prisma, cf)).expired, SV.SWEEP_BATCH, 'lote de 20 por rodada');
    const gone = mkVideo({ expiresAt: new Date(Date.now() - H) }); CF.videos.delete(gone.cfUid); assert.strictEqual((await SV.sweepExecVideos(prisma, cf)).expired >= 1, true, 'já apagado lá conta como apagado');
  });

  await block('o cron da agenda também roda a varredura (task=videos e all); exige o segredo', async () => {
    mkVideo({ expiresAt: new Date(Date.now() - H) });
    const noAuth = await call(cronGET, '/api/cron/agenda?task=videos', null); assert.strictEqual(noAuth.status, 401);
    const r = await call(cronGET, '/api/cron/agenda?task=videos', 'segredo'); assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(r.json.videos.expired, 1); assert.strictEqual(S.executionVideo[0].status, 'DELETED');
    assert.strictEqual((await call(cronGET, '/api/cron/agenda?task=xyz', 'segredo')).status, 400);
  });

  await block('central HOJE: vídeo enviado sem resposta vira pendência (prioritário = hoje); some quando o coach responde; só dos alunos dele; pedido aberto avisa na hora, inclusive da conta de teste', async () => {
    const v = mkVideo({ studentNote: 'dor no joelho', priority: true }); const v2 = mkVideo({ exerciseName: 'Leg press', createdAt: new Date(Date.now() - 5 * DAY) }); mkVideo({ userId: 's2', coachId: 'cB' }); mkVideo({ status: 'UPLOADING' });
    let t = (await hoje()).filter((x) => x.type === 'video'); assert.strictEqual(t.length, 2);
    const a = t.find((x) => x.key === `video:${v.id}`)!; assert.deepStrictEqual([a.severity, a.videoId, a.person!.id, a.target.type, (a.target as any).openVideo], ['today', v.id, 's1', 'student', v.id]); assert.ok(/enviou vídeo: Agachamento no Smith/.test(a.title) && a.subtitle!.includes('cita dor/lesão') && a.subtitle!.includes('dor no joelho'));
    assert.strictEqual(t.find((x) => x.key === `video:${v2.id}`)!.severity, 'soon');
    await feedback(cA, v.id, { kind: 'TEXT', body: 'ok' }); t = (await hoje()).filter((x) => x.type === 'video'); assert.deepStrictEqual(t.map((x) => x.key), [`video:${v2.id}`]);
    S.videoRequest.push({ id: 'rq1', userId: 's1', coachId: 'cA', exerciseId: 'e1', exerciseName: 'Agachamento no Smith', status: 'OPEN', createdAt: new Date(Date.now() - 4 * DAY) }, { id: 'rq2', userId: 's1', coachId: 'cA', exerciseId: 'e2', exerciseName: 'Leg press', status: 'OPEN', createdAt: new Date() }, { id: 'rq3', userId: 's1', coachId: 'cA', exerciseId: 'e2', exerciseName: 'X', status: 'FULFILLED', createdAt: new Date(Date.now() - 9 * DAY) });
    const pd = (await hoje()).filter((x) => x.type === 'videopedido'); assert.strictEqual(pd.length, 2, 'pedido aberto aparece na hora (não espera dias); o já atendido não'); const old4 = pd.find((x) => x.key === 'videopedido:rq1')!; const nw = pd.find((x) => x.key === 'videopedido:rq2')!; assert.ok(/ainda não mandou o vídeo pedido/.test(old4.title) && old4.subtitle!.includes('pedido há 4 dias')); assert.ok(nw.subtitle!.includes('Leg press') && nw.subtitle!.includes('pedido hoje'));
    S.videoRequest.push({ id: 'rqT', userId: 'sT', coachId: 'cA', exerciseId: 'e1', exerciseName: 'Búlgaro', status: 'OPEN', createdAt: new Date() }); const mk2 = mkVideo({ userId: 'sT', exerciseName: 'Teste vídeo' }); const all = await hoje(); assert.ok(all.some((x) => x.key === 'videopedido:rqT') && all.some((x) => x.key === `video:${mk2.id}`), 'a conta de teste do coach também aparece (é como ele confere o fluxo)'); S.videoRequest.pop(); S.executionVideo.splice(S.executionVideo.findIndex((x: any) => x.id === mk2.id), 1);
    assert.strictEqual((await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: `video:${v2.id}`, task: { type: 'video', title: 'T', person: { kind: 'student', id: 's1', name: 'Samara' } } }))).status, 200);
    assert.strictEqual((await hoje()).filter((x) => x.type === 'video').length, 0, 'RESOLVIDO também tira');
    for (let i = 0; i < 12; i++) mkVideo({ createdAt: new Date(Date.now() - i * 60000) }); const cap = (await hoje()).filter((x) => x.type === 'video' || x.type === 'video_mais'); assert.ok(cap.some((x) => x.type === 'video_mais') && cap.length <= 9);
  });

  await block('reforços de regra: nº da série e recado limitados; resposta com tamanho/instante/vídeo inválidos; uso do mês só conta o PRÓPRIO aluno; pedido errado não vale por outro pedido aberto', async () => {
    const i = EV.cleanUploadInput({ setNumber: 0, note: 'x'.repeat(5000), exerciseName: 'y'.repeat(500) }); assert.strictEqual(i.setNumber, null); assert.strictEqual(i.note!.length, EV.MAX_NOTE); assert.strictEqual(i.exerciseName.length, 120); assert.strictEqual(EV.cleanUploadInput({ setNumber: 99 }).setNumber, null); assert.strictEqual(EV.cleanUploadInput({ setNumber: 50 }).setNumber, 50); assert.strictEqual(EV.cleanUploadInput({ setNumber: 1 }).setNumber, 1); assert.strictEqual(EV.cleanUploadInput({ setNumber: 1.5 }).setNumber, null);
    const f = EV.cleanFeedback({ kind: 'VIDEO', replyCfUid: 'abc' }); assert.strictEqual(f.ok, false); assert.strictEqual(EV.cleanFeedback({ kind: 'TEXT', body: 'z'.repeat(5000) }).ok && (EV.cleanFeedback({ kind: 'TEXT', body: 'z'.repeat(5000) }) as any).value.body.length, EV.MAX_BODY);
    assert.strictEqual(EV.cleanFeedback({ kind: 'MOMENT', body: 'x', atSec: 99999 }).ok, false); assert.strictEqual((EV.cleanFeedback({ kind: 'MOMENT', body: 'x', atSec: 3600 }) as any).value.atSec, 3600); assert.strictEqual((EV.cleanFeedback({ kind: 'MOMENT', body: 'x', atSec: 1.26 }) as any).value.atSec, 1.3); assert.strictEqual(EV.cleanFeedback({ kind: 'MOMENT', body: 'x', atSec: 3601 }).ok, false);
    mkVideo({ userId: 's2', coachId: 'cB' }); mkVideo({ userId: 's2', coachId: 'cB' }); assert.strictEqual(await EV.monthlyUsage(prisma, 's1', new Date()), 0, 'vídeos de outro aluno não entram na conta');
    setPolicy(); S.videoRequest.push({ id: 'rqE', userId: 's1', coachId: 'cA', exerciseId: null, exerciseName: 'qualquer', status: 'OPEN', createdAt: new Date() });
    const a = await EV.checkAllowance(prisma, { studentId: 's1', coachId: 'cA', requestId: 'outro-pedido' }); assert.strictEqual(a.canUpload, false, 'o id do pedido tem que ser de um pedido aberto DESTE aluno'); assert.strictEqual(a.mode, 'NONE');
  });
  await block('reforços do servidor: confirmação em duplicidade avisa 1 vez só (corrida); varredura só marca apagado se a Cloudflare apagou; lote de envios; sem Cloudflare não quebra; já-apagado conta; duração -1 vira vazio; vídeo falho não toca', async () => {
    const cf = VS.cfConfig()!; const v = mkVideo({ status: 'UPLOADING' }); const stale = JSON.parse(JSON.stringify(v)); stale.status = 'UPLOADING'; clearPushes();
    const r1 = await SV.refreshStatus(prisma, cf, stale); const r2 = await SV.refreshStatus(prisma, cf, stale); assert.strictEqual(r1.status, 'READY'); assert.strictEqual(r2.status, 'READY'); assert.strictEqual(pushes().length, 1, 'a 2ª confirmação (corrida) não avisa de novo');
    assert.strictEqual(await SV.refreshStatus(prisma, cf, null), null); const ready = mkVideo(); assert.strictEqual((await SV.refreshStatus(prisma, cf, ready)).id, ready.id); assert.strictEqual(await SV.refreshStatus(prisma, null, stale), stale);
    const old = mkVideo({ expiresAt: new Date(Date.now() - H) }); CF.down = true; const o1 = await SV.sweepExecVideos(prisma, cf); assert.strictEqual(o1.expired, 0); assert.strictEqual(S.executionVideo.find((x: any) => x.id === old.id).status, 'READY', 'a Cloudflare falhou: continua para tentar de novo'); CF.down = false;
    assert.strictEqual((await SV.sweepExecVideos(prisma, cf)).expired, 1); assert.strictEqual(S.executionVideo.find((x: any) => x.id === old.id).status, 'DELETED');
    const gone = mkVideo({ expiresAt: new Date(Date.now() - H) }); CF.videos.delete(gone.cfUid); await SV.sweepExecVideos(prisma, cf); assert.strictEqual(S.executionVideo.find((x: any) => x.id === gone.id).status, 'DELETED', 'já apagado na Cloudflare conta como apagado');
    for (let k = 0; k < 25; k++) mkVideo({ status: 'UPLOADING' }); const o2 = await SV.sweepExecVideos(prisma, cf); assert.strictEqual(o2.refreshed, SV.SWEEP_BATCH, 'lote de 20 envios por rodada');
    mkVideo({ status: 'UPLOADING', createdAt: new Date(Date.now() - 9 * H) }); assert.deepStrictEqual(await SV.sweepExecVideos(prisma, null), { refreshed: 0, failed: 0, expired: 0 }, 'sem Cloudflare não lança nem mexe');
    const info = await VS.getVideoInfo(cf, hex()); assert.strictEqual(info, null); const uid = hex(); CF.videos.set(uid, { ready: true, duration: -1 }); assert.strictEqual((await VS.getVideoInfo(cf, uid))!.duration, null);
    const failed = mkVideo({ status: 'FAILED' }); const pres = await SV.presentVideo(prisma, cf, failed); assert.strictEqual(pres.playback, null, 'vídeo falho não gera link');
  });
  await block('reforços de acesso: liberação do aluno só para ele/coach; resposta em vídeo apagado, resposta pronta só para texto, reply-upload e cancelar pedido com as regras certas; política e respostas prontas só de coach', async () => {
    const mine = await call(allowGET, '/api/exec-video/allowance', s1); assert.strictEqual(mine.status, 200); assert.strictEqual((await call(allowGET, '/api/exec-video/allowance?userId=s1', s2)).status, 403); assert.strictEqual((await call(allowGET, '/api/exec-video/allowance?userId=s1', cB)).status, 403); assert.strictEqual((await call(allowGET, '/api/exec-video/allowance?userId=s1', cA)).status, 200); assert.strictEqual((await call(allowGET, '/api/exec-video/allowance?userId=nao', cA)).status, 404);
    const dead = mkVideo({ status: 'DELETED' }); assert.strictEqual((await feedback(cA, dead.id, { kind: 'TEXT', body: 'x' })).status, 404); const failedV = mkVideo({ status: 'FAILED' }); assert.strictEqual((await feedback(cA, failedV.id, { kind: 'TEXT', body: 'x' })).status, 404);
    const v = mkVideo(); await feedback(cA, v.id, { kind: 'DRAWING', atSec: 1, body: 'não vira resposta pronta', drawing: [{ points: [[0, 0], [1, 1]] }], saveAsQuickReply: true }); assert.strictEqual(S.videoQuickReply.length, 0); await feedback(cA, v.id, { kind: 'REFERENCE', referenceExerciseId: 'e1', body: 'também não', saveAsQuickReply: true }); assert.strictEqual(S.videoQuickReply.length, 0);
    const rep = (as: string | null, o: any) => call(replyPOST, '/api/exec-video/reply-upload', as, post(o)); assert.strictEqual((await rep(cB, { videoId: v.id })).status, 403); assert.strictEqual((await rep(s1, { videoId: v.id })).status, 403); assert.strictEqual((await rep(null, { videoId: v.id })).status, 401); assert.strictEqual((await rep(cA, { videoId: dead.id })).status, 404); assert.strictEqual((await rep(cA, {})).status, 404);
    S.videoRequest.push({ id: 'rqF', userId: 's1', coachId: 'cA', exerciseId: 'e1', exerciseName: 'X', status: 'FULFILLED', createdAt: new Date() }); await call(reqDEL, '/api/exec-video/request/rqF', cA, { method: 'DELETE' }, { params: { id: 'rqF' } }); assert.strictEqual(S.videoRequest[0].status, 'FULFILLED', 'pedido já atendido não vira cancelado'); assert.strictEqual((await call(reqDEL, '/api/exec-video/request/nao', cA, { method: 'DELETE' }, { params: { id: 'nao' } })).status, 404);
    assert.strictEqual((await call(polPUT, '/api/exec-video/policy', s1, put({ studentId: '*', enabled: true }))).status, 403, 'aluno não grava nem o padrão'); assert.strictEqual(S.videoPolicy.length, 0);
    const str = await call(polPUT, '/api/exec-video/policy', cA, put({ studentId: 's1', enabled: 'false', monthlyLimit: 3 })); assert.strictEqual(str.json.own.enabled, false, '"false" em texto não liga'); assert.strictEqual((await call(qrGET, '/api/exec-video/quick-replies', s1)).status, 403); assert.strictEqual((await call(qrDEL, '/api/exec-video/quick-replies?id=x', s1, { method: 'DELETE' })).status, 403);
  });
  await block('central HOJE: vídeo com mais de 30 dias não vira pendência', async () => {
    mkVideo({ createdAt: new Date(Date.now() - 35 * DAY) }); const fresh = mkVideo(); const t = (await hoje()).filter((x) => x.type === 'video'); assert.deepStrictEqual(t.map((x) => x.key), [`video:${fresh.id}`]);
  });

  console.log(`\n${passed} ok, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
