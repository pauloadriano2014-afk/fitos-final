// scripts/ibge-composicao/importar.ts
// 📊 Importa a Tabela de Composição Nutricional do IBGE (POF 2008-2009) para o catálogo de alimentos (tabela Food, source = 'IBGE')
// a partir de prisma/data/ibge/ibge-composicao.json (gerado do PDF oficial por scripts/ibge-composicao/gerador/).
//
// COMO USAR (na pasta do fitos-final, com a DATABASE_URL de produção no .env):
//   npx tsx scripts/ibge-composicao/importar.ts                     # SIMULAÇÃO: mostra o que faria, não grava nada
//   npx tsx scripts/ibge-composicao/importar.ts --aplicar           # grava de verdade
//   npx tsx scripts/ibge-composicao/importar.ts --remover           # simulação de REMOVER tudo que veio do IBGE
//   npx tsx scripts/ibge-composicao/importar.ts --remover --aplicar # remove de verdade (as dietas já salvas não mudam: guardam os valores)
//   (opcional) --json caminho/outro.json
//
// SEGURANÇA
//   - Não precisa de `prisma db push`: usa as tabelas que já existem (Food e, se existir, FoodPortion).
//   - Só mexe em alimentos com source = 'IBGE' (ids "ibge-<código POF>-<preparo>"). TACO e os alimentos do time nunca são tocados.
//   - A busca, a voz e a IA de dieta só enxergam TACO e alimentos do time: os do IBGE só aparecem na aba "IBGE" do seletor.
//   - Reexecutar é seguro (idempotente): cria o que falta e atualiza o que mudou.
//   - Medidas caseiras (FoodPortion, escopo GLOBAL, origem IBGE): nunca sobrescreve medida manual ou de coach/nutri.
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const jsonArg = args.indexOf('--json');
const cliOptions = {
  apply: args.includes('--aplicar'),
  remove: args.includes('--remover'),
  jsonPath: jsonArg >= 0 ? args[jsonArg + 1] : join(__dirname, '../../prisma/data/ibge/ibge-composicao.json'),
};
export type Options = typeof cliOptions;
const CHUNK = 300;

const SRC_SHORT: Record<number, string> = { 1: 'NDSR (EUA)', 2: 'TACO', 3: 'Regional (Min. Saúde)', 4: 'Tabela portuguesa', 5: 'Culinária goiana', 6: 'Pacheco', 7: 'Rótulo', 8: 'Mista (receita)', 9: 'INPA' };

type Entry = {
  id: string; code: string; label: string; category: string;
  kcal: number; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null;
  src: { code: number | null; desc: string }; portions: Record<string, number> | null;
};

/** Texto que aparece sob o nome no seletor: de onde veio o valor e quais macros o IBGE não informa. */
export function subcategoryOf(e: Entry): string {
  const src = (e.src.code != null && SRC_SHORT[e.src.code]) || 'Fonte não informada';
  const miss = [e.protein == null ? 'P' : '', e.carbs == null ? 'C' : '', e.fat == null ? 'G' : ''].filter(Boolean);
  return miss.length ? `${src} · sem dado: ${miss.join(', ')}` : src;
}

