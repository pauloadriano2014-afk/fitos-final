import assert from 'assert';
import prisma from '@/lib/prisma';
import * as A from '/home/user/fitos-final/lib/coachAssistant';
import { CATALOG, catalogFor } from '/home/user/fitos-final/lib/assistantCatalog';
import { POST as REGISTER } from '/home/user/fitos-final/app/api/auth/register/route';
import { GET as PRIVACIDADE } from '/home/user/fitos-final/app/privacidade/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state; 
const NOW = new Date('2026-10-14T15:00:00Z'); const ago = (n: number) => new Date(NOW.getTime() - n * 86400000);
const post = async (body: any) => { const res: any = await REGISTER({ json: async () => body } as any); return { status: res.status, body: await res.json() }; };
const coach = (extra: any) => ({ accountType: 'COACH', name: 'Ana', email: `a${Math.random()}@x.com`, password: 'Senha123', cpf: '52998224725', phone: '41999990000', ...extra });
let ok = 0; const t = async (n: string, f: () => Promise<void> | void) => { P.__reset(); try { await f(); ok++; console.log('  ok  ' + n); } catch (e: any) { console.log('  FALHOU  ' + n + '\n    ' + (e && e.stack || e)); process.exitCode = 1; } };
(async () => {
  await t('cadastro de coach guarda a origem (ios/android/web); valor estranho ou ausente vira nada; o resto do cadastro não muda', async () => {
    for (const pl of ['ios', 'android', 'web']) { const r = await post(coach({ platform: pl })); assert.equal(r.status, 201); assert.equal(S.user.at(-1).coachRequestInfo.platform, pl); }
    for (const bad of ['windows', '', 123, null, undefined, { a: 1 }]) { await post(coach({ platform: bad })); assert.equal(S.user.at(-1).coachRequestInfo.platform, null, 'origem inválida: ' + JSON.stringify(bad)); }
    S.user.push({ id: 'm1', email: 'paulo_adriano2014@live.com', role: 'COACH', pushToken: 'x' });
    const G: any = globalThis; G.__pushes = [];
    await post(coach({ platform: 'ios' })); assert.ok(/pelo app do iPhone e aguarda aprovação/.test(G.__pushes.at(-1).body), G.__pushes.at(-1).body);
    await post(coach({ platform: 'android' })); assert.ok(/pelo app do Android/.test(G.__pushes.at(-1).body));
    await post(coach({ platform: 'web' })); assert.ok(/pelo site/.test(G.__pushes.at(-1).body));
    await post(coach({})); assert.ok(!/ pelo /.test(G.__pushes.at(-1).body), 'sem origem, a mensagem fica como antes');
    await post(coach({ coachPlan: 'ELITE', platform: 'ios' })); assert.equal(S.user.at(-1).coachPlan, 'ELITE'); assert.equal(S.user.at(-1).accountStatus, 'PENDING_APPROVAL'); assert.equal(S.user.at(-1).coachRequestInfo.coachPlan, 'ELITE');
  });
  const u = (o: any) => S.user.push({ role: 'COACH', active: true, isTestAccount: false, accountStatus: 'ACTIVE', coachPlan: 'PERSONAL', createdAt: ago(3), ...o });
  await t('COACHES_ORIGEM: conta por origem dentro do período, separa aprovados e aguardando, ignora master/teste/fora do período; só master', async () => {
    u({ id: 'c1', name: 'A', coachRequestInfo: { platform: 'ios' } });
    u({ id: 'c2', name: 'B', accountStatus: 'PENDING_APPROVAL', coachRequestInfo: { platform: 'ios' } });
    u({ id: 'c3', name: 'C', coachRequestInfo: { platform: 'web' } });
    u({ id: 'c4', name: 'D', coachRequestInfo: { platform: 'android' }, accountStatus: 'REJECTED' });
    u({ id: 'c5', name: 'E', coachRequestInfo: { instagram: 'x' } });
    u({ id: 'c6', name: 'F', coachRequestInfo: null });
    u({ id: 'c7', name: 'Velho', coachRequestInfo: { platform: 'ios' }, createdAt: ago(60) });
    u({ id: 'c9', name: 'Estranho', coachRequestInfo: { platform: 'windows' } });
    u({ id: 'c8', name: 'Fantasma', isTestAccount: true, coachRequestInfo: { platform: 'ios' } });
    u({ id: PAULO_ID, name: 'Paulo', coachRequestInfo: { platform: 'ios' } });
    const r = await A.runIntent(P, PAULO_ID, 'COACHES_ORIGEM', {}, { now: NOW });
    assert.equal(r.total, 7, 'padrão 30 dias: 7 cadastros (sem velho, teste e master)');
    const by = Object.fromEntries(r.items.map((i) => [i.name, i.detail]));
    assert.equal(by['iPhone (app)'], '2 cadastros · 1 aprovado · 1 aguardando');
    assert.equal(by['Android (app)'], '1 cadastro · 0 aprovados');
    assert.equal(by['Web / site'], '1 cadastro · 1 aprovado');
    assert.equal(by['Sem registro (antes da 1.1)'], '3 cadastros · 3 aprovados', 'origem desconhecida ou estranha cai aqui');
    assert.deepStrictEqual(r.items.map((i) => i.name), ['iPhone (app)', 'Android (app)', 'Web / site', 'Sem registro (antes da 1.1)'], 'ordem fixa');
    assert.ok(/7 cadastros de coach nos últimos 30 dias: 2 pelo iPhone, 1 pelo Android, 1 pelo Web \/ site\./.test(r.spoken), r.spoken);
    assert.ok(/vieram sem registro de origem/.test(r.spoken));
    assert.deepStrictEqual(r.params, { dias: 30, situacao: 'vencendo' }, 'a tela oferece 7/15/30');
    const r7 = await A.runIntent(P, PAULO_ID, 'COACHES_ORIGEM', { dias: 7 }, { now: NOW }); assert.equal(r7.total, 7);
    const r1 = await A.runIntent(P, PAULO_ID, 'COACHES_ORIGEM', { dias: 2 }, { now: NOW }); assert.equal(r1.total, 0); assert.ok(/Nenhum cadastro/.test(r1.spoken));
    const r90 = await A.runIntent(P, PAULO_ID, 'COACHES_ORIGEM', { dias: 90 }, { now: NOW }); assert.equal(r90.total, 8, '90 dias inclui o cadastro de 60 dias atrás');
    const no = await A.runIntent(P, 'c1', 'COACHES_ORIGEM', {}, { now: NOW }); assert.equal(no.restricted, true); assert.equal(no.items.length, 0, 'coach comum não vê');
  });
  await t('COACHES_ORIGEM: está no catálogo só do master, não é de finanças (aparece no iPhone), e as palavras-chave a encontram', () => {
    assert.ok(A.isMasterIntent('COACHES_ORIGEM') && A.isIntent('COACHES_ORIGEM') && A.QUICK_INTENTS.includes('COACHES_ORIGEM') && !A.FINANCE_INTENTS.includes('COACHES_ORIGEM'));
    const btn = CATALOG.find((c) => c.id === 'coaches')!.buttons.find((b) => b.intent === 'COACHES_ORIGEM')!; assert.ok(btn && !btn.finance && btn.params!.dias === 30);
    assert.ok(catalogFor({ master: true, ios: true }).find((c) => c.id === 'coaches')!.buttons.some((b) => b.intent === 'COACHES_ORIGEM'));
    assert.ok(!catalogFor({ master: false, ios: false }).some((c) => c.id === 'coaches'));
    for (const q of ['de onde vêm os cadastros de coach', 'quantos coaches vieram pelo iphone, qual a origem dos cadastros', 'cadastros de coach por plataforma', 'de onde vem os coaches']) assert.equal(A.ruleRoute(q, { master: true }).intent, 'COACHES_ORIGEM', q);
    assert.notEqual(A.ruleRoute('de onde vêm os cadastros de coach', { master: false }).intent, 'COACHES_ORIGEM', 'coach comum não roteia');
    assert.equal(A.ruleRoute('coaches novos', { master: true }).intent, 'COACHES_NOVOS', 'as outras perguntas de coach seguem iguais');
    assert.equal(A.ruleRoute('coaches para aprovar cadastros', { master: true }).intent, 'COACHES_PENDENTES');
    assert.ok(/COACHES_ORIGEM/.test(A.routerPrompt('2026-10-14', true)) && !/COACHES_ORIGEM/.test(A.routerPrompt('2026-10-14', false)), 'só o prompt do master conhece');
  });
  await t('teste grátis fica fora do iPhone no assistente: o botão some (a categoria Crescimento some junto) e segue no Android/web', () => {
    const flat = (o: any) => catalogFor(o).flatMap((c) => c.buttons.map((b) => b.intent));
    assert.ok(!flat({ master: false, ios: true }).includes('TESTE_GRATIS') && !flat({ master: true, ios: true }).includes('TESTE_GRATIS'), 'iPhone: sem teste grátis');
    assert.ok(!catalogFor({ master: true, ios: true }).some((c) => c.id === 'crescimento'), 'categoria vazia some');
    assert.ok(flat({ master: false, ios: false }).includes('TESTE_GRATIS') && flat({ master: true, ios: false }).includes('TESTE_GRATIS'), 'Android/web: como antes');
  });
  await t('política de privacidade (1.1): cita OpenAI, Anthropic, voz do treinador, vídeo ao treinador (90 dias) e controle financeiro sem cobrança no iPhone; mantém Gemini e Asaas', async () => {
    const res: any = await PRIVACIDADE(new Request('http://x/privacidade') as any); const html = await res.text(); assert.equal(res.status, 200);
    for (const must of ['OpenAI', 'Anthropic', 'Google Gemini', 'Asaas', 'Anotações e Perguntas por Voz', 'Vídeo de Execução (aluno para o treinador)', 'apagados automaticamente após 90 dias', 'não realiza cobrança nem pagamento', 'Microfone (anotações e perguntas por voz)', 'o áudio não é guardado', 'Outubro de 2026']) assert.ok(html.includes(must), 'falta: ' + must);
    assert.ok(!html.includes('Setembro de 2026'));
  });
  console.log(`\n${ok} ok`);
})();
