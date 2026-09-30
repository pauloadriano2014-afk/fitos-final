// scripts/voz-eval/run.ts
// 🎙️ Avaliação do "montar treino por voz": compara modelos de IA no mesmo conjunto
// de casos, usando o MESMO código de produção (normalizar -> casar com a
// biblioteca -> montar blocos). Só a IA da extração muda entre as colunas.
//
//   npx tsx scripts/voz-eval/run.ts --check                     # teste do teste (offline, grátis)
//   npx tsx scripts/voz-eval/run.ts --export-cases              # gera CASOS.md p/ revisar os casos
//   npx tsx scripts/voz-eval/run.ts --limit 3 --yes             # piloto pago (3 casos por modelo)
//   npx tsx scripts/voz-eval/run.ts --yes                       # rodada completa
//   npx tsx scripts/voz-eval/run.ts --models claude:claude-haiku-4-5 --reps 3 --yes
//
// Sem --yes ele só mostra o plano e a estimativa e NÃO chama nenhuma API paga.
// Precisa de ANTHROPIC_API_KEY (claude:*) e/ou GEMINI_API_KEY (gemini:*).
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex, type LibItem } from '../../lib/voiceWorkout/match';
import { normalizeParse } from '../../lib/voiceWorkout/normalize';
import { buildReviewItems, type ReviewItem } from '../../lib/voiceWorkout/pipeline';
import { PAULO_ID } from '../../lib/masterIds';
import { CASES, type EvalCase } from './cases';
import { gradeCase, wilson, fmt, type CaseGrade } from './grade';
import { makeProvider, costUsd, ASSUMED_TOKENS, PRICES, type Provider } from './providers';

// ───────────────────────────── argumentos ─────────────────────────────
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const DEFAULT_MODELS = 'claude:claude-haiku-4-5,claude:claude-sonnet-5-5,gemini:gemini-3.8-flash';
const REPS = Math.max(1, parseInt(opt('reps', '1')!, 10));
const CONCURRENCY = Math.max(1, parseInt(opt('concurrency', '4')!, 10));
const TIMEOUT_MS = Math.max(5, parseInt(opt('timeout-s', '60')!, 10)) * 1000;
const RUN = opt('run', 'run')!;
const OUT_DIR = path.resolve(__dirname, 'out', RUN);

// ───────────────────────────── biblioteca e casos ─────────────────────────────
function loadIndex() {
  const rows: any[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../Exercise.json'), 'utf8'));
  // mesmo escopo da rota: exercícios do master + globais (sem dono)
  const lib: LibItem[] = rows
    .filter((e) => e.coachId === PAULO_ID || e.coachId == null)
    .map((e) => ({ id: e.id, name: e.name, category: e.category, subCategory: e.subCategory, videoUrl: e.videoUrl, coachId: e.coachId }));
  return { index: buildIndex(lib, PAULO_ID), size: lib.length };
}

function expectedFor(c: EvalCase, index: ReturnType<typeof buildIndex>): ReviewItem[] {
  const parsed = normalizeParse(c.ideal);
  if (!parsed) throw new Error(`${c.id}: "ideal" inválido`);
  return buildReviewItems(parsed.exercises, index);
}

/** Um caso cujo esperado não casa com UM exercício certo da biblioteca é bug do dataset, não do modelo. */
function validateCases(index: ReturnType<typeof buildIndex>) {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of CASES) {
    if (seen.has(c.id)) problems.push(`${c.id}: id duplicado`);
    seen.add(c.id);
    const exp = expectedFor(c, index);
    if (!exp.length) problems.push(`${c.id}: esperado vazio`);
    exp.forEach((it, i) => {
      if (it.status !== 'SURE') problems.push(`${c.id} #${i + 1} "${it.spoken}": esperado casa como ${it.status}, não SURE (${it.candidates.slice(0, 2).map((x) => x.name).join(' | ') || 'sem candidatos'})`);
      if (it.warnings.length) problems.push(`${c.id} #${i + 1}: avisos na resposta ideal: ${it.warnings.join('; ')}`);
    });
  }
  return problems;
}

const human = (it: ReviewItem) =>
  `${it.match?.name ?? `??? (${it.spoken})`} — ${it.blocks.map(fmt).join(' + ')}${it.assumed.length ? `  (assumido: ${it.assumed.join(', ')})` : ''}`;

