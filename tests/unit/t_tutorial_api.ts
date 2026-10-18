import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET, PUT, DELETE } from '/home/user/fitos-final/app/api/tutorial-videos/route';
import * as TV from '/home/user/fitos-final/lib/tutorialVideos';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const put = (o: any) => ({ method: 'PUT', body: JSON.stringify(o) });
const master = tok(PAULO_ID, 'ADMIN'), coach = tok('cX'), aluno = tok('sX', 'USER');
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { S.tutorialVideo.length = 0; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 5).join('\n        ')); } };
const HLS = 'https://customer-abc123.cloudflarestream.com/' + 'a'.repeat(32) + '/manifest/video.m3u8';

(async () => {
  await t('regras: abas, link (só https de Cloudflare ou mp4), textos e capítulos limpos', () => {
    assert.strictEqual(TV.STUDENT_TUTORIAL_TABS.length, 9); assert.strictEqual(TV.TUTORIAL_TABS.length, 12); assert.deepStrictEqual([...TV.COACH_TUTORIAL_TABS], ['CoachPersonal', 'CoachNutri', 'CoachElite']); assert.ok(TV.isTab('CoachElite') && TV.isCoachTab('CoachNutri') && !TV.isCoachTab('Dieta') && !TV.isCoachTab(null)); assert.ok(TV.isTab('Check-in')); assert.ok(!TV.isTab('Nada')); assert.ok(!TV.isTab(null));
    assert.strictEqual(TV.cleanUrl(HLS), HLS); assert.strictEqual(TV.cleanUrl('  ' + HLS + ' '), HLS); assert.strictEqual(TV.cleanUrl(''), null); assert.strictEqual(TV.cleanUrl(null), null); assert.strictEqual(TV.cleanUrl(undefined), undefined);
    assert.strictEqual(TV.cleanUrl('https://exemplo.com/v/aula.mp4'), 'https://exemplo.com/v/aula.mp4');
    for (const bad of ['http://customer-x.cloudflarestream.com/a/manifest/video.m3u8', 'javascript:alert(1)', 'https://evil.com/video', 'ftp://x.cloudflarestream.com/a', 'https://x.cloudflarestream.com.evil.com/a']) assert.throws(() => TV.cleanUrl(bad), undefined, bad);
    assert.strictEqual(TV.cleanText('  Olá   <b>mundo</b> ', 40), 'Olá b mundo /b'.replace('b mundo /b', 'b mundo /b')); assert.strictEqual(TV.cleanText('', 10), null); assert.strictEqual(TV.cleanText('x'.repeat(100), 10)!.length, 10); assert.strictEqual(TV.cleanText(undefined, 5), undefined);
    assert.strictEqual(TV.cleanGuid('A'.repeat(32)), 'a'.repeat(32)); assert.throws(() => TV.cleanGuid('curto'));
    const ch = TV.cleanChapters([{ title: 'B', start: 30 }, { title: 'A', start: 0 }, { title: '', start: 5 }, { title: 'sem início' }, { title: 'C', start: 60, end: 50 }, { title: 'D', start: 90, end: 120, id: 'Meu Id!' }, null, 'x'])!;
    assert.deepStrictEqual(ch.map((c) => c.title), ['A', 'B', 'C', 'D']); assert.deepStrictEqual(ch.map((c) => c.id), ['c1', 'c2', 'c3', 'meuid']); assert.strictEqual(ch[2].end, undefined, 'fim antes do início é ignorado'); assert.strictEqual(ch[3].end, 120);
    assert.strictEqual(TV.cleanChapters(Array.from({ length: 50 }, (_, i) => ({ title: 'x' + i, start: i }))!)!.length, TV.MAX_CHAPTERS); assert.throws(() => TV.cleanChapters('lixo')); assert.strictEqual(TV.cleanChapters(undefined), undefined);
    assert.deepStrictEqual(TV.cleanChapters([{ title: 'x', start: 5 }, { title: 'y', start: 5 }])!.map((c) => c.id), ['c1', 'c2']); assert.deepStrictEqual(TV.cleanChapters([{ id: 'a', title: 'x', start: 1 }, { id: 'a', title: 'y', start: 2 }])!.map((c) => c.id), ['a', 'a_'], 'id repetido ganha sufixo');
    assert.deepStrictEqual(TV.buildUpdate({ title: 'Meu', chapters: [], durationSec: 'abc' }), { title: 'Meu', chapters: [], durationSec: null }); assert.deepStrictEqual(TV.buildUpdate({}), {}); assert.deepStrictEqual(TV.buildUpdate(null), {});
  });
  await t('GET: precisa de login; sem nada cadastrado devolve vazio; devolve só abas válidas', async () => {
    assert.strictEqual((await call(GET, '/api/tutorial-videos', null)).status, 401);
    let r = await call(GET, '/api/tutorial-videos', aluno); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.videos, {});
    S.tutorialVideo.push({ tab: 'Dieta', url: HLS, title: null, partnerTitle: null, subtitle: null, chapters: [{ id: 'dia', title: 'Dia', start: 0 }], durationSec: 189, updatedAt: new Date() }, { tab: 'Lixo', url: HLS, chapters: [] });
    r = await call(GET, '/api/tutorial-videos', coach); assert.deepStrictEqual(Object.keys(r.json.videos), ['Dieta']); assert.strictEqual(r.json.videos.Dieta.url, HLS); assert.strictEqual(r.json.videos.Dieta.chapters.length, 1); assert.strictEqual(r.json.videos.Dieta.title, null);
  });
  await t('PUT: só o time master; aba inválida, link ruim e corpo vazio dão 400; grava só o que foi enviado', async () => {
    assert.strictEqual((await call(PUT, '/api/tutorial-videos', null, put({ tab: 'Dieta', url: HLS }))).status, 401);
    assert.strictEqual((await call(PUT, '/api/tutorial-videos', coach, put({ tab: 'Dieta', url: HLS }))).status, 403); assert.strictEqual((await call(PUT, '/api/tutorial-videos', aluno, put({ tab: 'Dieta', url: HLS }))).status, 403); assert.strictEqual(S.tutorialVideo.length, 0);
    assert.strictEqual((await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Xyz', url: HLS }))).status, 400);
    assert.strictEqual((await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta', url: 'http://inseguro.com/a' }))).status, 400);
    assert.strictEqual((await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta' }))).status, 400, 'nada para salvar');
    let r = await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta', url: HLS, guid: 'b'.repeat(32), durationSec: 189.4 })); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.video.url, HLS); assert.strictEqual(S.tutorialVideo[0].updatedBy, PAULO_ID); assert.strictEqual(S.tutorialVideo[0].guid, 'b'.repeat(32));
    r = await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta', chapters: [{ title: 'Guias', start: 174 }, { title: 'Início', start: 0 }] })); assert.strictEqual(r.status, 200);
    S.tutorialVideo[0].updatedBy = 'outro'; await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta', subtitle: 'x' })); assert.strictEqual(S.tutorialVideo[0].updatedBy, PAULO_ID, 'quem editou por último fica registrado'); assert.strictEqual(S.tutorialVideo.length, 1, 'mesmo registro'); assert.strictEqual(S.tutorialVideo[0].url, HLS, 'o link não foi mexido'); assert.deepStrictEqual(S.tutorialVideo[0].chapters.map((c: any) => c.title), ['Início', 'Guias']);
    r = await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta', title: 'Minha dieta', partnerTitle: 'Dieta ELITE' })); assert.strictEqual(S.tutorialVideo[0].title, 'Minha dieta'); assert.strictEqual(S.tutorialVideo[0].partnerTitle, 'Dieta ELITE'); assert.strictEqual(S.tutorialVideo[0].chapters.length, 2);
    r = await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta', title: '' })); assert.strictEqual(S.tutorialVideo[0].title, null, 'vazio limpa o nome');
  });
  await t('PUT: trocar o link sem mandar o id do vídeo apaga o id antigo; link vazio tira o vídeo', async () => {
    await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Perfil', url: HLS, guid: 'c'.repeat(32) }));
    const novo = 'https://customer-zzz.cloudflarestream.com/' + 'd'.repeat(32) + '/manifest/video.m3u8';
    await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Perfil', url: novo })); assert.strictEqual(S.tutorialVideo[0].url, novo); assert.strictEqual(S.tutorialVideo[0].guid, null);
    await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Perfil', url: '' })); assert.strictEqual(S.tutorialVideo[0].url, null);
    const g = await call(GET, '/api/tutorial-videos', aluno); assert.strictEqual(g.json.videos.Perfil.url, null); assert.strictEqual(g.json.videos.Perfil.chapters, null, 'sem capítulos gravados: null = o app usa os padrão');
    await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Perfil', chapters: [] })); const g2 = await call(GET, '/api/tutorial-videos', aluno); assert.deepStrictEqual(g2.json.videos.Perfil.chapters, [], 'lista vazia gravada de propósito = sem capítulos');
  });
  await t('DELETE: só master; volta a aba ao padrão; aba inválida dá 400', async () => {
    await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Treinos', url: HLS }));
    assert.strictEqual((await call(DELETE, '/api/tutorial-videos?tab=Treinos', coach, { method: 'DELETE' })).status, 403); assert.strictEqual(S.tutorialVideo.length, 1);
    assert.strictEqual((await call(DELETE, '/api/tutorial-videos?tab=Nada', master, { method: 'DELETE' })).status, 400);
    assert.strictEqual((await call(DELETE, '/api/tutorial-videos?tab=Treinos', master, { method: 'DELETE' })).status, 200); assert.strictEqual(S.tutorialVideo.length, 0);
  });
  await t('tabela ainda não criada (sem db push): GET devolve vazio, PUT avisa com 503, nada quebra', async () => {
    S.failOn.tutorialVideo = { message: 'The table `public.TutorialVideo` does not exist', code: 'P2021' };
    let r = await call(GET, '/api/tutorial-videos', aluno); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.videos, {});
    S.failOn.tutorialVideo = { message: 'The table `public.TutorialVideo` does not exist', code: 'P2021' };
    r = await call(PUT, '/api/tutorial-videos', master, put({ tab: 'Dieta', url: HLS })); assert.strictEqual(r.status, 503); assert.ok(/db push/.test(r.json.error)); delete S.failOn.tutorialVideo;
  });
  await t('coach: leitura pública (?scope=coach) devolve SÓ os 3 vídeos de coach, sem login; os dos alunos nunca saem por ali; o GET normal continua exigindo login', async () => {
    S.tutorialVideo.push({ tab: 'CoachPersonal', url: HLS, title: 'Tutorial do Personal', chapters: [], durationSec: 58, updatedAt: new Date() }, { tab: 'Dieta', url: HLS, chapters: [] }, { tab: 'CoachElite', url: null, chapters: [] }, { tab: 'Lixo', url: HLS, chapters: [] });
    const r = await call(GET, '/api/tutorial-videos?scope=coach', null); assert.strictEqual(r.status, 200); assert.deepStrictEqual(Object.keys(r.json.videos).sort(), ['CoachElite', 'CoachPersonal']); assert.strictEqual(r.json.videos.CoachPersonal.url, HLS); assert.strictEqual(r.json.videos.CoachPersonal.title, 'Tutorial do Personal'); assert.ok(!('Dieta' in r.json.videos));
    assert.strictEqual((await call(GET, '/api/tutorial-videos', null)).status, 401, 'sem scope continua exigindo login');
    const logged = await call(GET, '/api/tutorial-videos', coach); assert.deepStrictEqual(Object.keys(logged.json.videos).sort(), ['CoachElite', 'CoachPersonal', 'Dieta'], 'logado vê tudo (menos aba inválida)');
    assert.strictEqual((await call(GET, '/api/tutorial-videos?scope=aluno', null)).status, 401, 'qualquer outro scope é como sem scope');
    const rawPub = await GET(new Request('http://x/api/tutorial-videos?scope=coach')); assert.strictEqual(rawPub.headers.get('Cache-Control'), 'public, max-age=60', 'a leitura pública pode ser guardada'); const rawPriv = await GET(new Request('http://x/api/tutorial-videos', { headers: { authorization: 'Bearer ' + coach } })); assert.strictEqual(rawPriv.headers.get('Cache-Control'), 'private, max-age=60', 'a logada é só do usuário');
  });
  await t('coach: o master grava e apaga os vídeos de coach pela mesma rota; o coach comum não', async () => {
    let r = await call(PUT, '/api/tutorial-videos', master, put({ tab: 'CoachNutri', url: HLS, guid: 'c'.repeat(32), durationSec: 59, title: 'Tutorial da Nutri', subtitle: 'O app em 1 minuto' })); assert.strictEqual(r.status, 200); assert.strictEqual(S.tutorialVideo[0].tab, 'CoachNutri'); assert.strictEqual(S.tutorialVideo[0].title, 'Tutorial da Nutri');
    assert.strictEqual((await call(PUT, '/api/tutorial-videos', coach, put({ tab: 'CoachNutri', url: HLS }))).status, 403);
    assert.strictEqual((await call(DELETE, '/api/tutorial-videos?tab=CoachNutri', coach, { method: 'DELETE' })).status, 403);
    assert.strictEqual((await call(DELETE, '/api/tutorial-videos?tab=CoachNutri', master, { method: 'DELETE' })).status, 200); assert.strictEqual(S.tutorialVideo.length, 0);
    assert.strictEqual((await call(PUT, '/api/tutorial-videos', master, put({ tab: 'CoachOutro', url: HLS }))).status, 400, 'tipo de coach que não existe');
  });
  console.log('\n' + ok + ' ok, ' + fails + ' falhas'); if (fails) process.exit(1);
})();