export function foodRow(e: Entry) {
  return {
    id: e.id, source: 'IBGE', externalId: e.id, teamId: null as string | null,
    name: e.label, category: e.category, subcategory: subcategoryOf(e), baseUnit: 'g',
    kcal: e.kcal, protein: e.protein ?? 0, carbs: e.carbs ?? 0, fat: e.fat ?? 0, fiber: e.fiber, isActive: true,
  };
}
const same = (a: any, b: any) => ['name', 'category', 'subcategory', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'isActive'].every((k) => (a[k] ?? null) === (b[k] ?? null));
const chunks = <T,>(l: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
const missingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist/i.test(String(e?.message || ''));

async function removeAll({ apply }: Options, db: PrismaClient) {
  const foods = await db.food.findMany({ where: { source: 'IBGE' }, select: { id: true } });
  console.log(`Modo: ${apply ? 'REMOVER' : 'SIMULAÇÃO de remoção (nada é apagado)'} — ${foods.length} alimentos do IBGE no banco.`);
  let portions = 0;
  try {
    portions = await (db as any).foodPortion.count({ where: { foodId: { in: foods.map((f) => f.id) } } });
  } catch (e: any) { if (!missingTable(e)) throw e; }
  console.log(`Medidas caseiras ligadas a eles: ${portions}.`);
  if (apply) {
    try { for (const c of chunks(foods.map((f) => f.id))) await (db as any).foodPortion.deleteMany({ where: { foodId: { in: c } } }); } catch (e: any) { if (!missingTable(e)) throw e; }
    const r = await db.food.deleteMany({ where: { source: 'IBGE' } });
    console.log(`Removidos ${r.count} alimentos. As dietas já salvas não mudam.`);
  } else console.log('\nNada foi apagado. Para remover: npx tsx scripts/ibge-composicao/importar.ts --remover --aplicar');
}

export async function main(o: Options = cliOptions, db: PrismaClient = prisma) {
  const { apply } = o;
  if (o.remove) return removeAll(o, db);
  const data = JSON.parse(fs.readFileSync(o.jsonPath, 'utf8')) as { entradas: Entry[]; excluidas?: unknown[] };
  const entries = data.entradas;
  console.log(`Arquivo: ${entries.length} alimentos (${(data.excluidas || []).length} ficaram de fora por não terem energia). Modo: ${apply ? 'GRAVAR' : 'SIMULAÇÃO (nada é gravado)'}`);
  const ids = entries.map((e) => e.id);
  if (new Set(ids).size !== ids.length) throw new Error('ids repetidos no arquivo');

  // ── alimentos ──
  const existing = await db.food.findMany({
    where: { source: 'IBGE' },
    select: { id: true, name: true, category: true, subcategory: true, kcal: true, protein: true, carbs: true, fat: true, fiber: true, isActive: true },
  });
  const exMap = new Map(existing.map((f) => [f.id, f]));
  const toCreate: ReturnType<typeof foodRow>[] = [], toUpdate: ReturnType<typeof foodRow>[] = [];
  let unchanged = 0;
  for (const e of entries) {
    const row = foodRow(e), ex = exMap.get(e.id);
    if (!ex) toCreate.push(row); else if (!same(row, ex)) toUpdate.push(row); else unchanged++;
  }
  const obsolete = existing.filter((f) => !ids.includes(f.id));
  if (apply) {
    for (const c of chunks(toCreate)) await db.food.createMany({ data: c, skipDuplicates: true });
    for (const c of chunks(toUpdate, 100)) {
      await db.$transaction(c.map((r) => db.food.update({ where: { id: r.id }, data: { name: r.name, category: r.category, subcategory: r.subcategory, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, isActive: true } })));
    }
  }
  console.log(`\nAlimentos: ${apply ? 'criados' : 'criaria'} ${toCreate.length}, ${apply ? 'atualizados' : 'atualizaria'} ${toUpdate.length}, ${unchanged} já estavam iguais.`);
  if (obsolete.length) console.log(`  ⚠ ${obsolete.length} alimentos do IBGE no banco não estão mais no arquivo (não foram apagados): ${obsolete.slice(0, 5).map((f) => f.name).join(' | ')}`);

  // ── medidas caseiras (FoodPortion GLOBAL, origem IBGE) ──
  let pNew = 0, pUpd = 0, pSame = 0, pKept = 0;
  try {
    const exP = [] as Array<{ id: string; foodId: string; unit: string; source: string; grams: number }>;
    for (const c of chunks(ids, 500)) exP.push(...(await (db as any).foodPortion.findMany({ where: { scope: 'GLOBAL', foodId: { in: c } }, select: { id: true, foodId: true, unit: true, source: true, grams: true } })));
    const pMap = new Map(exP.map((p) => [`${p.foodId}|${p.unit}`, p]));
    const newP: any[] = [], updP: Array<{ id: string; grams: number }> = [];
    for (const e of entries) {
      for (const [unit, g] of Object.entries(e.portions || {})) {
        if (!(g > 0) || g > 5000) continue;
        const ex = pMap.get(`${e.id}|${unit}`);
        if (ex && ex.source !== 'IBGE') { pKept++; continue; }
        if (ex && Math.abs(ex.grams - g) < 1e-9) { pSame++; continue; }
        if (ex) { updP.push({ id: ex.id, grams: g }); pUpd++; } else { newP.push({ foodId: e.id, scope: 'GLOBAL', unit, grams: g, source: 'IBGE', note: 'IBGE POF 2008-2009' }); pNew++; }
      }
    }
    if (apply) {
      for (const c of chunks(newP)) await (db as any).foodPortion.createMany({ data: c, skipDuplicates: true });
      for (const c of chunks(updP, 100)) await db.$transaction(c.map((u) => (db as any).foodPortion.update({ where: { id: u.id }, data: { grams: u.grams } })));
    }
    console.log(`Medidas caseiras: ${apply ? 'criadas' : 'criaria'} ${pNew}, ${apply ? 'atualizadas' : 'atualizaria'} ${pUpd}, ${pSame} já estavam iguais, ${pKept} preservadas (já tinham medida manual/de coach).`);
  } catch (e: any) {
    if (!missingTable(e)) throw e;
    console.log('Medidas caseiras: a tabela FoodPortion ainda não existe no banco (rode "npx prisma db push" e este comando de novo para trazê-las). Os alimentos foram tratados normalmente.');
  }
  if (!apply) console.log('\nNada foi gravado. Para gravar: npx tsx scripts/ibge-composicao/importar.ts --aplicar');
}

// só roda quando chamado pela linha de comando (os testes importam foodRow/subcategoryOf sem executar)
if (process.argv[1] && /importar\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