function exportCases(index: ReturnType<typeof buildIndex>) {
  const L: string[] = [];
  L.push('# Casos da avaliação — montar treino por voz', '');
  L.push(`${CASES.length} casos. **Você é quem valida**: leia cada fala e a coluna “como o sistema deve entender”. Se algum estiver errado, ou se faltar um tipo de fala que você usa, me diga o número do caso.`, '');
  L.push('Legenda do esperado: `3x12[DROPSET]/60s` = 3 séries de 12 com drop set e 60 s de descanso. “assumido” = o coach não falou e o sistema completa com o padrão (3 séries, 12 reps, 60 s; GVT = 10×10).', '');
  L.push('| caso | origem | tags | o que testa |', '|---|---|---|---|');
  for (const c of CASES) L.push(`| ${c.id} | ${c.origem} | ${c.tags.join(', ')} | ${c.why} |`);
  L.push('');
  for (const c of CASES) {
    const exp = expectedFor(c, index);
    L.push(`## ${c.id} — ${c.why}`, '', `Origem: **${c.origem}** · tags: ${c.tags.join(', ')}`, '', 'Fala (como a transcrição escreveria):', '', '````', c.text, '````', '', 'Como o sistema deve entender:', '');
    exp.forEach((it, i) => L.push(`${i + 1}. ${human(it)}${String(it.match?.category).toUpperCase() === 'CARDIO' ? '  _(cardio: o app usa os valores padrão de cardio)_' : ''}`));
    L.push('');
  }
  const out = path.resolve(__dirname, 'CASOS.md');
  fs.writeFileSync(out, L.join('\n'));
  console.log(`CASOS.md gerado (${CASES.length} casos): ${out}`);
}

// ───────────────────────────── execução ─────────────────────────────
type Row = {
  variant: string; model: string; case_id: string; rep: number; status: 'ok';
  tags: string[]; grade: CaseGrade;
  usage: { inputTokens: number; outputTokens: number; ms: number; cost_usd: number };
  actual: string[];
};
type ErrRow = { variant: string; case_id: string; rep: number; failure: 'timeout' | 'api_error' | 'parse_error'; message: string; attempt: number };

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`estourou ${ms / 1000}s`), { timeout: true })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function runVariants(providers: Provider[], cases: EvalCase[], index: ReturnType<typeof buildIndex>, dir: string, quiet = false) {
  fs.mkdirSync(dir, { recursive: true });
  const resultsPath = path.join(dir, 'results.jsonl');
  const errorsPath = path.join(dir, 'errors.jsonl');
  const done = new Set<string>();
  if (fs.existsSync(resultsPath)) {
    for (const line of fs.readFileSync(resultsPath, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line) as Row; done.add(`${r.variant}|${r.case_id}|${r.rep}`);
    }
  }
  const expectedById = new Map(cases.map((c) => [c.id, expectedFor(c, index)]));
  const jobs: Array<{ p: Provider; c: EvalCase; rep: number }> = [];
  for (const p of providers) for (const c of cases) for (let rep = 0; rep < REPS; rep++) if (!done.has(`${p.spec}|${c.id}|${rep}`)) jobs.push({ p, c, rep });

  let n = 0;
  await pool(jobs, CONCURRENCY, async ({ p, c, rep }) => {
    let lastErr: ErrRow | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await withTimeout(p.run(c.text, c.id), TIMEOUT_MS);
        const parsed = normalizeParse(r.raw);
        const actual = parsed ? buildReviewItems(parsed.exercises, index) : [];
        const grade = gradeCase(actual, expectedById.get(c.id)!);
        const row: Row = {
          variant: p.spec, model: p.model, case_id: c.id, rep, status: 'ok', tags: c.tags, grade,
          usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms, cost_usd: costUsd(p.model, r.inputTokens, r.outputTokens) },
          actual: actual.map(human),
        };
        fs.appendFileSync(resultsPath, JSON.stringify(row) + '\n');
        n++;
        if (!quiet) console.log(`[${n}/${jobs.length}] ${p.spec} ${c.id}#${rep} ${grade.pass ? 'ok ' : 'ERRO'}${grade.pass ? '' : ' — ' + grade.diffs[0]}`);
        return;
      } catch (e: any) {
        lastErr = { variant: p.spec, case_id: c.id, rep, attempt, failure: e?.timeout ? 'timeout' : 'api_error', message: String(e?.message || e).slice(0, 300) };
        fs.appendFileSync(errorsPath, JSON.stringify(lastErr) + '\n');
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000)); // espera com variação antes de tentar de novo
      }
    }
    n++;
    if (!quiet) console.log(`[${n}/${jobs.length}] ${p.spec} ${c.id}#${rep} FALHA DE EXECUÇÃO (${lastErr?.failure}): ${lastErr?.message}`);
  });
  return { resultsPath, errorsPath };
}

// ───────────────────────────── resumo ─────────────────────────────
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const acc = (ok: number, total: number) => (total ? pct(ok / total) : '—');

