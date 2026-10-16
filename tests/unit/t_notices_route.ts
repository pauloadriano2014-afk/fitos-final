import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET } from '/home/user/fitos-final/app/api/notices/route';

const tok = (id: string) => jwt.sign({ id, role: 'USER', coachId: 'coach1' }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const get = (qs: string, token?: string) => new Request('http://x/api/notices?' + qs, { headers: token ? { authorization: 'Bearer ' + token } : {} });
const calls = (prisma as any).__calls as any[];

(async () => {
  let r = await GET(get('userId=aluno1&history=1')); assert.equal(r.status, 401, 'sem token = 401');

  calls.length = 0;
  r = await GET(get('userId=aluno1', tok('aluno1')));
  let j = await r.json(); assert.equal(r.status, 200);
  assert.deepEqual(j.map((n: any) => n.id), ['n3'], 'sem history = só o último ATIVO (igual a antes)');
  assert.deepEqual(calls[0].where, { coachId: 'coach1', active: true, date: { gte: new Date('2026-08-01T00:00:00Z') } }); assert.equal(calls[0].take, 1);
  console.log('OK  sem ?history o comportamento antigo continua (1 aviso ativo)');

  calls.length = 0;
  r = await GET(get('userId=aluno1&history=1&t=123', tok('aluno1')));
  j = await r.json(); assert.equal(r.status, 200);
  assert.deepEqual(j.map((n: any) => n.id), ['n3', 'n2', 'n1'], 'history devolve ativos e inativos, mais novo primeiro');
  assert.deepEqual(calls[0].where, { coachId: 'coach1', date: { gte: new Date('2026-08-01T00:00:00Z') } }, 'escopo = só avisos do coach do aluno, desde a entrada dele');
  assert.deepEqual(calls[0].orderBy, { date: 'desc' }); assert.equal(calls[0].take, 20);
  console.log('OK  ?history=1 devolve o histórico do coach do aluno (limite 20, mais novo primeiro)');

  // aluno só vê avisos enviados DEPOIS que a conta dele foi criada
  calls.length = 0;
  r = await GET(get('userId=recente&history=1', tok('recente'))); j = await r.json();
  assert.deepEqual(j.map((n: any) => n.id), ['n3', 'n2'], 'quem entrou em 15/09 não vê o aviso de 01/09');
  assert.deepEqual(calls[0].where.date.gte, new Date('2026-09-15T00:00:00Z'));
  r = await GET(get('userId=novissimo&history=1', tok('novissimo'))); assert.deepEqual(await r.json(), [], 'entrou depois de todos: lista vazia');
  r = await GET(get('userId=recente', tok('recente'))); j = await r.json();
  assert.deepEqual(j.map((n: any) => n.id), ['n3'], 'modo antigo (sem history) também respeita a data de entrada');
  r = await GET(get('userId=novissimo', tok('novissimo'))); assert.deepEqual(await r.json(), [], 'modo antigo: aluno novíssimo não vê aviso ativo anterior à entrada');
  calls.length = 0;
  r = await GET(get('userId=semdata&history=1', tok('semdata'))); j = await r.json();
  assert.equal(j.length, 3, 'sem createdAt: não filtra'); assert.equal(calls[0].where.date, undefined);
  console.log('OK  só avisos enviados depois da entrada do aluno (history e modo antigo; sem data = sem filtro)');

  r = await GET(get('userId=aluno1&history=1', tok('outro-aluno')));
  assert.equal(r.status, 403, 'aluno não lê o histórico de outro aluno');
  r = await GET(get('userId=orfao&history=1', tok('orfao')));
  assert.deepEqual(await r.json(), [], 'sem coach = lista vazia');
  console.log('OK  outro aluno = 403; aluno sem coach = []');
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
