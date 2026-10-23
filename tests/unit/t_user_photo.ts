import assert from 'assert';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { PUT } from '/home/user/fitos-final/app/api/user/update/route';
import { validPhotoUrl } from '/home/user/fitos-final/lib/photoUrl';

// FOTO DE PERFIL (23 out 2026): o app sobe a imagem para o R2 e manda só o LINK em /api/user/update; o servidor guarda em User.photoUrl.
const P = prisma as any; const U = P.__users;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const put = async (body: any, as: string | null) => { const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as; const r = await PUT(new Request('http://x/api/user/update', { method: 'PUT', headers, body: JSON.stringify(body) })); return { status: r.status, json: await r.json().catch(() => null) }; };
const PUB = 'https://pub-abc.r2.dev'; const OK = PUB + '/profiles/1700000000000_foto.jpg';
const seed = () => { P.__reset(); U.push({ id: 'aluno', name: 'Aluno', coachId: 'coach', nutritionistId: null, photoUrl: null }, { id: 'outro', name: 'Outro', coachId: 'coach2', nutritionistId: null, photoUrl: null }, { id: 'coach', name: 'Coach', role: 'COACH' }, { id: 'coach2', name: 'Coach 2', role: 'COACH' }); process.env.R2_PUBLIC_URL = PUB + '/'; };
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { seed(); await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

(async () => {
  await t('validação do link: só https do nosso R2, até 500 letras; vazio/null apaga; outra coisa recusa', () => {
    assert.deepEqual(validPhotoUrl(OK), { ok: true, value: OK }); assert.deepEqual(validPhotoUrl('  ' + OK + ' '), { ok: true, value: OK }, 'tira espaços');
    assert.deepEqual(validPhotoUrl(null), { ok: true, value: null }); assert.deepEqual(validPhotoUrl(''), { ok: true, value: null });
    for (const bad of ['http://pub-abc.r2.dev/a.jpg', 'https://outro-site.com/a.jpg', 'data:image/jpeg;base64,QUJD', 'javascript:alert(1)', 123, {}, PUB + '/' + 'x'.repeat(600)]) assert.equal((validPhotoUrl(bad as any) as any).ok, false, String(bad).slice(0, 40));
    assert.equal((validPhotoUrl('https://qualquer.com/a.jpg') as any).ok, false); delete process.env.R2_PUBLIC_URL; assert.equal((validPhotoUrl('https://qualquer.com/a.jpg') as any).ok, true, 'sem o endereço do R2 configurado só exige https'); assert.equal((validPhotoUrl('http://qualquer.com/a.jpg') as any).ok, false, 'sem R2 configurado, http continua recusado');
  });
  await t('o próprio aluno grava a foto (link) e o banco guarda; apagar volta para null', async () => {
    let r = await put({ userId: 'aluno', photoUrl: OK }, tok('aluno')); assert.equal(r.status, 200); assert.equal(U.find((u: any) => u.id === 'aluno').photoUrl, OK);
    r = await put({ userId: 'aluno', photoUrl: null }, tok('aluno')); assert.equal(r.status, 200); assert.equal(U.find((u: any) => u.id === 'aluno').photoUrl, null);
  });
  await t('o coach do aluno grava (ver app do aluno); coach de outro aluno e aluno de outro aluno levam 403 e nada muda', async () => {
    let r = await put({ userId: 'aluno', photoUrl: OK }, tok('coach', 'COACH')); assert.equal(r.status, 200); assert.equal(U.find((u: any) => u.id === 'aluno').photoUrl, OK);
    U.find((u: any) => u.id === 'aluno').photoUrl = null;
    r = await put({ userId: 'aluno', photoUrl: OK }, tok('coach2', 'COACH')); assert.equal(r.status, 403); r = await put({ userId: 'aluno', photoUrl: OK }, tok('outro')); assert.equal(r.status, 403); assert.equal(U.find((u: any) => u.id === 'aluno').photoUrl, null);
  });
  await t('sem login (sem token) a foto é recusada com 401, mesmo mandando adminId no corpo; link ruim é 400', async () => {
    let r = await put({ userId: 'aluno', adminId: 'coach', photoUrl: OK }, null); assert.equal(r.status, 401); assert.equal(U.find((u: any) => u.id === 'aluno').photoUrl, null);
    r = await put({ userId: 'aluno', photoUrl: 'data:image/jpeg;base64,QUJD' }, tok('aluno')); assert.equal(r.status, 400); r = await put({ userId: 'aluno', photoUrl: 'https://x.com/a.jpg' }, tok('aluno')); assert.equal(r.status, 400); assert.equal(U.find((u: any) => u.id === 'aluno').photoUrl, null);
  });
  await t('trocar só o nome NÃO mexe na foto (sem photoUrl no corpo); a Início recebe o campo', async () => {
    U.find((u: any) => u.id === 'aluno').photoUrl = OK; const r = await put({ userId: 'aluno', name: 'Novo Nome' }, tok('aluno')); assert.equal(r.status, 200); const u = U.find((u: any) => u.id === 'aluno'); assert.equal(u.name, 'Novo Nome'); assert.equal(u.photoUrl, OK);
    assert.ok(/photoUrl: true/.test(fs.readFileSync('/home/user/fitos-final/app/api/user/home/route.ts', 'utf8')), '/api/user/home devolve photoUrl');
  });
  console.log(`\n${bad ? 'FALHOU' : 'OK'}: ${ok} ok, ${bad} falharam`); process.exit(bad ? 1 : 0);
})();
