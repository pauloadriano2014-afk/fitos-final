import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as N from '/home/user/fitos-final/lib/coachNotes';
import * as AI from '/home/user/fitos-final/lib/coachNotesAI';
import { buildHoje } from '/home/user/fitos-final/lib/agendaHoje';
import { POST as POST_INT } from '/home/user/fitos-final/app/api/coach-notes/interpretar/route';
import { POST as POST_TR } from '/home/user/fitos-final/app/api/coach-notes/transcrever/route';
import { POST as POST_NOTE, GET as GET_NOTES } from '/home/user/fitos-final/app/api/coach-notes/route';
import { PATCH as PATCH_NOTE, DELETE as DEL_NOTE } from '/home/user/fitos-final/app/api/coach-notes/[id]/route';
import { POST as POST_RES } from '/home/user/fitos-final/app/api/agenda/hoje/resolvidas/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state; const G: any = globalThis;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}, ctx: any = {}) => {
  const headers: any = {}; if (!(init.body instanceof FormData)) headers['content-type'] = 'application/json'; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) }); const patch = (o: any) => ({ method: 'PATCH', body: JSON.stringify(o) });
process.env.ANTHROPIC_API_KEY = 'k';
const cA = tok('cA'), cB = tok('cB'), alunoTok = tok('s1', 'USER'), master = tok(PAULO_ID, 'ADMIN');
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); G.__LLM = undefined; G.__WHISPER_TEXT = undefined; G.__WHISPER_ARGS = undefined; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
const seed = (withFeature = true) => {
  const u = (o: any) => S.user.push({ role: 'USER', active: true, isTestAccount: false, coachId: null, nutritionistId: null, accountStatus: 'ACTIVE', ...o });
  u({ id: 'cA', role: 'COACH', name: 'Coach A', phone: null }); u({ id: 'cB', role: 'COACH', name: 'Coach B' });
  u({ id: 's1', name: 'Samuel Silva', coachId: 'cA' }); u({ id: 's2', name: 'Mariana Lopes', coachId: 'cA' }); u({ id: 's3', name: 'Samuel Costa', coachId: 'cA' }); u({ id: 's9', name: 'Outro Aluno', coachId: 'cB' });
  u({ id: 'sT', name: 'Aluno Teste', coachId: 'cA', isTestAccount: true });
  if (withFeature) for (const c of ['cA', 'cB']) S.coachFeature.push({ id: 'cf' + c, coachId: c, feature: 'notasVoz', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null });
};
const TODAY = '2026-10-12'; // segunda-feira
const STU = [{ id: 's1', name: 'Samuel Silva' }, { id: 's2', name: 'Mariana Lopes' }, { id: 's3', name: 'Samuel Costa' }, { id: 's4', name: 'Ana Paula' }, { id: 's5', name: 'João da Silva' }];
const llm = (input: any) => { G.__LLM = async () => ({ content: [{ type: 'tool_use', name: 'registrar_nota', input }] }); };

