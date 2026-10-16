import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as W from '/home/user/fitos-final/lib/weeklyFeedback';
import * as P from '/home/user/fitos-final/lib/weeklyReplyParse';
import * as WA from '/home/user/fitos-final/lib/weeklyWhatsApp';
import { POST as parsePOST } from '/home/user/fitos-final/app/api/admin/weekly-feedback/import/parse/route';
import { POST as importPOST } from '/home/user/fitos-final/app/api/admin/weekly-feedback/import/route';
import { POST as waPOST } from '/home/user/fitos-final/app/api/admin/weekly-feedback/whatsapp/route';
import { GET as boardGET } from '/home/user/fitos-final/app/api/admin/weekly-feedback/route';
import { GET as userGET } from '/home/user/fitos-final/app/api/user/weekly-feedback/route';
const db = (prisma as any).__db;
const RealDate = Date;
const freeze = (iso: string) => { class FD extends RealDate { constructor(...a: any[]) { if (a.length === 0) super(iso); else super(...(a as [any])); } static now() { return new RealDate(iso).getTime(); } } (globalThis as any).Date = FD; };
const unfreeze = () => { (globalThis as any).Date = RealDate; };
const tok = (id: string, role = 'ALUNO') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const call = async (fn: any, url: string, as: string, role = 'ALUNO', body?: any) => { const r = await fn(new Request('http://x' + url, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + tok(as, role), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })); return { status: r.status, json: await r.json() }; };
const quiet = async (fn: () => Promise<any>) => { const w = console.warn, e = console.error; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; } };
const sent: any[] = []; (globalThis as any).fetch = async (url: string, init: any) => { sent.push(JSON.parse(init.body)); return { json: async () => ({ data: { status: 'ok' } }) }; };

const QS: W.Question[] = [
  { id: 'trained', kind: 'choice', label: 'Treinos?', options: [{ value: 'ALL', label: 'Cumpri tudo' }, { value: 'MOST', label: 'Quase tudo' }, { value: 'PART', label: 'Cumpri parte' }] },
  { id: 'difficulty', kind: 'choice', label: 'Dificuldade?', options: [{ value: 'NO', label: 'Não' }, { value: 'YES', label: 'Sim' }], textWhen: { values: ['YES'], label: 'Qual?', required: true } },
  { id: 'protocol', kind: 'text', optional: true, label: 'Ajustar algo?' },
  { id: 'note', kind: 'text', label: 'Comentário?' },
  { id: 'effort', kind: 'scale', min: 0, max: 10, label: 'Dedicação?' },
];
const SRC = '1) Quase tudo\n2) Sim, ombro estalando no desenvolvimento\n3) queria trocar o supino\n4) tudo certo por aqui\n5) 9';

