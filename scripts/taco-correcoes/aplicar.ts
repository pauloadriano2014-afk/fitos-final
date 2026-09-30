// scripts/taco-correcoes/aplicar.ts
// 🔧 Corrige no catálogo os pontos em que a TACO do app difere do livro (TACO 4ª edição revisada e ampliada, NEPA/Unicamp, 2011).
// A lista (correcoes.json) sai da conferência alimento a alimento contra o PDF: 589 alimentos casados, 573 idênticos.
//
// COMO USAR (na pasta do fitos-final, com a DATABASE_URL de produção no .env):
//   npx tsx scripts/taco-correcoes/aplicar.ts                      # SIMULAÇÃO: mostra o que mudaria, não grava nada
//   npx tsx scripts/taco-correcoes/aplicar.ts --aplicar            # corrige o catálogo
//   npx tsx scripts/taco-correcoes/aplicar.ts --aplicar --corrigir-dietas   # também renomeia, nas dietas JÁ salvas, os itens com o nome errado ("L" -> "Feijoada")
//
// SEGURANÇA
//   - Não precisa de `prisma db push`.
//   - Só mexe em alimentos com source = 'TACO'. Só troca um valor se ele ainda for exatamente o valor antigo da lista
//     (se alguém já editou, avisa e não mexe). Reexecutar é seguro.
//   - As dietas salvas não mudam, a menos que você use --corrigir-dietas (que só troca o NOME dos itens que se chamam "L",
//     "Cana, aguardente 1" ou "Cerveja, pilsen 2").
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const cliOptions = { apply: args.includes('--aplicar'), dietas: args.includes('--corrigir-dietas'), jsonPath: join(__dirname, 'correcoes.json') };
export type Options = typeof cliOptions;

type Correcoes = {
  nomes: Array<{ de: string; para: string; motivo?: string }>;
  valores: Array<{ nome: string; tipo: string; campos: Record<string, { de: number; para: number }> }>;
};
const FIELD: Record<string, string> = { kcal: 'kcal', protein: 'protein', carbs: 'carbs', fat: 'fat', fiber: 'fiber' };
const eq = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 1e-6;

export async function main(o: Options = cliOptions, db: PrismaClient = prisma) {
  const c = JSON.parse(fs.readFileSync(o.jsonPath, 'utf8')) as Correcoes;
  console.log(`Modo: ${o.apply ? 'GRAVAR' : 'SIMULAÇÃO (nada é gravado)'}${o.dietas ? ' + dietas salvas' : ''}`);
  let renamed = 0, valuesSet = 0, already = 0, diverged = 0, notFound = 0;

  // ── nomes ──
  for (const n of c.nomes) {
    const foods = await db.food.findMany({ where: { source: 'TACO', name: n.de }, select: { id: true, name: true } });
    const items = await (db as any).foodItem.count({ where: { name: n.de } });
    if (!foods.length) {
      const done = await db.food.findMany({ where: { source: 'TACO', name: n.para }, select: { id: true } });
      if (done.length) already++; else notFound++;
      console.log(`  nome "${n.de}" → "${n.para}": ${done.length ? 'já está corrigido' : 'não encontrei no catálogo'}`);
    } else {
      console.log(`  nome "${n.de}" → "${n.para}": ${foods.length} alimento(s) no catálogo${n.motivo ? ` (${n.motivo})` : ''}`);
      if (o.apply) for (const f of foods) await db.food.update({ where: { id: f.id }, data: { name: n.para } });
      renamed += foods.length;
    }
    if (items) {
      if (o.apply && o.dietas) { const r = await (db as any).foodItem.updateMany({ where: { name: n.de }, data: { name: n.para } }); console.log(`    ${r.count} itens de dietas salvas renomeados`); }
      else console.log(`    ${items} itens de dietas salvas com o nome "${n.de}" ${o.dietas ? '(simulação)' : '(use --corrigir-dietas para renomear)'}`);
    }
  }

  // ── valores ──
  for (const v of c.valores) {
    const foods = await db.food.findMany({ where: { source: 'TACO', name: v.nome } });
    if (!foods.length) { notFound++; console.log(`  "${v.nome}": não encontrei no catálogo`); continue; }
    for (const f of foods as any[]) {
      const data: Record<string, number> = {}; const notes: string[] = [];
      for (const [k, x] of Object.entries(v.campos)) {
        const col = FIELD[k]; if (!col) continue;
        if (eq(f[col], x.para)) { already++; continue; }
        if (eq(f[col], x.de)) { data[col] = x.para; notes.push(`${k} ${x.de} → ${x.para}`); } else { diverged++; notes.push(`${k} está ${f[col]} (esperava ${x.de}; não mexi)`); }
      }
      if (notes.length) console.log(`  "${v.nome}" [${v.tipo}]: ${notes.join('; ')}`);
      if (Object.keys(data).length) { valuesSet += Object.keys(data).length; if (o.apply) await db.food.update({ where: { id: f.id }, data }); }
    }
  }
  console.log(`\n${o.apply ? 'Corrigido' : 'Corrigiria'}: ${renamed} nome(s) e ${valuesSet} valor(es). Já estavam corretos: ${already}. Divergentes (não mexi): ${diverged}. Não encontrados: ${notFound}.`);
  if (!o.apply) console.log('\nNada foi gravado. Para gravar: npx tsx scripts/taco-correcoes/aplicar.ts --aplicar');
}

// só roda quando chamado pela linha de comando (os testes importam main sem executar)
if (process.argv[1] && /aplicar\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
