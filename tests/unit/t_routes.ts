import assert from 'assert';
import jwt from 'jsonwebtoken';
import { POST as interpretar } from '/home/user/fitos-final/app/api/ai/treino-por-voz/interpretar/route';
import { POST as transcrever } from '/home/user/fitos-final/app/api/ai/treino-por-voz/transcrever/route';


process.env.ANTHROPIC_API_KEY = 'x'; process.env.OPENAI_API_KEY = 'x';
const PAULO = '3c82f763-66b4-48da-836e-16817d4f57c0';
const tok = (id: string, role='ADMIN') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const req = (path: string, body: any, token?: string) => new Request('http://x/'+path, { method:'POST',
  headers: { 'content-type':'application/json', ...(token ? { authorization: 'Bearer '+token } : {}) }, body: JSON.stringify(body) });
const tool = (input: any) => ({ content: [{ type: 'tool_use', name: 'registrar_treino', input }] });

const DITADO = 'Agachamento livre 3 séries de 15, 12 e 10 com dropset na última, 60 segundos de descanso. Leg press 45, 3x8 a 10, 60 segundos e rest pause na última. Búlgaro no Smith 3x10, 60 segundos. Cadeira extensora 10 séries método GVT.';
const IA_OK = tool({ exercicios: [
  { nome_falado: 'agachamento livre', descanso_seg: 60, blocos: [{series:1,reps:'15'},{series:1,reps:'12'},{series:1,reps:'10',tecnica:'DROPSET'}] },
  { nome_falado: 'leg press 45', descanso_seg: 60, blocos: [{series:2,reps:'8 a 10'},{series:1,reps:'8 a 10',tecnica:'RESTPAUSE'}] },
  { nome_falado: 'búlgaro no Smith', descanso_seg: 60, blocos: [{series:3,reps:'10'}] },
  { nome_falado: 'cadeira extensora', tecnica_geral: 'GVT' },
]});