(async () => {
  // ═════ A. conferência do que a IA devolveu ═════
  const clean = (raw: any, src = SRC) => P.sanitizeParsed(raw, QS, src);
  let r = clean({ answers: [
    { id: 'trained', value: 'MOST', text: '', confidence: 'high' },
    { id: 'difficulty', value: 'YES', text: 'ombro estalando no desenvolvimento', confidence: 'high' },
    { id: 'protocol', value: 'queria trocar o supino', text: '', confidence: 'high' },
    { id: 'note', value: 'tudo certo por aqui', text: '', confidence: 'low' },
    { id: 'effort', value: '9', text: '', confidence: 'high' },
  ] });
  assert.deepEqual(r.answers, { trained: 'MOST', difficulty: 'YES', difficulty_text: 'ombro estalando no desenvolvimento', protocol: 'queria trocar o supino', note: 'tudo certo por aqui', effort: 9 });
  assert.deepEqual(r.status, { trained: 'FILLED', difficulty: 'FILLED', protocol: 'FILLED', note: 'UNCERTAIN', effort: 'FILLED' }, 'dúvida da IA (low) vira "confira"');
  r = clean({ answers: [{ id: 'trained', value: 'Quase tudo', text: '', confidence: 'high' }, { id: 'effort', value: '8,5', text: '', confidence: 'high' }, { id: 'inventada', value: 'x', text: '', confidence: 'high' }] });
  assert.equal(r.answers.trained, 'MOST', 'aceita o texto da opção (tolerância)'); assert.equal(r.answers.effort, 9); assert.equal(r.status.effort, 'UNCERTAIN', 'nota quebrada foi arredondada: confira'); assert.ok(!('inventada' in r.answers));
  r = clean({ answers: [{ id: 'trained', value: 'TUDO', text: '', confidence: 'high' }, { id: 'effort', value: '11', text: '', confidence: 'high' }, { id: 'protocol', value: '', text: '', confidence: 'high' }] }); assert.deepEqual(r.answers, {}, 'opção que não existe, nota fora da escala e vazio são descartados'); assert.equal(r.status.trained, 'MISSING'); assert.equal(r.status.effort, 'MISSING');
  assert.equal(clean({ answers: [{ id: 'effort', value: 'dez', text: '', confidence: 'high' }] }).status.effort, 'MISSING'); assert.equal(clean({ answers: [{ id: 'effort', value: '-1', text: '', confidence: 'high' }] }).status.effort, 'MISSING');
  assert.equal(clean({ answers: [{ id: 'effort', value: '0', text: '', confidence: 'high' }] }).answers.effort, 0, '0 é resposta válida');
  r = clean({ answers: [{ id: 'trained', value: 'ALL', text: '', confidence: 'high' }, { id: 'trained', value: 'PART', text: '', confidence: 'high' }] }); assert.equal(r.answers.trained, 'ALL', 'a primeira vale');
  // texto precisa vir do aluno
  r = clean({ answers: [{ id: 'difficulty', value: 'YES', text: 'tendinite grave no cotovelo esquerdo', confidence: 'high' }, { id: 'protocol', value: 'trocar o agachamento por leg press', text: '', confidence: 'high' }] });
  assert.equal(r.status.difficulty, 'UNCERTAIN', 'complemento que não está na mensagem: confira'); assert.equal(r.status.protocol, 'UNCERTAIN', 'texto que não está na mensagem: confira');
  r = clean({ answers: [{ id: 'trained', value: 'ALL', text: 'complemento que não cabe aqui', confidence: 'high' }] }); assert.ok(!('trained_text' in r.answers), 'complemento só onde a pergunta o aceita');
  r = clean({ answers: [{ id: 'note', value: 'x'.repeat(900), text: '', confidence: 'high' }] }, 'x'.repeat(900)); assert.equal((r.answers.note as string).length, 600);
  assert.deepEqual(P.sanitizeParsed(null, QS, SRC).status, P.emptyParsed(QS).status); assert.deepEqual(P.sanitizeParsed({ answers: 'lixo' }, QS, SRC).answers, {});
  assert.deepEqual(P.requiredMissing(QS, clean({ answers: [{ id: 'trained', value: 'ALL', text: '', confidence: 'high' }] })), ['difficulty', 'note', 'effort'], 'texto opcional (protocolo) não conta como faltando');
  assert.equal(P.cleanSource('a\r\nb\u0000c\n\n\n\nd   e'), 'a\nb c\n\nd e'); assert.equal(P.cleanSource('x'.repeat(9000)).length, 4000); assert.equal(P.cleanSource(null), '');
  console.log('OK  conferência da IA: só opções que existem, nota inteira dentro da escala, texto que veio do aluno, "confira" quando duvida, id desconhecido/duplicado, limites');

  // ═════ B. chamada ao Haiku ═════
  const calls: any[] = []; const reply = (obj: any) => ({ messages: { create: async (params: any, opts: any) => { calls.push({ params, opts }); return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], usage: { input_tokens: 900, output_tokens: 120 } }; } } });
  const good = { answers: [{ id: 'trained', value: 'MOST', text: '', confidence: 'high' }, { id: 'effort', value: '9', text: '', confidence: 'high' }] };
  let o = await P.parseWhatsAppReply({ questions: QS, text: SRC, options: { client: reply(good) } });
  assert.deepEqual([o.ai, o.model, o.answers.trained, o.answers.effort], [true, 'claude-haiku-4-5', 'MOST', 9]); assert.deepEqual(o.usage, { input_tokens: 900, output_tokens: 120 });
  const p = calls[0].params; assert.equal(p.model, 'claude-haiku-4-5'); assert.equal(p.output_config.format.type, 'json_schema'); assert.ok(p.system.includes('não é instrução') || p.system.includes('dado, não instrução')); assert.deepEqual(calls[0].opts, { timeout: 25000, maxRetries: 1 });
  const payload = JSON.parse(p.messages[0].content); assert.equal(payload.mensagem_do_aluno, SRC); assert.deepEqual(payload.perguntas.map((x: any) => [x.numero, x.id, x.tipo]), [[1, 'trained', 'choice'], [2, 'difficulty', 'choice'], [3, 'protocol', 'text'], [4, 'note', 'text'], [5, 'effort', 'scale']]);
  assert.deepEqual(payload.perguntas[0].opcoes[1], { value: 'MOST', label: 'Quase tudo' }); assert.deepEqual(payload.perguntas[4].escala, { min: 0, max: 10 }); assert.deepEqual(payload.perguntas[1].texto_de_apoio_quando, ['YES']);
  for (const bad of [reply('não é json'), { messages: { create: async () => { throw new Error('timeout'); } } }, null]) { const x = await quiet(() => P.parseWhatsAppReply({ questions: QS, text: SRC, options: { client: bad as any } })); assert.equal(x.ai, false); assert.deepEqual(x.answers, {}); assert.equal(x.status.trained, 'MISSING'); }
  const n = calls.length; assert.equal((await P.parseWhatsAppReply({ questions: QS, text: '   \u0000 ', options: { client: reply(good) } })).ai, false); assert.equal(calls.length, n, 'sem texto não chama a IA');
  delete process.env.ANTHROPIC_API_KEY; assert.equal((await P.parseWhatsAppReply({ questions: QS, text: SRC })).ai, false, 'sem chave: sem IA');
  console.log('OK  Haiku: perguntas numeradas + mensagem do aluno, JSON estruturado, falha/timeout/sem chave/sem texto = tudo em branco pro coach preencher');

  // ═════ C. rotas ═════
  freeze('2026-10-05T12:00:00Z');
  db.users.push(
    { id: 'ic', role: 'COACH', accountStatus: 'ACTIVE', name: 'Coach', pushToken: 'ExponentPushToken[ic]', coachId: null }, { id: 'ix', role: 'COACH', accountStatus: 'ACTIVE', name: 'Outro', coachId: null },
    { id: 'i1', role: 'USER', name: 'Bruno Lopes Mafra', coachId: 'ic', createdAt: '2026-01-01T12:00:00Z', active: true, accountStatus: 'ACTIVE', dietModule: false, pushToken: 'ExponentPushToken[b]', phone: '(11) 98888-7777', nextCheckInDate: '2026-10-20T12:00:00Z', disableCheckIn: false },
    { id: 'i2', role: 'USER', name: 'Novo', coachId: 'ic', createdAt: '2026-10-05T10:00:00Z', active: true, accountStatus: 'ACTIVE', dietModule: false },
  );
  db.checkins.push({ userId: 'i1', date: '2026-09-20T12:00:00Z' });
  const PARSE = '/api/admin/weekly-feedback/import/parse', SAVE = '/api/admin/weekly-feedback/import';
  assert.equal((await call(parsePOST, PARSE, 'ic', 'COACH', {})).status, 400); assert.equal((await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i1' })).status, 400, 'sem texto'); assert.equal((await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i1', text: 'ok' })).status, 400, 'curto demais');
  assert.equal((await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i1', text: 'x'.repeat(9000) })).status, 400, 'grande demais'); assert.equal((await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'nao', text: SRC })).status, 404);
  assert.equal((await call(parsePOST, PARSE, 'i1', 'ALUNO', { studentId: 'i1', text: SRC })).status, 403, 'aluno não cola a própria'); assert.equal((await call(parsePOST, PARSE, 'ix', 'COACH', { studentId: 'i1', text: SRC })).status, 403, 'só o coach do aluno');
  assert.equal((await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i2', text: SRC })).status, 400, 'aluno novo: sem feedback pendente');
  // sem IA: formulário em branco + o que falta
  let pr = await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i1', text: SRC }); assert.equal(pr.status, 200, JSON.stringify(pr.json)); assert.equal(pr.json.ai, false); assert.deepEqual(pr.json.answers, {}); assert.deepEqual(pr.json.questions.map((q: any) => q.id), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'effort']); assert.equal(pr.json.weekStart, '2026-09-28'); assert.deepEqual(pr.json.requiredMissing, ['trained', 'performance', 'difficulty', 'energy', 'effort']);
  assert.equal(db.weekly.length, 0, 'interpretar não grava nada');
  // com IA
  process.env.ANTHROPIC_API_KEY = 'k'; let parseCalls = 0;
  (globalThis as any).__LLM = async ({ args }: any) => {
    if (String(args.system).includes('transcrever')) { parseCalls++; return { content: [{ type: 'text', text: JSON.stringify({ answers: [
      { id: 'trained', value: 'MOST', text: '', confidence: 'high' }, { id: 'performance', value: 'BETTER', text: '', confidence: 'high' }, { id: 'difficulty', value: 'YES', text: 'ombro estalando no desenvolvimento', confidence: 'high' },
      { id: 'energy', value: 'GOOD', text: '', confidence: 'low' }, { id: 'protocol', value: 'queria trocar o supino', text: '', confidence: 'high' }, { id: 'effort', value: '9', text: '', confidence: 'high' }] }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ intro: '', rewrites: [], follow_ups: [] }) }] };
  };
  const SRC2 = '1) Quase tudo\n2) Evoluí\n3) Sim, ombro estalando no desenvolvimento\n4) Boa\n5) queria trocar o supino\n6) 9';
  pr = await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i1', text: SRC2 }); assert.equal(pr.status, 200, JSON.stringify(pr.json)); assert.equal(pr.json.ai, true); assert.equal(parseCalls, 1);
  assert.deepEqual(pr.json.answers, { trained: 'MOST', performance: 'BETTER', difficulty: 'YES', difficulty_text: 'ombro estalando no desenvolvimento', energy: 'GOOD', protocol: 'queria trocar o supino', effort: 9 }); assert.equal(pr.json.status.energy, 'UNCERTAIN'); assert.equal(pr.json.status.trained, 'FILLED'); assert.deepEqual(pr.json.requiredMissing, []);
  assert.ok(db.aiLogs.some((a: any) => a.question === 'weekly-whatsapp-parse:2026-09-28' && a.userId === 'i1'), 'chamada registrada no AiLog'); assert.ok(!db.aiLogs.some((a: any) => String(a.answer).includes('ombro')), 'o texto do aluno não vai pro log');
  assert.equal(db.weekly.length, 0); delete process.env.ANTHROPIC_API_KEY;
  console.log('OK  interpretar: só o coach do aluno, valida o texto, sem IA devolve o formulário em branco, com IA preenche (dúvida marcada), não grava nada');

  // ═════ D. salvar a resposta conferida ═════
  const answers = pr.json.answers; const set = db.wq.find((x: any) => x.userId === 'i1');
  assert.equal((await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1' })).status, 400); assert.equal((await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1', weekStart: '2026-09-21', answers })).status, 400, 'semana já fechada');
  assert.equal((await call(importPOST, SAVE, 'i1', 'ALUNO', { studentId: 'i1', weekStart: '2026-09-28', answers })).status, 403); assert.equal((await call(importPOST, SAVE, 'ix', 'COACH', { studentId: 'i1', weekStart: '2026-09-28', answers })).status, 403); assert.equal((await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i2', weekStart: '2026-09-28', answers })).status, 400);
  let sv = await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1', weekStart: '2026-09-28', answers: { ...answers, effort: undefined } }); assert.equal(sv.status, 400); assert.equal(sv.json.field, 'effort', 'falta uma obrigatória: o app destaca');
  sv = await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1', weekStart: '2026-09-28', answers: { ...answers, difficulty_text: undefined } }); assert.equal(sv.json.field, 'difficulty_text');
  assert.equal(db.weekly.length, 0);
  sent.length = 0; sv = await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1', weekStart: '2026-09-28', answers, sourceText: SRC2 }); assert.equal(sv.status, 200, JSON.stringify(sv.json));
  assert.equal(db.weekly.length, 1); const row = db.weekly[0]; assert.deepEqual([row.userId, row.coachId, row.weekStart, row.channel, row.score], ['i1', 'ic', '2026-09-28', 'WHATSAPP', 9]); assert.equal(row.sourceText, SRC2); assert.ok(row.coachSeenAt, 'o coach acabou de ler: já entra como visto');
  assert.deepEqual(row.flags, ['PAIN', 'ADJUST'], 'dor (difficulty=Sim) + pediu ajuste, igual a uma resposta no app'); assert.equal(row.questions.length, 6); assert.equal(row.answers.difficulty_text, 'ombro estalando no desenvolvimento'); assert.ok(row.facts && row.facts.v === 1, 'fatos da semana junto');
  assert.equal(sent.length, 0, 'não avisa o coach de algo que ele mesmo acabou de fazer');
  assert.equal((await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1', weekStart: '2026-09-28', answers })).status, 409, 'já respondeu'); assert.equal((await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i1', text: SRC2 })).status, 409);
  db.weekly.length = 0; db.nextCreateP2002 = true; sv = await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1', weekStart: '2026-09-28', answers }); assert.equal(sv.status, 409); assert.ok(sv.json.error.includes('pelo app'), 'o aluno respondeu enquanto o coach conferia'); assert.equal(db.weekly.length, 1, 'vale a resposta que chegou primeiro (não sobrescreve)'); assert.deepEqual(db.weekly[0].answers, { effort: 1 });
  db.weekly.length = 0; await call(importPOST, SAVE, 'ic', 'COACH', { studentId: 'i1', weekStart: '2026-09-28', answers, sourceText: SRC2 });
  // painel e card do aluno
  const b = await call(boardGET, '/api/admin/weekly-feedback?adminId=ic', 'ic', 'COACH'); const br = b.json.rows.find((x: any) => x.studentId === 'i1');
  assert.deepEqual([br.answered, br.channel, br.sourceText, br.awaitingReply, br.score], [true, 'WHATSAPP', SRC2, false, 9]); assert.deepEqual(br.view.map((x: any) => x.id), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'effort']);
  db.weekly.push({ id: 'wf-app', userId: 'zz', coachId: 'ic', weekStart: '2026-09-28', createdAt: '2026-10-05T11:00:00.000Z', coachSeenAt: null, flags: [], score: 8, answers: { effort: 8 }, questions: [] }); db.users.push({ id: 'zz', role: 'USER', name: 'Zé', coachId: 'ic', createdAt: '2026-01-01T12:00:00Z', active: true, accountStatus: 'ACTIVE' });
  const b2 = await call(boardGET, '/api/admin/weekly-feedback?adminId=ic', 'ic', 'COACH'); const zr = b2.json.rows.find((x: any) => x.studentId === 'zz'); assert.deepEqual([zr.channel, zr.sourceText], ['APP', null], 'resposta do app: canal APP e sem texto original');
  const ug = await call(userGET, '/api/user/weekly-feedback?userId=i1', 'i1'); assert.deepEqual([ug.json.answered, ug.json.due], [true, false], 'o card some pro aluno');
  assert.equal((await call(waPOST, '/x', 'ic', 'COACH', { studentId: 'i1' })).status, 409, 'e o reforço pelo WhatsApp não é mais oferecido');
  console.log('OK  salvar: valida contra as perguntas do aluno, mostra o que falta, grava canal WHATSAPP + mensagem original + fatos, já como vista e sem push; corrida com o app; painel e card do aluno');

  // ═════ E. link do app na mensagem do WhatsApp + limite de uso ═════
  const msg = WA.buildWhatsAppText({ name: 'Bruno', weekLabel: '28/09 a 04/10', questions: QS.slice(0, 1) });
  assert.ok(msg.includes('Se preferir, responde direto no app') && msg.includes('https://fit-os-frontend.onrender.com/app/inicio'), 'link do app'); assert.ok(msg.indexOf('Pode responder com o número') < msg.indexOf('https://fit-os-frontend') && msg.indexOf('https://fit-os-frontend') < msg.indexOf('registrar suas cargas'));
  db.weekly.length = 0; let last = 0; for (let i = 0; i < 45; i++) { const x = await call(parsePOST, PARSE, 'ic', 'COACH', { studentId: 'i1', text: SRC2 }); last = x.status; if (x.status === 429) break; } assert.equal(last, 429, 'limite de interpretações por hora');
  unfreeze();
  console.log('OK  mensagem do WhatsApp leva o link do app; limite por hora\n\nTODOS OS TESTES DE "COLAR RESPOSTA DO WHATSAPP" (BACKEND) PASSARAM');
})().catch((e) => { unfreeze(); console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
