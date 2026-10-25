import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as X from '/home/user/fitos-final/lib/exams';
import { __setExamStore, purgeExams, ExamStore } from '/home/user/fitos-final/lib/examsStore';
import { POST as POST_EX, GET as GET_EX } from '/home/user/fitos-final/app/api/exams/route';
import { GET as GET_ONE, DELETE as DEL_ONE } from '/home/user/fitos-final/app/api/exams/[id]/route';
import { POST as POST_REPLY } from '/home/user/fitos-final/app/api/exams/[id]/reply/route';
import { GET as GET_FILE } from '/home/user/fitos-final/app/api/exams/file/[fileId]/route';
import { GET as GET_STATUS } from '/home/user/fitos-final/app/api/exams/status/route';
import { GET as GET_INBOX } from '/home/user/fitos-final/app/api/exams/inbox/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); (globalThis as any).__pushes = []; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 4).join('\n        ')); } };

// armazenamento falso (o "bucket privado")
const bucket = new Map<string, Buffer>(); const removed: string[] = [];
const store: ExamStore = { async put(k, b) { bucket.set(k, b); }, async get(k) { return bucket.get(k) || null; }, async remove(k) { removed.push(k); return bucket.delete(k); } };
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 2)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 3)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 4)]);

const user = (id: string, extra: any = {}) => S.user.push({ id, role: 'COACH', name: 'Pessoa ' + id, email: id + '@x.com', accountStatus: 'ACTIVE', coachBillingStatus: 'ACTIVE', pushToken: 'tk-' + id, ...extra });
const feat = (coachId: string, feature = 'exames') => S.coachFeature.push({ id: 'f' + Math.random(), coachId, feature, reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null });
// cenário: aluno s1 (personal c1, nutri n1); aluno de OUTRO coach: s2 (c2); master Paulo sem vínculo com s1
const world = (o: { c1?: boolean; n1?: boolean } = {}) => {
  user('c1'); user('n1'); user('c2'); user(PAULO_ID, { role: 'ADMIN', name: 'Paulo' });
  user('s1', { role: 'USER', coachId: 'c1', nutritionistId: 'n1', name: 'Maria Souza' }); user('s2', { role: 'USER', coachId: 'c2', nutritionistId: null, name: 'Outro Aluno' });
  if (o.c1 !== false) feat('c1'); if (o.n1 !== false) feat('n1'); feat('c2');
};
const call = async (fn: any, url: string, as: string | null, init: any = {}, ctx?: any) => {
  const headers: any = { ...(init.json ? { 'content-type': 'application/json' } : {}) }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { method: init.method || 'GET', headers, body: init.json ? JSON.stringify(init.json) : init.body }), ctx);
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, json: ct.includes('json') ? await r.json().catch(() => null) : null, res: r };
};
const form = (fields: Record<string, string>, files: { buf: Buffer; name: string; type?: string }[]) => { const f = new FormData(); Object.entries(fields).forEach(([k, v]) => f.append(k, v)); files.forEach((x) => f.append('file', new File([x.buf], x.name, { type: x.type || 'application/octet-stream' }))); return f; };
const send = (as: string, fields: any, files: any[], userId?: string) => call(POST_EX, '/api/exams', as, { method: 'POST', body: form({ type: 'BLOOD', examDate: '2026-10-20', note: 'em jejum', ...(userId ? { userId } : {}), ...fields }, files) });
const idp = (id: string) => ({ params: { id } }); const fp = (fileId: string) => ({ params: { fileId } });
const s1 = tok('s1', 'USER'), s2 = tok('s2', 'USER'), c1 = tok('c1'), n1 = tok('n1'), c2 = tok('c2'), paulo = tok(PAULO_ID, 'ADMIN');