function summarize(dir: string): string {
  const resultsPath = path.join(dir, 'results.jsonl');
  const errorsPath = path.join(dir, 'errors.jsonl');
  const rows: Row[] = fs.existsSync(resultsPath) ? fs.readFileSync(resultsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const errs: ErrRow[] = fs.existsSync(errorsPath) ? fs.readFileSync(errorsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const variants = Array.from(new Set(rows.map((r) => r.variant)));

  const L: string[] = ['# Resultado da avaliação — montar treino por voz', ''];
  L.push(`Casos: ${CASES.length} · repetições por caso: ${REPS} · biblioteca: Exercise.json (escopo do Paulo)`, '');
  L.push('| modelo | acerto total (IC 95%) | exercício certo | séries | reps | descanso | técnica | vazio | erros de execução | tokens (ent/saí) | latência média / p95 | US$/treino | US$/100 treinos |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const details: string[] = [];
  for (const v of variants) {
    const R = rows.filter((r) => r.variant === v);
    const sum = (f: (g: CaseGrade) => { ok: number; total: number }) => R.reduce((a, r) => ({ ok: a.ok + f(r.grade).ok, total: a.total + f(r.grade).total }), { ok: 0, total: 0 });
    const w = wilson(R.filter((r) => r.grade.pass).length, R.length);
    const nm = sum((g) => g.name), se = sum((g) => g.sets), re = sum((g) => g.reps), rs = sum((g) => g.rest), te = sum((g) => g.tech);
    const empty = R.filter((r) => r.grade.actualCount === 0).length;
    const nErr = errs.filter((e) => e.variant === v && !R.some((r) => r.case_id === e.case_id && r.rep === e.rep)).length;
    const avg = (f: (r: Row) => number) => (R.length ? R.reduce((a, r) => a + f(r), 0) / R.length : 0);
    const ms = R.map((r) => r.usage.ms).sort((a, b) => a - b);
    const p95 = ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : 0;
    const cost = avg((r) => r.usage.cost_usd);
    L.push(`| ${v} | **${pct(w.p)}** (${pct(w.lo)}–${pct(w.hi)}) n=${R.length} | ${acc(nm.ok, nm.total)} | ${acc(se.ok, se.total)} | ${acc(re.ok, re.total)} | ${acc(rs.ok, rs.total)} | ${acc(te.ok, te.total)} | ${empty} | ${nErr} | ${Math.round(avg((r) => r.usage.inputTokens))}/${Math.round(avg((r) => r.usage.outputTokens))} | ${Math.round(avg((r) => r.usage.ms))} ms / ${p95} ms | ${cost.toFixed(4)} | ${(cost * 100).toFixed(2)} |`);

    const failed = R.filter((r) => !r.grade.pass);
    details.push(`### ${v} — ${failed.length} de ${R.length} com divergência`, '');
    for (const r of failed) details.push(`- **${r.case_id}** (${r.tags.join(', ')}): ${r.grade.diffs.slice(0, 3).join(' · ')}`);
    if (!failed.length) details.push('- nenhuma divergência');
    details.push('');
  }
  L.push('', '“Acerto total” = o treino inteiro saiu exatamente como esperado (exercícios, séries, reps, descanso e técnica). Os demais são a taxa por campo. O intervalo mostra o quanto o número pode oscilar só por sorte com poucos casos: **diferenças menores que a sobreposição dos intervalos não devem decidir a escolha**.', '');
  L.push('## Divergências', '', ...details);
  L.push('_Preços (US$/1M tokens): ' + Object.entries(PRICES).map(([m, p]) => `${m} ${p.in}/${p.out}`).join(' · ') + '. Gemini: preço introdutório até 31/12/2026, dobra depois._');
  return L.join('\n');
}

// ───────────────────────────── modos ─────────────────────────────
async function main() {
  const { index, size } = loadIndex();
  const problems = validateCases(index);
  if (problems.length) {
    console.error('Problemas no conjunto de casos (corrigir antes de avaliar):\n - ' + problems.join('\n - '));
    process.exit(1);
  }

  if (flag('export-cases')) { exportCases(index); return; }

  let cases = CASES;
  if (opt('only')) { const ids = new Set(opt('only')!.split(',')); cases = cases.filter((c) => ids.has(c.id)); }
  if (opt('limit')) cases = cases.slice(0, parseInt(opt('limit')!, 10));

  const oracle = (id: string) => CASES.find((c) => c.id === id)!.ideal;

  // Teste do teste: gabarito perfeito deve dar ~100%, resposta vazia ~0% e erro de API não pode virar nota 0.
  if (flag('check')) {
    const dir = path.resolve(__dirname, 'out', '_check');
    fs.rmSync(dir, { recursive: true, force: true });
    const ps = await Promise.all(['oracle', 'null', 'sloppy', 'broken'].map((s) => makeProvider(s, oracle)));
    await runVariants(ps, CASES, index, dir, true);
    const rows: Row[] = fs.readFileSync(path.join(dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const errs = fs.readFileSync(path.join(dir, 'errors.jsonl'), 'utf8').split('\n').filter(Boolean).length;
    const rate = (v: string) => rows.filter((r) => r.variant === v && r.grade.pass).length / Math.max(1, rows.filter((r) => r.variant === v).length);
    const brokenRows = rows.filter((r) => r.variant === 'broken').length;
    console.log(`biblioteca: ${size} exercícios · casos: ${CASES.length} (todos com esperado único e certo)`);
    console.log(`oracle (gabarito):   ${pct(rate('oracle'))}   ← deve ser 100%`);
    console.log(`null (resposta vazia): ${pct(rate('null'))}   ← deve ser 0%`);
    console.log(`broken (erro de API):  ${brokenRows} notas gravadas, ${errs} erros em errors.jsonl   ← deve ser 0 notas e ${CASES.length * 2} erros (2 tentativas por caso)`);
    // "Desleixado" (esquece toda técnica) precisa perder nota SÓ na técnica.
    const sl = rows.filter((r) => r.variant === 'sloppy');
    const sum = (f: (g: CaseGrade) => { ok: number; total: number }) => sl.reduce((a, r) => ({ ok: a.ok + f(r.grade).ok, total: a.total + f(r.grade).total }), { ok: 0, total: 0 });
    const nameA = sum((g) => g.name), setsA = sum((g) => g.sets), techA = sum((g) => g.tech);
    console.log(`sloppy (esquece técnica): acerto total ${pct(rate('sloppy'))} | exercício ${acc(nameA.ok, nameA.total)} | séries ${acc(setsA.ok, setsA.total)} | técnica ${acc(techA.ok, techA.total)}   ← exercício deve ficar em 100% e a técnica cair (séries caem junto: sem a técnica o último bloco não se separa e o GVT perde as 10 séries)`);
    const sloppyOk = nameA.ok === nameA.total && techA.ok < techA.total && rate('sloppy') < 1 && rate('sloppy') > 0;
    const okAll = rate('oracle') === 1 && rate('null') === 0 && brokenRows === 0 && errs === CASES.length * 2 && sloppyOk;
    console.log(okAll ? '\nTESTE DO TESTE: OK' : '\nTESTE DO TESTE: FALHOU');
    process.exit(okAll ? 0 : 1);
  }

  // Avaliação de verdade
  const specs = opt('models', DEFAULT_MODELS)!.split(',').map((s) => s.trim()).filter(Boolean);
  const mock = (s: string) => ['oracle', 'null', 'sloppy', 'broken'].includes(s);
  const paid = specs.filter((s) => !mock(s));
  const calls = paid.length * cases.length * REPS;
  const estIn = calls ? paid.reduce((a, s) => a + cases.length * REPS * ASSUMED_TOKENS.in * (PRICES[s.split(':')[1]]?.in ?? 0), 0) / 1e6 : 0;
  const estOut = calls ? paid.reduce((a, s) => a + cases.length * REPS * ASSUMED_TOKENS.out * (PRICES[s.split(':')[1]]?.out ?? 0), 0) / 1e6 : 0;

  console.log(`Plano: ${cases.length} casos × ${REPS} repetição(ões) × ${paid.length} modelo(s) = ${calls} chamadas pagas`);
  console.log(`Modelos: ${paid.join(', ') || '(nenhum pago)'}`);
  console.log(`Estimativa de custo: ~US$ ${(estIn + estOut).toFixed(2)}  (ASSUME ~${ASSUMED_TOKENS.in} tokens de entrada e ~${ASSUMED_TOKENS.out} de saída por chamada — NÃO medido; modelos com raciocínio podem gastar mais).`);
  console.log(`Saída: ${OUT_DIR}`);
  if (paid.length && !flag('yes')) {
    console.log('\nNada foi chamado. Para rodar de verdade, repita o comando com --yes (dica: comece com --limit 3 --yes para medir o custo real).');
    process.exit(2);
  }

  const providers = await Promise.all(specs.map((s) => makeProvider(s, oracle)));
  await runVariants(providers, cases, index, OUT_DIR);
  const md = summarize(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, 'resumo.md'), md);
  console.log('\n' + md);
  console.log(`\nResumo salvo em ${path.join(OUT_DIR, 'resumo.md')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
