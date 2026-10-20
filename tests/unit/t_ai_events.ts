// Histórico detalhado do custo de IA (20 out 2026): cada uso com data e hora, tipo, quem usou, custo e resumo; só master; paginado; filtra por tipo.
import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as EVENTS } from '/home/user/fitos-final/app/api/admin/coach-ai-usage/events/route';
import { costOfRow, describeRow, USE_KINDS } from '/home/user/fitos-final/lib/aiCost';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const get = async (as: string | null, qs = '') => {
  const headers: any = {}; if (as) headers.authorization = 'Bearer ' + as;
  const r = await EVENTS(new Request('http://x/api/admin/coach-ai-usage/events' + qs, { headers }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n' + (e?.stack || e)); } };
const u = (id: string, role: string, extra: any = {}) => S.user.push({ id, role, name: id, accountStatus: 'ACTIVE', active: true, coachBillingStatus: 'ACTIVE', coachId: null, coachPlan: 'ELITE', ...extra });
const log = (userId: string, question: string, answer: any, createdAt: Date) => S.aiLog.push({ id: 'l' + S.aiLog.length, userId, question, answer: typeof answer === 'string' ? answer : JSON.stringify(answer), createdAt });
const near = (a: number, b: number, d = 1e-6) => assert.ok(Math.abs(a - b) <= d, `${a} ≠ ${b}`);
const day = (d: number, h = 12) => new Date(Date.UTC(2026, 9, d, h + 3, 0, 0));   // dia d de outubro de 2026, h horas em Brasília

(async () => {
  await t('tokens: aceita os nomes de cada provedor (inputTokens, input_tokens da Anthropic, prompt_tokens da OpenAI) e o feedback da semana deixa de ser "estimado"', () => {
    const w = costOfRow('weekly-feedback:2026-10-12', JSON.stringify({ usage: { input_tokens: 2000, output_tokens: 500 } }))!;
    assert.strictEqual(w.estimated, false); near(w.usd, 2000 / 1e6 * 1 + 500 / 1e6 * 5);
    const o = costOfRow('uso:importar-pdf-treino', JSON.stringify({ model: 'gpt-4o', prompt_tokens: 1000, completion_tokens: 1000 }))!; assert.strictEqual(o.estimated, false); near(o.usd, 0.0125);
    assert.strictEqual(costOfRow('weekly-feedback:x', JSON.stringify({ usage: null }))!.estimated, true, 'sem tokens continua estimado');
  });

  await t('resumo: motor, tokens, tempo, fotos, áudio e voz; nunca mostra a resposta', () => {
    assert.strictEqual(describeRow('gerar-treino:gemini-flash', JSON.stringify({ model: 'gemini-2.5-flash', inputTokens: 100, outputTokens: 50, ms: 12400, days: 4, exercises: 28, answer: 'segredo' })), 'motor gemini-flash · 4 dia(s) · 28 exercício(s) · 100 entrada + 50 saída (tokens) · 12.4 s');
    assert.strictEqual(describeRow('avaliar-checkin:gemini-flash', JSON.stringify({ photos: 3 })), 'motor gemini-flash · 3 foto(s)');
    assert.strictEqual(describeRow(USE_KINDS.transcricao, JSON.stringify({ model: 'whisper-1', bytes: 20480 })), 'whisper-1 · áudio 20 KB');
    assert.strictEqual(describeRow('[TTS] coral', '350'), '350 letras, voz coral');
    assert.strictEqual(describeRow('weekly-feedback:2026-10-12', JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 }, intro: 'texto longo' })), '10 entrada + 5 saída (tokens) · semana 2026-10-12');
    assert.ok(!describeRow('gerar-dieta:google', JSON.stringify({ dayType: 'TREINO', usageAndCost: { inTokens: 7, outTokens: 3 } })).includes('segredo'));
    assert.strictEqual(describeRow('Pergunta qualquer', 'resposta'), '');
  });

  await t('rota: só master (401/403), pede o coach e responde cada uso com data/hora ISO, tipo, quem usou e custo; mais novo primeiro', async () => {
    u('coA', 'COACH', { name: 'Coach A' }); u('stA', 'USER', { name: 'Maria', coachId: 'coA' }); u('coB', 'COACH', { name: 'Coach B' }); u(PAULO_ID, 'ADMIN', { name: 'Paulo' });
    log('coA', 'gerar-treino:gemini-flash', { model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 200, usd: 0.02, days: 3 }, day(10, 9));
    log('stA', 'weekly-feedback:2026-10-12', { usage: { input_tokens: 100, output_tokens: 50 } }, day(12, 18));
    log('coA', 'gerar-treino:gemini-flash:falhou', { usd: 9 }, day(11));
    log('coB', 'gerar-treino:gemini-flash', { usd: 7 }, day(11));
    assert.strictEqual((await get(null, '?coachId=coA')).status, 401); assert.strictEqual((await get(tok('coA'), '?coachId=coA')).status, 403); assert.strictEqual((await get(tok(PAULO_ID, 'ADMIN'), '')).status, 400);
    const r = await get(tok(PAULO_ID, 'ADMIN'), '?coachId=coA&month=2026-10'); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.items.length, 2, 'falhou e outro coach ficam de fora'); assert.strictEqual(r.json.next, null);
    const [a, b] = r.json.items;
    assert.strictEqual(a.category, 'feedback'); assert.strictEqual(a.at, day(12, 18).toISOString()); assert.deepStrictEqual(a.by, { id: 'stA', name: 'Maria', role: 'USER' }); assert.match(a.detail, /100 entrada \+ 50 saída/);
    assert.strictEqual(b.category, 'treino'); assert.strictEqual(b.at, day(10, 9).toISOString()); assert.strictEqual(b.by.name, 'Coach A'); near(b.usd, 0.02); near(b.brl, 0.11, 1e-6); assert.strictEqual(b.estimated, false); assert.match(b.detail, /motor gemini-flash · 3 dia\(s\)/);
  });

  await t('rota: filtra por tipo, escolhe o mês e pagina de 40 em 40 sem repetir nem perder linha', async () => {
    u('coA', 'COACH', { name: 'Coach A' }); u(PAULO_ID, 'ADMIN');
    for (let i = 0; i < 95; i++) log('coA', 'gerar-treino:gemini-flash', { usd: 0.01 }, new Date(Date.UTC(2026, 9, 5, 12, 0, 0) + i * 60000));
    for (let i = 0; i < 5; i++) log('coA', 'avaliar-checkin:gemini-flash', { photos: 2 }, new Date(Date.UTC(2026, 9, 6, 12, 0, i)));
    log('coA', 'gerar-treino:gemini-flash', { usd: 5 }, new Date(Date.UTC(2026, 8, 20, 12)));   // setembro
    const M = tok(PAULO_ID, 'ADMIN'); const seen: string[] = []; let before = ''; let pages = 0;
    for (;;) {
      const r = await get(M, `?coachId=coA&month=2026-10&category=treino${before}`); assert.strictEqual(r.status, 200); pages++;
      assert.ok(r.json.items.length <= 40); r.json.items.forEach((x: any) => { assert.strictEqual(x.category, 'treino'); seen.push(x.id); });
      if (!r.json.next) break; before = '&before=' + encodeURIComponent(r.json.next); assert.ok(pages < 5, 'não entra em laço');
    }
    assert.strictEqual(pages, 3); assert.strictEqual(seen.length, 95); assert.strictEqual(new Set(seen).size, 95, 'sem repetição');
    const all = await get(M, '?coachId=coA&month=2026-10'); assert.strictEqual(all.json.items.length, 40); assert.ok(all.json.next);
    assert.strictEqual((await get(M, '?coachId=coA&month=2026-09')).json.items.length, 1);
    assert.strictEqual((await get(M, '?coachId=coA&month=2026-10&category=inventada')).json.items.length, 40, 'tipo inválido = sem filtro');
  });

  await t('privacidade: o texto da pergunta do aluno só aparece para coach do time master; de aluno de parceiro nunca; "sem-coach" lista os alunos sem coach', async () => {
    u('coP', 'COACH'); u('stP', 'USER', { coachId: 'coP', name: 'Aluno do parceiro' }); u(PAULO_ID, 'ADMIN'); u('stM', 'USER', { coachId: PAULO_ID, name: 'Aluno do Paulo' }); u('stFree', 'USER', { name: 'Sem coach' });
    log('stP', 'Qual o meu treino de hoje?', 'resposta', day(8)); log('stM', 'Posso trocar o supino?', 'resposta', day(8)); log('stFree', 'Oi', 'x', day(8));
    const M = tok(PAULO_ID, 'ADMIN');
    let r = await get(M, '?coachId=coP&month=2026-10'); assert.strictEqual(r.json.items.length, 1); assert.strictEqual(r.json.items[0].category, 'chat'); assert.ok(!('question' in r.json.items[0]), 'pergunta de aluno de parceiro não vaza');
    r = await get(M, `?coachId=${PAULO_ID}&month=2026-10`); assert.strictEqual(r.json.items[0].question, 'Posso trocar o supino?');
    r = await get(M, '?coachId=sem-coach&month=2026-10'); assert.strictEqual(r.json.items.length, 1); assert.strictEqual(r.json.items[0].by.name, 'Sem coach'); assert.ok(!('question' in r.json.items[0]));
    u('stL', 'USER', { coachId: PAULO_ID }); log('stL', 'x'.repeat(400), 'r', day(9)); r = await get(M, `?coachId=${PAULO_ID}&month=2026-10`); assert.ok(r.json.items.find((x: any) => x.question && x.question.length <= 160 && x.question.endsWith('…')), 'pergunta longa é cortada');
  });

  console.log(`\n${ok} de ${ok + fails} testes passaram`); if (fails) process.exit(1);
})();