(async () => {
  __setExamStore(store);

  await t('arquivo: o tipo vem dos bytes (PDF, JPG, PNG, WEBP); .exe disfarçado e arquivo curto não passam', () => {
    assert.strictEqual(X.sniffMime(PDF), 'application/pdf'); assert.strictEqual(X.sniffMime(JPG), 'image/jpeg'); assert.strictEqual(X.sniffMime(PNG), 'image/png');
    assert.strictEqual(X.sniffMime(Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.alloc(8)])), 'image/webp'); assert.strictEqual(X.sniffMime(EXE), null); assert.strictEqual(X.sniffMime(Buffer.from('%PDF')), null); assert.strictEqual(X.sniffMime(null), null);
  });

  await t('envio: 1 PDF sozinho OU até 8 fotos; não mistura; limites de tamanho e de quantidade; mensagens em português', () => {
    const m = (mime: string | null, size = 1000) => ({ mime, size });
    assert.strictEqual(X.validateFiles([m('application/pdf')]).ok, true); assert.strictEqual(X.validateFiles(Array.from({ length: 8 }, () => m('image/jpeg'))).ok, true);
    const bad = (a: any[], re: RegExp) => { const r: any = X.validateFiles(a); assert.strictEqual(r.ok, false); assert.ok(re.test(r.error), r.error); };
    bad([], /Escolha o PDF/); bad([m('application/pdf'), m('image/jpeg')], /não misture/i); bad(Array.from({ length: 9 }, () => m('image/jpeg')), /No máximo 8/); bad([m(null)], /não reconhecido/i); bad([m('image/png', 0)], /vazio/);
    bad([m('application/pdf', 13 * 1048576)], /12 MB/); bad([m('image/jpeg', 9 * 1048576)], /8 MB/); bad(Array.from({ length: 4 }, () => m('image/jpeg', 7 * 1048576)), /24 MB/);
  });

  await t('formulário: tipo obrigatório; data não pode ser futura nem velha demais; destino padrão = os dois', () => {
    const now = new Date('2026-10-25T15:00:00Z'); const c = (b: any) => X.cleanSubmissionInput(b, now) as any;
    assert.strictEqual(c({}).ok, false); assert.strictEqual(c({ type: 'xx' }).ok, false);
    const v = c({ type: 'blood', examDate: '2026-10-20', note: '  jejum  ' }).value; assert.deepStrictEqual([v.type, v.to, v.note, v.examDate.toISOString().slice(0, 10)], ['BLOOD', 'BOTH', 'jejum', '2026-10-20']);
    assert.strictEqual(c({ type: 'BLOOD', examDate: '2026-12-01' }).ok, false); assert.strictEqual(c({ type: 'BLOOD', examDate: '1990-01-01' }).ok, false); assert.strictEqual(c({ type: 'BLOOD', examDate: '20/10/2026' }).ok, false);
    assert.strictEqual(c({ type: 'BLOOD', to: 'nutri' }).value.to, 'NUTRI'); assert.strictEqual(c({ type: 'BLOOD', to: 'qualquer' }).value.to, 'BOTH');
  });

  await t('quem é quem: aluno, profissional escolhido e ainda vinculado; master SEM vínculo, outro coach e profissional não escolhido ficam de fora', () => {
    const sub = { userId: 's1', coachId: 'c1', nutritionistId: null }; const st = { id: 's1', coachId: 'c1', nutritionistId: 'n1' };
    assert.strictEqual(X.examRole({ id: 's1' }, sub, st), 'STUDENT'); assert.strictEqual(X.examRole({ id: 'c1' }, sub, st), 'PRO');
    assert.strictEqual(X.examRole({ id: 'n1' }, sub, st), null, 'o nutri não foi escolhido neste envio');
    assert.strictEqual(X.examRole({ id: PAULO_ID }, sub, st), null, 'master sem vínculo não vê'); assert.strictEqual(X.examRole({ id: 'c2' }, sub, st), null);
    assert.strictEqual(X.examRole({ id: 'c1' }, sub, { ...st, coachId: 'c9' }), null, 'aluno trocou de personal: o antigo perde o acesso');
    assert.strictEqual(X.examRole({ id: PAULO_ID }, { ...sub, coachId: PAULO_ID }, { ...st, coachId: PAULO_ID }), 'PRO', 'master que É o coach do aluno vê');
    assert.strictEqual(X.examRole({ id: 'c1' }, sub, { ...st, isTestAccount: true }), 'STUDENT', 'no ALUNO TESTE o coach dono age como o aluno'); assert.strictEqual(X.examRole(null, sub, st), null);
    assert.strictEqual(X.actsAsExamStudent({ id: 'c1' }, { id: 's1', coachId: 'c1' }), false, 'coach não age como aluno real'); assert.strictEqual(X.actsAsExamStudent({ id: 'c1' }, { id: 's1', coachId: 'c1', isTestAccount: true }), true, 'mas no aluno TESTE sim');
  });

  await t('status: sem a chave `exames` desligado; com a chave mostra quem recebe; sem armazenamento privado desligado; outro aluno não vê os dados', async () => {
    world({ c1: false, n1: false });
    let r = await call(GET_STATUS, '/api/exams/status', s1); assert.strictEqual(r.json.enabled, false); assert.deepStrictEqual(r.json.recipients, []);
    feat('n1'); r = await call(GET_STATUS, '/api/exams/status', s1); assert.strictEqual(r.json.enabled, true); assert.deepStrictEqual(r.json.recipients.map((x: any) => [x.id, x.kind]), [['n1', 'NUTRI']]);
    feat('c1'); r = await call(GET_STATUS, '/api/exams/status', s1); assert.deepStrictEqual(r.json.recipients.map((x: any) => x.kind), ['COACH', 'NUTRI']); assert.ok(r.json.types.length === 5 && r.json.limits.maxFiles === 8);
    r = await call(GET_STATUS, '/api/exams/status?userId=s1', s2); assert.strictEqual(r.json.enabled, false, 'outro aluno não enxerga');
    __setExamStore(null); r = await call(GET_STATUS, '/api/exams/status', s1); assert.strictEqual(r.json.enabled, false); __setExamStore(store);
    r = await call(GET_STATUS, '/api/exams/status', null); assert.strictEqual(r.status, 401);
  });

  await t('enviar: PDF vai para o bucket privado com caminho sorteado, avisa o profissional e aparece na lista do aluno', async () => {
    world(); bucket.clear();
    const r = await send(s1, { to: 'COACH' }, [{ buf: PDF, name: 'sangue.pdf', type: 'application/pdf' }]); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual([r.json.exam.type, r.json.exam.pages, r.json.exam.isPdf, r.json.exam.toCoach, r.json.exam.toNutri, r.json.exam.status], ['BLOOD', 1, true, true, false, 'NEW']);
    const keys = [...bucket.keys()]; assert.strictEqual(keys.length, 1); assert.ok(/^exams\/s1\/[^/]+\/[0-9a-f-]{36}\.pdf$/.test(keys[0]), keys[0]); assert.ok(!keys[0].includes('sangue'), 'nome original não vai para o caminho');
    const pushes = (globalThis as any).__pushes; assert.deepStrictEqual(pushes.map((p: any) => p.to), ['c1']); assert.ok(/Maria enviou um documento/.test(pushes[0].title) && pushes[0].data.type === 'exam');
    const l = await call(GET_EX, '/api/exams', s1); assert.strictEqual(l.json.exams.length, 1);
  });

  await t('enviar fotos para os dois (personal e nutri): páginas em ordem, os dois são avisados', async () => {
    world(); bucket.clear();
    const r = await send(s1, { to: 'BOTH', type: 'BODY' }, [{ buf: JPG, name: 'a.jpg' }, { buf: PNG, name: 'b.png' }, { buf: JPG, name: 'c.jpg' }]); assert.strictEqual(r.status, 200);
    assert.deepStrictEqual([r.json.exam.pages, r.json.exam.toCoach, r.json.exam.toNutri], [3, true, true]);
    assert.deepStrictEqual(S.examFile.map((f: any) => [f.pageNo, f.mime]), [[1, 'image/jpeg'], [2, 'image/png'], [3, 'image/jpeg']]);
    assert.deepStrictEqual((globalThis as any).__pushes.map((p: any) => p.to).sort(), ['c1', 'n1']);
  });

  await t('enviar: recusa .exe disfarçado, PDF misturado com foto, sem arquivo, sem tipo; sem profissional liberado; limite de 10 por dia; sem armazenamento', async () => {
    world(); bucket.clear();
    assert.strictEqual((await send(s1, {}, [{ buf: EXE, name: 'laudo.pdf', type: 'application/pdf' }])).status, 400);
    assert.strictEqual((await send(s1, {}, [{ buf: PDF, name: 'a.pdf' }, { buf: JPG, name: 'b.jpg' }])).status, 400);
    assert.strictEqual((await send(s1, {}, [])).status, 400); assert.strictEqual((await send(s1, { type: '' }, [{ buf: JPG, name: 'a.jpg' }])).status, 400);
    assert.strictEqual(bucket.size, 0, 'nada recusado chegou ao bucket'); assert.strictEqual(S.examSubmission.length, 0);
    // coach com o recurso desligado
    P.__reset(); world({ c1: false, n1: false }); let r = await send(s1, {}, [{ buf: JPG, name: 'a.jpg' }]); assert.strictEqual(r.status, 403); assert.ok(/ainda não está disponível/.test(r.json.error));
    // só o nutri liberado e o aluno pediu "COACH": ninguém recebe
    feat('n1'); r = await send(s1, { to: 'COACH' }, [{ buf: JPG, name: 'a.jpg' }]); assert.strictEqual(r.status, 403);
    r = await send(s1, { to: 'BOTH' }, [{ buf: JPG, name: 'a.jpg' }]); assert.strictEqual(r.status, 200); assert.deepStrictEqual([r.json.exam.toCoach, r.json.exam.toNutri], [false, true], 'vai só para quem tem o recurso');
    // limite diário
    P.__reset(); world(); for (let i = 0; i < 10; i++) S.examSubmission.push({ id: 'old' + i, userId: 's1', coachId: 'c1', type: 'BLOOD', status: 'NEW', createdAt: new Date() });
    r = await send(s1, {}, [{ buf: JPG, name: 'a.jpg' }]); assert.strictEqual(r.status, 429);
    // outro aluno não envia em nome do s1; sem login; sem armazenamento
    P.__reset(); world(); assert.strictEqual((await send(s2, {}, [{ buf: JPG, name: 'a.jpg' }], 's1')).status, 403);
    assert.strictEqual((await call(POST_EX, '/api/exams', null, { method: 'POST', body: form({ type: 'BLOOD' }, [{ buf: JPG, name: 'a.jpg' }]) })).status, 401);
    __setExamStore(null); assert.strictEqual((await send(s1, {}, [{ buf: JPG, name: 'a.jpg' }])).status, 503); __setExamStore(store);
  });

  await t('falha ao guardar o arquivo: não sobra envio pela metade (nem arquivo órfão)', async () => {
    world(); bucket.clear(); removed.length = 0; let n = 0;
    __setExamStore({ ...store, async put(k, b) { if (++n === 2) throw new Error('R2 fora'); bucket.set(k, b); } });
    const r = await send(s1, {}, [{ buf: JPG, name: 'a.jpg' }, { buf: JPG, name: 'b.jpg' }]); assert.strictEqual(r.status, 502);
    assert.strictEqual(S.examSubmission.length, 0); assert.strictEqual(S.examFile.length, 0); assert.strictEqual(bucket.size, 0, 'a 1ª página foi apagada do bucket'); __setExamStore(store);
  });

  // ───────── a regra de quem vê (o coração do pedido do Paulo) ─────────
  const seed = async (to = 'COACH') => { world(); bucket.clear(); const r = await send(s1, { to }, [{ buf: PDF, name: 'e.pdf' }]); assert.strictEqual(r.status, 200, JSON.stringify(r.json)); (globalThis as any).__pushes = []; return r.json.exam.id as string; };

  await t('CADA COACH VÊ O SEU: só o aluno e o profissional escolhido abrem; master sem vínculo, outro coach, outro aluno e o nutri não escolhido recebem 404 (abrir, lista, arquivo, responder, apagar)', async () => {
    const id = await seed('COACH');
    const d = await call(GET_ONE, `/api/exams/${id}`, c1, {}, idp(id)); assert.strictEqual(d.status, 200); assert.strictEqual(d.json.role, 'PRO');
    const url = d.json.files[0].url; const fid = url.split('/file/')[1].split('?')[0];
    for (const [who, name] of [[paulo, 'master sem vínculo'], [c2, 'outro coach'], [s2, 'outro aluno'], [n1, 'nutri não escolhido']] as const) {
      assert.strictEqual((await call(GET_ONE, `/api/exams/${id}`, who, {}, idp(id))).status, 404, 'abrir: ' + name);
      assert.strictEqual((await call(POST_REPLY, `/api/exams/${id}/reply`, who, { method: 'POST', json: { body: 'oi' } }, idp(id))).status, 404, 'responder: ' + name);
      assert.strictEqual((await call(DEL_ONE, `/api/exams/${id}`, who, { method: 'DELETE' }, idp(id))).status, 404, 'apagar: ' + name);
      // o link assinado de OUTRA pessoa não abre o arquivo para quem não tem acesso (o token carrega quem pediu)
      const stolen = jwt.sign({ f: fid, v: (jwt.decode(who) as any).id, k: 'exam-file' }, SECRET, { expiresIn: 600 });
      assert.strictEqual((await call(GET_FILE, `/api/exams/file/${fid}?t=${stolen}`, null, {}, fp(fid))).status, 404, 'arquivo: ' + name);
      const lst = await call(GET_EX, '/api/exams?userId=s1', who); assert.ok(lst.status === 403 || (lst.status === 200 && lst.json.exams.length === 0), 'lista: ' + name + ' ' + lst.status);
      const inbox = await call(GET_INBOX, '/api/exams/inbox', who); assert.strictEqual(inbox.json.exams.length, 0, 'caixa de entrada: ' + name);
    }
    assert.strictEqual((await call(GET_EX, '/api/exams?userId=s1', c1)).json.exams.length, 1);
    assert.strictEqual((await call(GET_INBOX, '/api/exams/inbox', c1)).json.exams.length, 1);
  });

  await t('master que é o coach do aluno vê (sem passe livre, mas com o vínculo dele); e perde ao aluno trocar de coach', async () => {
    world(); bucket.clear(); S.user.find((u: any) => u.id === 's2').coachId = PAULO_ID;
    const r = await send(s2, { to: 'COACH' }, [{ buf: PDF, name: 'e.pdf' }]);   // s2 ainda não tem profissional com o recurso: o Paulo (master) tem sempre
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); const id = r.json.exam.id;
    assert.strictEqual((await call(GET_ONE, `/api/exams/${id}`, paulo, {}, idp(id))).status, 200, 'o master dono do aluno vê');
    assert.strictEqual((await call(GET_ONE, `/api/exams/${id}`, c2, {}, idp(id))).status, 404, 'o coach parceiro NÃO vê exame de aluno do master');
    S.user.find((u: any) => u.id === 's2').coachId = 'c2'; assert.strictEqual((await call(GET_ONE, `/api/exams/${id}`, paulo, {}, idp(id))).status, 404, 'aluno trocou de coach: o antigo perde');
    assert.strictEqual((await call(GET_ONE, `/api/exams/${id}`, c2, {}, idp(id))).status, 404, 'e o novo coach só vê o que for enviado a ele (não o histórico escolhido para outro)');
  });

  await t('abrir: profissional marca como lido; vem link assinado por arquivo; aluno vê o próprio e a lista dele', async () => {
    const id = await seed('COACH');
    let d = await call(GET_ONE, `/api/exams/${id}`, c1, {}, idp(id)); assert.strictEqual(d.json.exam.status, 'READ'); assert.strictEqual(d.json.exam.viewedByPro, true);
    assert.ok(/^\/api\/exams\/file\/[^?]+\?t=ey/.test(d.json.files[0].url) && d.json.files[0].expiresInSec === 600);
    d = await call(GET_ONE, `/api/exams/${id}`, s1, {}, idp(id)); assert.strictEqual(d.json.role, 'STUDENT'); assert.strictEqual((await call(GET_INBOX, '/api/exams/inbox', c1)).json.newCount, 0, 'lido: sai de "novos"');
  });

  await t('arquivo: o link abre com o tipo certo, sem cache; link vencido/adulterado/de outro arquivo/sem link não abre', async () => {
    const id = await seed('COACH'); const d = await call(GET_ONE, `/api/exams/${id}`, c1, {}, idp(id)); const url = d.json.files[0].url; const fid = url.split('/file/')[1].split('?')[0];
    const ok1 = await GET_FILE(new Request('http://x' + url), fp(fid)); assert.strictEqual(ok1.status, 200); assert.strictEqual(ok1.headers.get('content-type'), 'application/pdf'); assert.ok(/no-store/.test(ok1.headers.get('cache-control') || '')); assert.deepStrictEqual(Buffer.from(await ok1.arrayBuffer()), PDF);
    assert.strictEqual((await GET_FILE(new Request(`http://x/api/exams/file/${fid}`), fp(fid))).status, 401, 'sem link');
    assert.strictEqual((await GET_FILE(new Request(`http://x/api/exams/file/${fid}?t=abc`), fp(fid))).status, 401, 'link inventado');
    const expired = jwt.sign({ f: fid, v: 'c1', k: 'exam-file' }, SECRET, { expiresIn: -10 }); assert.strictEqual((await GET_FILE(new Request(`http://x/api/exams/file/${fid}?t=${expired}`), fp(fid))).status, 401, 'vencido');
    assert.strictEqual((await GET_FILE(new Request('http://x' + url), fp('outro-arquivo'))).status, 401, 'link de outro arquivo');
    const wrongKind = jwt.sign({ f: fid, v: 'c1' }, SECRET, { expiresIn: 600 }); assert.strictEqual((await GET_FILE(new Request(`http://x/api/exams/file/${fid}?t=${wrongKind}`), fp(fid))).status, 401, 'token comum de login não serve de link');
    S.user.find((u: any) => u.id === 's1').coachId = 'c9'; assert.strictEqual((await GET_FILE(new Request('http://x' + url), fp(fid))).status, 404, 'perdeu o vínculo depois de gerar o link: nega');
  });

  await t('responder: só o profissional; aluno é avisado, lê e a resposta fica "lida"; status vira ANSWERED', async () => {
    const id = await seed('BOTH');
    assert.strictEqual((await call(POST_REPLY, `/api/exams/${id}/reply`, s1, { method: 'POST', json: { body: 'obrigado' } }, idp(id))).status, 403, 'aluno não responde');
    assert.strictEqual((await call(POST_REPLY, `/api/exams/${id}/reply`, c1, { method: 'POST', json: { body: '   ' } }, idp(id))).status, 400);
    const r = await call(POST_REPLY, `/api/exams/${id}/reply`, n1, { method: 'POST', json: { body: 'Seu ferro está um pouco baixo. Vamos ajustar a dieta.' } }, idp(id)); assert.strictEqual(r.status, 200);
    assert.strictEqual(S.examSubmission[0].status, 'ANSWERED'); const pushes = (globalThis as any).__pushes; assert.deepStrictEqual(pushes.map((p: any) => p.to), ['s1']); assert.ok(pushes[0].data.type === 'exam_reply');
    assert.strictEqual((await call(GET_STATUS, '/api/exams/status', s1)).json.unreadReplies, 1);
    const l = await call(GET_EX, '/api/exams', s1); assert.deepStrictEqual([l.json.exams[0].replies, l.json.exams[0].unreadReplies], [1, 1]);
    const d = await call(GET_ONE, `/api/exams/${id}`, s1, {}, idp(id)); assert.strictEqual(d.json.replies[0].authorName, 'Pessoa n1'); assert.strictEqual(d.json.replies[0].isNew, true);
    assert.strictEqual((await call(GET_STATUS, '/api/exams/status', s1)).json.unreadReplies, 0, 'depois de abrir, lida');
    assert.strictEqual((await call(GET_INBOX, '/api/exams/inbox', c1)).json.exams.length, 0, 'respondido sai da caixa de entrada');
  });

  await t('apagar: só o aluno; some do bucket, da lista e as respostas junto', async () => {
    const id = await seed('COACH'); await call(POST_REPLY, `/api/exams/${id}/reply`, c1, { method: 'POST', json: { body: 'ok' } }, idp(id)); removed.length = 0;
    assert.strictEqual((await call(DEL_ONE, `/api/exams/${id}`, c1, { method: 'DELETE' }, idp(id))).status, 403, 'profissional não apaga');
    const r = await call(DEL_ONE, `/api/exams/${id}`, s1, { method: 'DELETE' }, idp(id)); assert.strictEqual(r.status, 200);
    assert.strictEqual(S.examSubmission.length + S.examFile.length + S.examReply.length, 0); assert.strictEqual(bucket.size, 0); assert.strictEqual(removed.length, 1);
    assert.strictEqual((await call(GET_ONE, `/api/exams/${id}`, c1, {}, idp(id))).status, 404);
  });

  await t('exclusão de conta: purgeExams apaga arquivos e linhas só daquele aluno', async () => {
    world(); bucket.clear(); await send(s1, {}, [{ buf: JPG, name: 'a.jpg' }, { buf: PNG, name: 'b.png' }]); await send(s2, {}, [{ buf: JPG, name: 'c.jpg' }]);
    assert.strictEqual(bucket.size, 3); const n = await purgeExams(P, 's1', { store }); assert.strictEqual(n, 1);
    assert.strictEqual(bucket.size, 1); assert.ok([...bucket.keys()][0].startsWith('exams/s2/')); assert.deepStrictEqual(S.examSubmission.map((s: any) => s.userId), ['s2']);
  });

  await t('caixa de entrada do profissional: só os novos/lidos dos alunos que ainda são dele, com nome do aluno', async () => {
    world(); bucket.clear(); await send(s1, { to: 'COACH' }, [{ buf: PDF, name: 'a.pdf' }]); await send(s1, { to: 'NUTRI', type: 'BODY' }, [{ buf: JPG, name: 'b.jpg' }]); await send(s2, { to: 'COACH' }, [{ buf: PDF, name: 'c.pdf' }]);
    let r = await call(GET_INBOX, '/api/exams/inbox', c1); assert.deepStrictEqual([r.json.exams.length, r.json.newCount, r.json.exams[0].studentName], [1, 1, 'Maria Souza']);
    r = await call(GET_INBOX, '/api/exams/inbox', n1); assert.strictEqual(r.json.exams.length, 1); assert.strictEqual(r.json.exams[0].type, 'BODY');
    r = await call(GET_INBOX, '/api/exams/inbox', c2); assert.strictEqual(r.json.exams.length, 1); r = await call(GET_INBOX, '/api/exams/inbox', paulo); assert.strictEqual(r.json.exams.length, 0, 'master sem alunos com exame: vazio');
    S.user.find((u: any) => u.id === 's1').coachId = 'c9'; r = await call(GET_INBOX, '/api/exams/inbox', c1); assert.strictEqual(r.json.exams.length, 0, 'aluno saiu: some da caixa');
  });

  await t('antes do `prisma db push` (tabelas não existem): lista vazia e envio responde 503 claro, sem derrubar', async () => {
    world(); P.__state.failOn.examSubmission = { message: 'The table `public.ExamSubmission` does not exist in the current database.' };
    assert.strictEqual((await call(GET_EX, '/api/exams', s1)).json.unavailable, true); assert.strictEqual((await call(GET_INBOX, '/api/exams/inbox', c1)).json.unavailable, true);
    const r = await send(s1, {}, [{ buf: JPG, name: 'a.jpg' }]); assert.strictEqual(r.status, 503); assert.strictEqual(r.json.unavailable, true);
  });

  __setExamStore(undefined);
  console.log(`\n${ok} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
