// scripts/ibge-medidas/importar.ts
// 🥄 Importa as medidas caseiras do IBGE (POF 2008-2009, "Tabela de Medidas Referidas") para o banco,
// a partir da planilha de revisão (prisma/data/ibge/revisao-ibge.csv).
//
// COMO USAR (na pasta do fitos-final, com DATABASE_URL de produção no .env):
//   npx prisma db push                                   # 1x: cria as tabelas FoodPortion/FoodItemMeta
//   npx tsx scripts/ibge-medidas/importar.ts             # SIMULAÇÃO: mostra o que faria, não grava nada
//   npx tsx scripts/ibge-medidas/importar.ts --aplicar   # grava de verdade
//   (opcional) --csv caminho/outra-planilha.csv
//
// REGRAS DE SEGURANÇA
//   - Só entram as linhas com  aplicar = SIM  (a coluna que você confere/edita na planilha).
//   - Grava em FoodPortion escopo GLOBAL, origem IBGE. NUNCA mexe numa medida que já exista com outra
//     origem (MANUAL, ajuste de coach/nutri). Reexecutar é seguro: só atualiza o que veio do IBGE.
//   - Na leitura do app, a ordem continua: ajuste do coach > medida manual > tabela antiga do app > IBGE.
//     Ou seja, o IBGE só preenche o que ainda não tinha valor.
//   - Os números da planilha podem ser editados (aceita 12,5 ou 12.5). Célula vazia = medida não entra.
//   - Aceita o CSV do Excel em português (;) e o exportado pelo Google Sheets (,).
//   - Aceita o CSV do Excel em português (;) e o exportado pelo Google Sheets (,).
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const UNITS = ['colher', 'colher_sobremesa', 'colher_cha', 'colher_cafe', 'colher_servir', 'concha', 'escumadeira',
  'xícara', 'fatia', 'unid', 'pedaco', 'punhado', 'bife_p', 'bife_m', 'bife_g'] as const;
const MASTER_TEAM = 'MASTER_TEAM';

const args = process.argv.slice(2);
const apply = args.includes('--aplicar');
const csvArg = args.indexOf('--csv');
const csvPath = csvArg >= 0 ? args[csvArg + 1] : join(__dirname, '../../prisma/data/ibge/revisao-ibge.csv');

/** CSV com aspas. Aceita ; (Excel em português) ou , (Google Sheets) — detecta pelo cabeçalho. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}
const toNum = (s: string) => { const n = parseFloat(String(s ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

async function main() {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const head = rows[0].map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  for (const need of ['origem', 'chave', 'alimento', 'aplicar', ...UNITS]) if (col(need) < 0) throw new Error(`Coluna "${need}" não existe na planilha`);
  const wanted = rows.slice(1).filter((r) => /^(sim|s|1|x)$/i.test((r[col('aplicar')] || '').trim()));
  console.log(`Planilha: ${rows.length - 1} linhas; ${wanted.length} marcadas com aplicar = SIM. Modo: ${apply ? 'GRAVAR' : 'SIMULAÇÃO (nada é gravado)'}`);

  // alimentos do banco
  const foods = await prisma.food.findMany({
    where: { isActive: true, OR: [{ source: 'TACO' }, { source: 'CUSTOM', teamId: MASTER_TEAM }] },
    select: { id: true, source: true, externalId: true, name: true },
  });
  const byKey = new Map(foods.map((f) => [`${f.source}|${f.externalId}`, f]));

  // tabela nova existe?
  let existing: Array<{ id: string; foodId: string; unit: string; source: string; grams: number }> = [];
  try {
    existing = await (prisma as any).foodPortion.findMany({
      where: { scope: 'GLOBAL', foodId: { in: foods.map((f) => f.id) } }, select: { id: true, foodId: true, unit: true, source: true, grams: true },
    });
  } catch (e: any) {
    console.error('\n❌ A tabela FoodPortion ainda não existe no banco. Rode antes:  npx prisma db push\n   (' + (e?.code || '') + ' ' + (e?.message || e).toString().split('\n')[0] + ')');
    process.exit(1);
  }
  const exMap = new Map(existing.map((e) => [`${e.foodId}|${e.unit}`, e]));

  let created = 0, updated = 0, same = 0, kept = 0, notFound = 0, bad = 0;
  const keptList: string[] = [], nfList: string[] = [];
  for (const r of wanted) {
    const origem = r[col('origem')].trim().toUpperCase(), chave = r[col('chave')].trim(), nome = r[col('alimento')].trim();
    const food = byKey.get(`${origem}|${chave}`);
    if (!food) { notFound++; nfList.push(`${origem} ${chave} (${nome})`); continue; }
    for (const u of UNITS) {
      const raw = (r[col(u)] || '').trim();
      if (!raw) continue;
      const g = toNum(raw);
      if (!(g > 0) || g > 5000) { bad++; console.warn(`  ⚠ valor inválido em "${nome}" / ${u}: "${raw}" — ignorado`); continue; }
      const ex = exMap.get(`${food.id}|${u}`);
      if (ex && ex.source !== 'IBGE') { kept++; keptList.push(`${nome} / ${u} (já tem ${ex.grams} g, origem ${ex.source})`); continue; }
      if (ex && Math.abs(ex.grams - g) < 1e-9) { same++; continue; }
      if (!apply) { ex ? updated++ : created++; continue; }
      if (ex) { await (prisma as any).foodPortion.update({ where: { id: ex.id }, data: { grams: g, note: 'IBGE POF 2008-2009' } }); updated++; }
      else { await (prisma as any).foodPortion.create({ data: { foodId: food.id, scope: 'GLOBAL', unit: u, grams: g, source: 'IBGE', note: 'IBGE POF 2008-2009' } }); created++; }
    }
  }
  console.log(`\n${apply ? 'Gravado' : 'Faria'}: ${created} medidas novas, ${updated} atualizadas (eram do IBGE), ${same} já estavam iguais.`);
  console.log(`Preservadas (já tinham medida manual/de coach): ${kept}. Alimentos não encontrados no banco: ${notFound}. Valores inválidos: ${bad}.`);
  if (keptList.length) console.log('  preservadas:', keptList.slice(0, 15).join(' | '), keptList.length > 15 ? `… +${keptList.length - 15}` : '');
  if (nfList.length) console.log('  não encontrados:', nfList.slice(0, 15).join(' | '), nfList.length > 15 ? `… +${nfList.length - 15}` : '');
  if (!apply) console.log('\nNada foi gravado. Para gravar: npx tsx scripts/ibge-medidas/importar.ts --aplicar');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