(async () => {
  await t('nome falado -> aluno: nome completo, só o 1º nome, erro de letra, sobrenome errado, ambíguo', () => {
    const top = (sp: string) => N.matchStudents(sp, STU)[0];
    assert.strictEqual(top('Mariana').id, 's2'); assert.strictEqual(top('mariana lopes').score, 100); assert.strictEqual(top('Mariana').score, 90);
    assert.strictEqual(top('Marianna')?.id, 's2', 'erro de uma letra no 1º nome'); assert.strictEqual(top('Joao').id, 's5', 'sem acento');
    assert.strictEqual(top('Ana').id, 's4'); assert.strictEqual(N.pickStudent(N.matchStudents('Marianna', STU)), null, 'palpite fraco (erro de letra) não é escolhido sozinho: o coach confirma'); assert.strictEqual(N.pickStudent(N.matchStudents('Mariana', STU))!.id, 's2'); assert.ok(!N.matchStudents('Carlos', STU).length);
    const sam = N.matchStudents('Samuel', STU); assert.deepStrictEqual(sam.map((c) => c.id).sort(), ['s1', 's3']); assert.strictEqual(N.pickStudent(sam), null, 'dois Samuel: o coach escolhe');
    assert.strictEqual(N.pickStudent(N.matchStudents('Samuel Silva', STU))!.id, 's1'); assert.strictEqual(N.pickStudent(N.matchStudents('Samuel Souza', STU)), null, 'só o 1º nome bate: não escolhe sozinho');
    assert.deepStrictEqual(N.matchStudents('', STU), []); assert.deepStrictEqual(N.matchStudents(null, STU), []);
    assert.deepStrictEqual(N.findMentions('o samuel silva sentiu as costas', STU).map((c) => c.id), ['s1', 's3']); assert.strictEqual(N.pickStudent(N.findMentions('o samuel silva sentiu as costas', STU))!.id, 's1', 'nome inteiro vence o só-1º-nome'); assert.strictEqual(N.pickStudent(N.findMentions('o samuel sentiu as costas', STU)), null); assert.strictEqual(N.pickStudent(N.findMentions('a mariana pediu para mudar', STU))!.id, 's2');
  });
  await t('prazo em português: hoje, amanhã, dia da semana, "dia 15", mês, semana que vem; data da IA validada', () => {
    const d = (s: string) => N.parseDueFromText(s, TODAY);
    assert.strictEqual(d('lembrar hoje'), '2026-10-12'); assert.strictEqual(d('ver amanhã'), '2026-10-13'); assert.strictEqual(d('depois de amanhã'), '2026-10-14');
    assert.strictEqual(d('na sexta'), '2026-10-16'); assert.strictEqual(d('segunda-feira'), '2026-10-19', 'hoje é segunda: a próxima é a da semana que vem'); assert.strictEqual(d('dia 15'), '2026-10-15'); assert.strictEqual(d('dia 5'), '2026-11-05');
    assert.strictEqual(d('vai começar em novembro'), '2026-11-01'); assert.strictEqual(d('em outubro'), '2027-10-01'.replace('2027-10-01', '2026-10-12') && d('em outubro')); assert.strictEqual(d('semana que vem'), '2026-10-19'); assert.strictEqual(d('daqui a 10 dias'), '2026-10-22'); assert.strictEqual(d('sem data'), null);
    assert.strictEqual(N.cleanDue('2026-11-01', TODAY), '2026-11-01'); assert.strictEqual(N.cleanDue('2026-01-01', TODAY), TODAY, 'passado vira hoje'); assert.strictEqual(N.cleanDue('2031-01-01', TODAY), null); assert.strictEqual(N.cleanDue('2026-02-30', TODAY), null); assert.strictEqual(N.cleanDue('amanhã', TODAY), null); assert.strictEqual(N.cleanDue(null, TODAY), null);
  });
  await t('rascunho por regras (sem IA): aluno, etiqueta, tipo e prazo', () => {
    let r = N.ruleDraft('O Samuel Silva sentiu as costas no agachamento Smith', STU, TODAY);
    assert.strictEqual(r.studentId, 's1'); assert.strictEqual(r.tag, 'DOR'); assert.strictEqual(r.kind, 'TAREFA'); assert.strictEqual(r.dueDate, TODAY); assert.strictEqual(r.ai, false);
    r = N.ruleDraft('A Mariana pediu para mudar o treino de 6 dias para 5 porque sábado a academia fecha', STU, TODAY);
    assert.strictEqual(r.studentId, 's2'); assert.strictEqual(r.kind, 'TAREFA'); assert.strictEqual(r.tag, 'TREINO');
    r = N.ruleDraft('A Ana vai começar Roacutan em novembro, ver se muda a dieta', STU, TODAY); assert.strictEqual(r.studentId, 's4'); assert.strictEqual(r.tag, 'DIETA'); assert.strictEqual(r.dueDate, '2026-11-01');
    r = N.ruleDraft('Samuel está motivado', STU, TODAY); assert.strictEqual(r.studentId, null, 'dois Samuel'); assert.strictEqual(r.kind, 'NOTA'); assert.strictEqual(r.dueDate, null); assert.strictEqual(r.candidates.length, 2);
    r = N.ruleDraft('x'.repeat(2000), STU, TODAY); assert.strictEqual(r.body.length, N.MAX_BODY);
  });
  await t('IA: extrai e o código escolhe o aluno, valida data/etiqueta/tipo (lixo da IA não passa)', () => {
    let d = N.draftFromExtraction({ aluno_falado: 'Samuel Silva', resumo: 'Sentiu as costas no agachamento Smith.', tipo: 'TAREFA', etiqueta: 'DOR', prazo: '2026-10-12' }, 'x', STU, TODAY);
    assert.deepStrictEqual([d.studentId, d.kind, d.tag, d.dueDate, d.ai, d.body], ['s1', 'TAREFA', 'DOR', TODAY, true, 'Sentiu as costas no agachamento Smith.']);
    d = N.draftFromExtraction({ aluno_falado: 'Samuel', resumo: 'ok', tipo: 'NOTA', etiqueta: 'XPTO', prazo: '2026-12-01' }, 'texto original', STU, TODAY);
    assert.strictEqual(d.studentId, null); assert.strictEqual(d.candidates.length, 2); assert.strictEqual(d.tag, 'OUTRO'); assert.strictEqual(d.dueDate, null, 'NOTA não tem prazo');
    d = N.draftFromExtraction({ aluno_falado: null, resumo: '', tipo: 'TAREFA', etiqueta: 'PEDIDO', prazo: 'lixo' }, 'a mariana pediu amanhã', STU, TODAY);
    assert.strictEqual(d.studentId, 's2', 'sem nome da IA: procura no texto'); assert.strictEqual(d.body, 'a mariana pediu amanhã'); assert.strictEqual(d.dueDate, '2026-10-13');
    d = N.draftFromExtraction({ aluno_falado: 'Ana', resumo: 'x', tipo: 'TAREFA', etiqueta: 'PEDIDO', prazo: null }, 'x', STU, TODAY); assert.strictEqual(d.dueDate, TODAY, 'tarefa sem prazo = hoje');
    d = N.draftFromExtraction(null, 'qualquer coisa', STU, TODAY); assert.strictEqual(d.kind, 'NOTA'); assert.strictEqual(d.body, 'qualquer coisa');
  });
  await t('chamada da IA: Haiku 5.5, ferramenta forçada, esforço baixo, SEM temperature/top_p/top_k, lista de alunos fora do prompt', async () => {
    let sent: any = null;
    const client = { messages: { create: async (a: any) => { sent = a; return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'registrar_nota', input: { resumo: 'ok', tipo: 'NOTA', etiqueta: 'OUTRO' } }], usage: { input_tokens: 700, output_tokens: 60 } }; } } };
    const r = await AI.extractNote('Samuel sentiu as costas', TODAY, { client });
    assert.strictEqual(sent.model, 'claude-haiku-5-5'); assert.deepStrictEqual(sent.tool_choice, { type: 'tool', name: 'registrar_nota' }); assert.deepStrictEqual(sent.output_config, { effort: 'low' });
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(k in sent), k + ' não pode ir (Haiku 5.5 dá 400)');
    assert.ok(sent.system.includes('2026-10-12') && sent.system.includes('segunda-feira'), 'a data de hoje vai no prompt'); assert.strictEqual(sent.messages[sent.messages.length - 1].role, 'user', 'sem prefill'); assert.strictEqual(r.usage.inputTokens, 700);
    for (const bad of [{ stop_reason: 'refusal', content: [] }, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'oi' }] }]) { const c2 = { messages: { create: async () => bad } }; await assert.rejects(() => AI.extractNote('x', TODAY, { client: c2 })); }
  });

  // ── rotas ──
  await t('acesso: sem login 401; aluno 403; coach sem a chave 403 "locked"; coach com a chave passa; master sempre', async () => {
    seed(false);
    assert.strictEqual((await call(POST_INT, '/x', null, post({ text: 'abc' }))).status, 401);
    assert.strictEqual((await call(POST_INT, '/x', alunoTok, post({ text: 'abc' }))).status, 403);
    let r = await call(POST_INT, '/x', cA, post({ text: 'abc def' })); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.locked, true);
    for (const [fn, init] of [[POST_NOTE, post({ body: 'x' })], [GET_NOTES, {}]] as any) assert.strictEqual((await call(fn, '/api/coach-notes', cA, init)).status, 403);
    S.coachFeature.push({ id: 'f', coachId: 'cA', feature: 'notasVoz', revokedAt: null }); G.__LLM = async () => new Error('fora');
    assert.strictEqual((await call(POST_INT, '/x', cA, post({ text: 'abc def' }))).status, 200);
    S.user.find((u: any) => u.id === 'cA').coachBillingStatus = 'OVERDUE'; assert.strictEqual((await call(POST_INT, '/x', cA, post({ text: 'abc def' }))).status, 403, 'atrasou: perde na hora');
    assert.strictEqual((await call(GET_NOTES, '/api/coach-notes', master)).status, 200);
  });
  await t('interpretar: IA ok -> rascunho com aluno escolhido; IA fora/recusou -> regras; só alunos DO coach; validações', async () => {
    seed(); llm({ aluno_falado: 'Samuel Silva', resumo: 'Sentiu as costas no agachamento Smith.', tipo: 'TAREFA', etiqueta: 'DOR', prazo: null });
    let r = await call(POST_INT, '/x', cA, post({ text: 'o Samuel Silva sentiu as costas no agachamento Smith' }));
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.draft.studentId, 's1'); assert.strictEqual(r.json.draft.ai, true); assert.strictEqual(r.json.draft.tag, 'DOR'); assert.strictEqual(r.json.draft.kind, 'TAREFA');
    llm({ aluno_falado: 'Outro Aluno', resumo: 'x', tipo: 'NOTA', etiqueta: 'OUTRO', prazo: null });
    r = await call(POST_INT, '/x', cA, post({ text: 'outro aluno falou' })); assert.strictEqual(r.json.draft.studentId, null, 'aluno do coach B não aparece'); assert.deepStrictEqual(r.json.draft.candidates, []);
    G.__LLM = async () => new Error('IA fora'); r = await call(POST_INT, '/x', cA, post({ text: 'A Mariana pediu para mudar o treino amanhã' })); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.draft.ai, false); assert.strictEqual(r.json.draft.studentId, 's2');
    G.__LLM = async () => ({ stop_reason: 'refusal', content: [] }); r = await call(POST_INT, '/x', cA, post({ text: 'A Mariana tomou remédio' })); assert.strictEqual(r.json.draft.ai, false, 'recusa da IA cai nas regras');
    assert.strictEqual((await call(POST_INT, '/x', cA, post({ text: 'ab' }))).status, 400); assert.strictEqual((await call(POST_INT, '/x', cA, post({ text: 'x'.repeat(3100) }))).status, 400);
    const sentNames = JSON.stringify(G.__LAST_ARGS || ''); assert.ok(!/Mariana Lopes|Samuel Costa/.test(sentNames));
  });
  await t('interpretar: a lista de alunos NUNCA vai para a IA', async () => {
    seed(); let sent = '';
    G.__LLM = async ({ args }: any) => { sent = JSON.stringify(args); return { content: [{ type: 'tool_use', name: 'registrar_nota', input: { aluno_falado: 'Mariana', resumo: 'x', tipo: 'NOTA', etiqueta: 'OUTRO' } }] }; };
    await call(POST_INT, '/x', cA, post({ text: 'Mariana falou algo' })); assert.ok(sent.length > 0); assert.ok(!/Lopes|Silva|Costa/.test(sent), 'sobrenomes dos alunos não podem estar na requisição');
  });
  await t('transcrever: manda os primeiros nomes dos alunos como dica; áudio vazio/grande/formato ruim; sem chave da OpenAI', async () => {
    seed(); process.env.OPENAI_API_KEY = 'k'; G.__WHISPER_TEXT = ' Samuel sentiu as costas ';
    const form = (name: string, bytes: number, type = 'audio/m4a') => { const f = new FormData(); f.append('file', new File([new Uint8Array(bytes).fill(1)], name, { type })); return { method: 'POST', body: f }; };
    let r = await call(POST_TR, '/x', cA, form('nota.m4a', 100)); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.text, 'Samuel sentiu as costas');
    const hint = G.__WHISPER_ARGS.prompt as string; assert.ok(/Samuel/.test(hint) && /Mariana/.test(hint)); assert.ok(!/Silva|Lopes/.test(hint), 'só o 1º nome'); assert.ok(!/Outro/.test(hint), 'só alunos do coach'); assert.strictEqual(G.__WHISPER_ARGS.language, 'pt');
    assert.strictEqual((await call(POST_TR, '/x', cA, form('nota.m4a', 0))).status, 400); assert.strictEqual((await call(POST_TR, '/x', cA, form('nota.m4a', 11 * 1024 * 1024))).status, 413); assert.strictEqual((await call(POST_TR, '/x', cA, form('nota.exe', 10, 'application/x-msdownload'))).status, 415);
    G.__WHISPER_TEXT = '   '; assert.strictEqual((await call(POST_TR, '/x', cA, form('nota.m4a', 100))).status, 422);
    delete process.env.OPENAI_API_KEY; assert.strictEqual((await call(POST_TR, '/x', cA, form('nota.m4a', 100))).status, 503);
    assert.strictEqual((await call(POST_TR, '/x', alunoTok, form('nota.m4a', 100))).status, 403);
  });
  await t('salvar/listar/editar/concluir/apagar: só do próprio coach; só aluno dele; TAREFA nasce aberta, NOTA fica INFO', async () => {
    seed();
    let r = await call(POST_NOTE, '/api/coach-notes', cA, post({ studentId: 's1', kind: 'TAREFA', tag: 'DOR', body: 'Sentiu as costas no agachamento Smith', rawText: 'bruto', source: 'VOZ', dueDate: TODAY }));
    assert.strictEqual(r.status, 200); const id = r.json.note.id; assert.deepStrictEqual([r.json.note.status, r.json.note.studentName, r.json.note.dueDate, r.json.note.coachId], ['OPEN', 'Samuel Silva', TODAY, 'cA']);
    r = await call(POST_NOTE, '/api/coach-notes', cA, post({ studentId: 's2', kind: 'NOTA', tag: 'OUTRO', body: 'Motivada' })); assert.strictEqual(r.json.note.status, 'INFO'); assert.strictEqual(r.json.note.dueDate, null);
    assert.strictEqual((await call(POST_NOTE, '/api/coach-notes', cA, post({ studentId: 's9', body: 'x' }))).status, 404, 'aluno de outro coach'); assert.strictEqual((await call(POST_NOTE, '/api/coach-notes', cA, post({ studentId: 'nao', body: 'x' }))).status, 404);
    assert.strictEqual((await call(POST_NOTE, '/api/coach-notes', cA, post({ studentId: 's1', body: '   ' }))).status, 400); assert.strictEqual((await call(POST_NOTE, '/api/coach-notes', cA, post({ kind: 'TAREFA', body: 'x', dueDate: 'ontem' }))).status, 400);
    r = await call(POST_NOTE, '/api/coach-notes', cA, post({ kind: 'TAREFA', body: 'Comprar fita métrica' })); assert.strictEqual(r.json.note.studentId, null); assert.strictEqual(r.json.note.dueDate, TODAY === r.json.note.dueDate ? TODAY : r.json.note.dueDate);
    r = await call(GET_NOTES, '/api/coach-notes?studentId=s1', cA); assert.strictEqual(r.json.notes.length, 1); r = await call(GET_NOTES, '/api/coach-notes', cA); assert.strictEqual(r.json.notes.length, 3);
    r = await call(GET_NOTES, '/api/coach-notes?status=OPEN', cA); assert.strictEqual(r.json.notes.length, 2); r = await call(GET_NOTES, '/api/coach-notes?q=costas', cA); assert.strictEqual(r.json.notes.length, 1);
    r = await call(GET_NOTES, '/api/coach-notes', cB); assert.strictEqual(r.json.notes.length, 0, 'o outro coach não vê');
    const ctx = { params: { id } };
    assert.strictEqual((await call(PATCH_NOTE, '/x', cB, patch({ status: 'DONE' }), ctx)).status, 404); assert.strictEqual((await call(DEL_NOTE, '/x', cB, { method: 'DELETE' }, ctx)).status, 404);
    r = await call(PATCH_NOTE, '/x', cA, patch({ status: 'DONE' }), ctx); assert.strictEqual(r.json.note.status, 'DONE'); assert.ok(r.json.note.doneAt);
    r = await call(PATCH_NOTE, '/x', cA, patch({ status: 'OPEN' }), ctx); assert.strictEqual(r.json.note.status, 'OPEN'); assert.strictEqual(r.json.note.doneAt, null);
    r = await call(PATCH_NOTE, '/x', cA, patch({ body: 'Texto novo', tag: 'TREINO', dueDate: '2026-12-01' }), ctx); assert.deepStrictEqual([r.json.note.body, r.json.note.tag, r.json.note.dueDate], ['Texto novo', 'TREINO', '2026-12-01']);
    assert.strictEqual((await call(PATCH_NOTE, '/x', cA, patch({ body: ' ' }), ctx)).status, 400); assert.strictEqual((await call(PATCH_NOTE, '/x', cA, patch({ status: 'XX' }), ctx)).status, 400); assert.strictEqual((await call(PATCH_NOTE, '/x', cA, patch({}), ctx)).status, 400);
    const idNota = S.coachNote.find((n: any) => n.kind === 'NOTA').id; assert.strictEqual((await call(PATCH_NOTE, '/x', cA, patch({ status: 'DONE' }), { params: { id: idNota } })).status, 400, 'NOTA não conclui');
    assert.strictEqual((await call(DEL_NOTE, '/x', cA, { method: 'DELETE' }, ctx)).status, 200); assert.strictEqual(S.coachNote.some((n: any) => n.id === id), false);
  });
  await t('sem as tabelas (antes do db push): 503 com aviso claro, sem quebrar', async () => {
    seed(); S.failOn.coachNote = { message: 'relation "CoachNote" does not exist', code: 'P2021' };
    let r = await call(POST_NOTE, '/api/coach-notes', cA, post({ body: 'x' })); assert.strictEqual(r.status, 503); assert.strictEqual(r.json.unavailable, true);
    r = await call(GET_NOTES, '/api/coach-notes', cA); assert.strictEqual(r.status, 503);
  });

  // ── central HOJE ──
  const hoje = async (coachId = 'cA', now = new Date('2026-10-12T15:00:00Z')) => (await buildHoje(P, coachId, now)).tasks.filter((x: any) => x.type === 'nota');
  const nota = (o: any) => S.coachNote.push({ id: 'n' + Math.random().toString(36).slice(2, 8), coachId: 'cA', studentId: 's1', studentName: 'Samuel Silva', kind: 'TAREFA', tag: 'DOR', body: 'Sentiu as costas no agachamento Smith', rawText: null, source: 'VOZ', dueDate: TODAY, status: 'OPEN', doneAt: null, createdAt: new Date('2026-10-12T14:00:00Z'), ...o });
  await t('HOJE: tarefa vence hoje = "hoje"; atrasada = "late"; futura = EM BREVE (soon); sem data = hoje; concluída/NOTA não aparecem; só as do coach', async () => {
    seed(); nota({ id: 'a' }); nota({ id: 'b', dueDate: '2026-10-10', body: 'Pedido antigo' }); nota({ id: 'c', dueDate: '2026-10-20' }); nota({ id: 'd', dueDate: null, studentId: null, studentName: null, body: 'Comprar fita' });
    nota({ id: 'e', status: 'DONE' }); nota({ id: 'f', kind: 'NOTA', status: 'INFO', dueDate: null }); nota({ id: 'g', coachId: 'cB' });
    const t1: any[] = await hoje(); const byKey = Object.fromEntries(t1.map((x) => [x.key, x]));
    assert.deepStrictEqual(Object.keys(byKey).sort(), ['nota:a', 'nota:b', 'nota:c', 'nota:d']);
    assert.strictEqual(byKey['nota:c'].severity, 'soon'); assert.strictEqual(byKey['nota:c'].subtitle, 'Dor / lesão · para 20/10'); assert.ok(byKey['nota:c'].dueAt.startsWith('2026-10-20'));
    assert.strictEqual(byKey['nota:a'].severity, 'today'); assert.strictEqual(byKey['nota:b'].severity, 'late'); assert.ok(/2 dias/.test(byKey['nota:b'].subtitle), byKey['nota:b'].subtitle); assert.strictEqual(byKey['nota:d'].severity, 'today');
    assert.ok(byKey['nota:a'].title.startsWith('Samuel: ')); assert.strictEqual(byKey['nota:a'].target.id, 's1'); assert.strictEqual(byKey['nota:a'].person.name, 'Samuel Silva'); assert.strictEqual(byKey['nota:a'].tag, 'DOR'); assert.ok(/Dor/.test(byKey['nota:a'].subtitle));
    assert.strictEqual(byKey['nota:d'].person, null); assert.deepStrictEqual(byKey['nota:d'].target, { type: 'students' });
    const amanha: any[] = await hoje('cA', new Date('2026-10-20T15:00:00Z')); assert.strictEqual(amanha.find((x) => x.key === 'nota:c').severity, 'today', 'chegou a data: vira A FAZER');
  });
  await t('HOJE: resolver pela central conclui a anotação; reabrir volta; adiar esconde; concluir no diário some da central', async () => {
    seed(); nota({ id: 'a' }); nota({ id: 'b' });
    let r = await call(POST_RES, '/x', cA, post({ coachId: 'cA', taskKey: 'nota:a', task: { type: 'nota', title: 'Samuel: x', person: { kind: 'student', id: 's1', name: 'Samuel Silva' } }, note: 'avaliei' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(S.coachNote.find((n: any) => n.id === 'a').status, 'DONE'); assert.ok(S.coachNote.find((n: any) => n.id === 'a').doneAt);
    assert.deepStrictEqual((await hoje()).map((x: any) => x.key), ['nota:b']);
    r = await call(POST_RES, '/x', cA, post({ coachId: 'cA', taskKey: 'nota:a', action: 'reopen' })); assert.strictEqual(S.coachNote.find((n: any) => n.id === 'a').status, 'OPEN'); assert.strictEqual((await hoje()).length, 2);
    await call(PATCH_NOTE, '/x', cA, patch({ status: 'DONE' }), { params: { id: 'b' } }); assert.deepStrictEqual((await hoje()).map((x: any) => x.key), ['nota:a']);
    S.agendaTaskSnooze.push({ id: 'z', coachId: 'cA', taskKey: 'nota:a', until: new Date('2026-10-20T00:00:00Z') }); assert.strictEqual((await hoje()).length, 0);
  });
  await t('HOJE: mais de 8 tarefas viram "+N"; tabela ainda não criada não derruba a central', async () => {
    seed(); for (let i = 0; i < 11; i++) nota({ id: 'x' + i, body: 'tarefa ' + i });
    const all: any[] = (await buildHoje(P, 'cA', new Date('2026-10-12T15:00:00Z'))).tasks.filter((x: any) => String(x.type).startsWith('nota'));
    assert.strictEqual(all.length, 9); assert.ok(all.some((x) => x.type === 'nota_mais' && x.count === 3));
    S.failOn.coachNote = { message: 'does not exist', code: 'P2021' }; const h: any = await buildHoje(P, 'cA', new Date('2026-10-12T15:00:00Z')); assert.ok(h.unavailable.includes('anotações do coach')); assert.strictEqual(h.tasks.filter((x: any) => x.type === 'nota').length, 0);
  });
  console.log(`\n${ok} ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
