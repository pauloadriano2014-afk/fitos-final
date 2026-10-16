import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET, PUT } from '/home/user/fitos-final/app/api/professional-profile/route';
const db = (prisma as any).__db;
const tok = (id: string, role = 'ADMIN') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const call = (fn: any, id: string | null, body?: any, role = 'ADMIN') => fn(new Request('http://x/p', { method: fn === PUT ? 'PUT' : 'GET', headers: { ...(id ? { authorization: 'Bearer ' + tok(id, role) } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }));
db.users = { nutriA: { name: 'Dra. Ana Souza' }, coachB: { name: 'Bruno' } };
(async () => {
  let r = await call(GET, null); assert.equal(r.status, 401);
  r = await call(GET, 'aluno1', undefined, 'USER'); assert.equal(r.status, 403);
  r = await call(PUT, 'aluno1', { title: 'Nutricionista', registry: 'CRN-3 1' }, 'USER'); assert.equal(r.status, 403);
  r = await call(GET, 'nutriA'); let j = await r.json(); assert.deepEqual([r.status, j.available, j.name, j.title, j.registry], [200, true, 'Dra. Ana Souza', null, null]);
  console.log('OK  401 sem token / 403 aluno; profissional sem registro recebe title/registry null e o próprio nome');

  r = await call(PUT, 'nutriA', { title: 'Nutricionista', registry: 'CRN-3 12345' }); j = await r.json(); assert.deepEqual([r.status, j.title, j.registry], [200, 'Nutricionista', 'CRN-3 12345']);
  r = await call(GET, 'nutriA'); j = await r.json(); assert.deepEqual([j.title, j.registry], ['Nutricionista', 'CRN-3 12345']);
  r = await call(GET, 'coachB'); j = await r.json(); assert.deepEqual([j.title, j.registry, j.name], [null, null, 'Bruno']);        // cada um vê só o seu
  console.log('OK  grava e lê o próprio registro; outro profissional não vê o de ninguém');

  r = await call(PUT, 'nutriA', { title: '<b>Educador Físico</b>', registry: 'CREF 012345-G/SP"><script>alert(1)</script>' }); j = await r.json();
  assert.equal(j.title, 'Educador Físico');
  assert.ok(!/[<>"&]/.test(j.title + j.registry), 'sem < > " &'); assert.ok(j.title.includes('Educador Físico')); assert.ok(j.registry.startsWith('CREF 012345-G/SP'));
  r = await call(PUT, 'nutriA', { title: 'x'.repeat(200), registry: 'y'.repeat(200) }); j = await r.json(); assert.equal(j.title.length, 40); assert.equal(j.registry.length, 40);
  r = await call(PUT, 'nutriA', { title: 'Nutricionista Esportiva', registry: 'CRN-3 12.345 (SP)' }); j = await r.json(); assert.deepEqual([j.title, j.registry], ['Nutricionista Esportiva', 'CRN-3 12.345 (SP)']);
  r = await call(PUT, 'nutriA', 'x'.repeat(3000)); assert.equal(r.status, 413); r = await call(PUT, 'nutriA', '{ruim'); assert.equal(r.status, 400);
  console.log('OK  texto limpo (sem < > " &), acentos e pontuação de registro preservados (CRN-3 12.345 (SP)), limite de 40, corpo grande 413, JSON inválido 400');

  r = await call(PUT, 'nutriA', { title: '', registry: '' }); j = await r.json(); assert.deepEqual([j.title, j.registry], [null, null]); assert.equal(db.rows.nutriA, undefined);
  db.missing = true; r = await call(GET, 'nutriA'); j = await r.json(); assert.deepEqual([r.status, j.available, j.name], [200, false, 'Dra. Ana Souza']);
  r = await call(PUT, 'nutriA', { title: 'Nutricionista', registry: 'CRN-3 1' }); assert.equal(r.status, 503); assert.ok(/atualização do banco/.test((await r.json()).error));
  console.log('OK  apagar; antes do db push: GET available:false (com o nome), PUT 503 com mensagem clara');
  console.log('\nTODOS OS TESTES DO PERFIL PROFISSIONAL PASSARAM');
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