(async () => {
  let r: Response, j: any;

  // 1) sem token / não-master
  r = await interpretar(req('i', { text: DITADO })); assert.equal(r.status, 401, 'sem token deve dar 401');
  (globalThis as any).__USERS = { 'coach-parceiro': { role: 'COACH', accountStatus: 'ACTIVE', active: true }, 'coach-pausado': { role: 'COACH', accountStatus: 'PAUSED', active: true }, 'aluno-qualquer': { role: 'USER', accountStatus: 'ACTIVE', active: true } };
  r = await interpretar(req('i', { text: DITADO }, tok('aluno-qualquer','USER'))); assert.equal(r.status, 403, 'aluno deve dar 403'); assert.equal((await r.json()).code, 'COACH_ONLY');
  r = await interpretar(req('i', { text: DITADO }, tok('coach-pausado','COACH'))); assert.equal(r.status, 403, 'coach pausado deve dar 403');
  r = await interpretar(req('i', { text: ' ' }, tok('coach-parceiro','COACH'))); assert.equal(r.status, 400, 'coach parceiro ativo passa da trava (a voz foi liberada pra todo coach)');
  console.log('OK  401 sem token / 403 aluno e coach pausado / coach parceiro ativo liberado');

  // 2) validação de texto
  r = await interpretar(req('i', { text: ' ' }, tok(PAULO))); assert.equal(r.status, 400);
  r = await interpretar(req('i', { text: 'x'.repeat(4001) }, tok(PAULO))); assert.equal(r.status, 400);
  console.log('OK  texto vazio/gigante -> 400');

  // 3) caminho feliz com o ditado do Paulo
  let calls: any[] = [];
  (globalThis as any).__LLM = async (a: any) => { calls.push(a.model); return IA_OK; };
  r = await interpretar(req('i', { adminId: PAULO, text: DITADO }, tok(PAULO)));
  j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.deepEqual(calls, ['claude-haiku-4-5'], 'só o Haiku deve ser chamado');
  const [ag, lp, bu, ex] = j.items;
  console.log('\n--- resultado do ditado ---');
  for (const it of j.items) console.log(`${it.status.padEnd(6)} ${String(it.match?.name).padEnd(24)} ` + it.blocks.map((b:any)=>`${b.sets}x${b.reps}${b.technique?'['+b.technique+']':''}/${b.restTime}s`).join(' + ') + (it.assumed.length?`   assumido:${it.assumed.join(',')}`:''));
  assert.equal(ag.status,'SURE'); assert.equal(ag.match.name,'Agachamento Livre');
  assert.deepEqual(ag.blocks.map((b:any)=>[b.sets,b.reps,b.restTime,b.technique]), [['1','15','60',''],['1','12','60',''],['1','10','60','DROPSET']]);
  assert.deepEqual(ag.assumed, []);
  assert.equal(lp.match.name,'Leg press 45°');
  assert.deepEqual(lp.blocks.map((b:any)=>[b.sets,b.reps,b.restTime,b.technique]), [['2','8-10','60',''],['1','8-10','60','RESTPAUSE']]);
  assert.equal(bu.match.name,'Búlgaro no Smith');
  assert.deepEqual(bu.blocks.map((b:any)=>[b.sets,b.reps,b.restTime,b.technique]), [['3','10','60','']]);
  assert.equal(ex.match.name,'Cadeira Extensora');
  assert.deepEqual(ex.blocks.map((b:any)=>[b.sets,b.reps,b.restTime,b.technique]), [['10','10','60','GVT']]);
  assert.deepEqual(ex.assumed.sort(), ['reps','rest','sets']);
  console.log('OK  ditado completo (GVT padrão = 10x10, marcado como assumido)');

  // 4) GVT flexível: "GVT 6x10" e descanso global
  (globalThis as any).__LLM = async () => tool({ descanso_padrao_seg: 45, exercicios: [
    { nome_falado: 'cadeira extensora', tecnica_geral: 'GVT', blocos: [{ series: 6, reps: '10' }] },
    { nome_falado: 'mesa flexora', tecnica_geral: 'GVT', blocos: [{ series: 8 }] },
    { nome_falado: 'stiff', blocos: [{ series: 3, reps: 'até a falha' }] },
  ]});
  r = await interpretar(req('i', { text: 'x GVT 6x10' }, tok(PAULO))); j = await r.json();
  const g = j.items.map((i:any)=>i.blocks.map((b:any)=>`${b.sets}x${b.reps}/${b.restTime}s${b.technique?'['+b.technique+']':''}`).join('+'));
  console.log('\nGVT flexível ->', g.join('  |  '));
  assert.deepEqual(g, ['6x10/45s[GVT]', '8x10/45s[GVT]', '3xFalha/45s']);
  assert.deepEqual(j.items[0].assumed, []); // falou tudo (séries, reps e descanso global)
  assert.deepEqual(j.items[1].assumed, ['reps']);
  console.log('OK  "GVT" -> 10x10 | "GVT 6x10" -> 6x10 | "GVT 8 séries" -> 8x10 | descanso global respeitado');

  // 5) blocos idênticos são unidos; técnica desconhecida vira aviso; cardio recebe padrão
  (globalThis as any).__LLM = async () => tool({ exercicios: [
    { nome_falado: 'supino reto com halteres', blocos: [{series:1,reps:'10'},{series:1,reps:'10'},{series:1,reps:'10'}], descanso_seg: 90 },
    { nome_falado: 'rosca direta', tecnica_geral: 'OUTRA', observacao: 'pausa de 2s no topo' },
    { nome_falado: 'correr na esteira' },
    { nome_falado: 'exercício xyz que não existe' },
  ]});
  r = await interpretar(req('i', { text: 'qualquer coisa' }, tok(PAULO))); j = await r.json();
  const [su, ro, es, nx] = j.items;
  assert.deepEqual(su.blocks.map((b:any)=>[b.sets,b.reps,b.restTime]), [['3','10','90']]); assert.equal(su.status,'SURE');
  assert.equal(ro.status,'CHOOSE'); assert.ok(ro.warnings.length===1, 'OUTRA gera aviso'); assert.ok(ro.observation.includes('pausa'));
  assert.equal(es.match.category,'Cardio'); assert.deepEqual(es.blocks.map((b:any)=>[b.sets,b.reps]), [['3','12']]); assert.deepEqual(es.assumed.sort(), ['reps','rest','sets']);
  assert.equal(nx.status,'NONE'); assert.equal(nx.match,null);
  console.log('OK  blocos iguais unidos | técnica OUTRA vira aviso | cardio mantém o falado (app troca pelo padrão) | inexistente = NONE');

  // 6) fallback: Haiku devolve lixo -> Sonnet 5.5 (sem forçar ferramenta) resolve
  calls = [];
  (globalThis as any).__LLM = async (a: any) => { calls.push(`${a.model}:${a.forced?'forced':'auto'}`); return a.model==='claude-haiku-4-5' ? { content: [{ type:'text', text:'oi' }] } : IA_OK; };
  r = await interpretar(req('i', { text: DITADO }, tok(PAULO))); j = await r.json();
  assert.equal(r.status,200); assert.deepEqual(calls, ['claude-haiku-4-5:forced','claude-sonnet-5-5:auto']);
  console.log('OK  fallback Haiku -> Sonnet 5.5 (auto, sem forçar ferramenta)');

  // 7) IA fora do ar nas duas -> 502 com mensagem amigável
  (globalThis as any).__LLM = async () => new Error('boom');
  r = await interpretar(req('i', { text: DITADO }, tok(PAULO))); j = await r.json();
  assert.equal(r.status,502); assert.ok(!/boom/.test(j.error), 'não vazar erro interno'); console.log('OK  falha total -> 502 sem vazar detalhe');

  // 8) transcrição
  const fd = (name: string, size=2000, type='audio/m4a') => { const f = new FormData(); f.append('file', new File([new Uint8Array(size)], name, { type })); return f; };
  const treq = (form: FormData|null, token?: string) => new Request('http://x/t', { method:'POST', headers: token?{authorization:'Bearer '+token}:{}, body: form ?? new FormData() });
  r = await transcrever(treq(fd('a.m4a'), tok('aluno','USER'))); assert.equal(r.status,403);
  r = await transcrever(treq(null, tok('coach-parceiro','COACH'))); assert.equal(r.status,400, 'coach parceiro ativo transcreve');
  r = await transcrever(treq(null, tok(PAULO))); assert.equal(r.status,400);
  r = await transcrever(treq(fd('a.m4a', 11*1024*1024), tok(PAULO))); assert.equal(r.status,413);
  r = await transcrever(treq(fd('a.exe',100,'application/x-msdownload'), tok(PAULO))); assert.equal(r.status,415);
  r = await transcrever(treq(fd('a.m4a',0), tok(PAULO))); assert.equal(r.status,400);
  r = await transcrever(treq(fd('treino.m4a'), tok(PAULO))); j = await r.json();
  assert.equal(r.status,200); assert.equal(j.text,'agachamento livre'); 
  const w = (globalThis as any).__WHISPER_ARGS; assert.equal(w.model,'whisper-1'); assert.equal(w.language,'pt'); assert.equal(w.file.name,'treino.m4a');
  // blob do navegador sem extensão no nome, só o mime
  r = await transcrever(treq(fd('blob', 500, 'audio/webm;codecs=opus'), tok(PAULO))); j = await r.json(); assert.equal(r.status,200);
  assert.equal((globalThis as any).__WHISPER_ARGS.file.name,'treino.webm');
  (globalThis as any).__WHISPER_TEXT = '   '; r = await transcrever(treq(fd('a.m4a'), tok(PAULO))); assert.equal(r.status,422);
  console.log('OK  transcrição: 403 / 400 / 413 / 415 / vazio / m4a / webm sem extensão / texto vazio -> 422');

  console.log('\nTODOS OS TESTES PASSARAM');
})().catch(e => { console.error('\nFALHOU:', e.message); process.exit(1); });
