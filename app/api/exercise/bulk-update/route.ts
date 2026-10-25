// app/api/exercise/bulk-update/route.ts
// 🛠️ (25 out 2026) Correção EM LOTE da Biblioteca (seleção em massa): ambiente (academia) e grupo/subgrupo de vários exercícios de uma vez.
//
//   POST { ids: string[],
//          environments?: { mode: 'ADD' | 'REMOVE' | 'SET', values: string[] },
//          category?: string, subCategory?: string,
//          equipment?: 'MAQUINA' | 'POLIA' | 'BARRA' | 'SMITH' | 'HALTER' | 'PESO_CORPORAL' | 'OUTROS' | 'AUTO' }
//   -> { success, count, unchanged, skipped: [{ id, name, reason }] }
//
// Só Paulo e Adri, e só em exercício que é do próprio coach logado ou global (o mesmo recorte de /api/exercise/visibility).
// Não apaga nada e não mexe em treino montado. ADD acrescenta o ambiente, REMOVE tira, SET troca tudo; o exercício nunca fica sem ambiente
// equipment: grava o equipamento e TRAVA (a edição do exercício não refaz pelo nome); 'AUTO' destrava e volta ao palpite pelo nome.
// (se o REMOVE deixaria vazio, ele é pulado e aparece em `skipped`). Nomes antigos (ACADEMIA, CASA...) são convertidos ao mexer.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { ENVIRONMENT_IDS } from '@/lib/genRules';
import { EQUIPMENT_IDS, guessEquipment, isEquipmentId } from '@/lib/exerciseEquipment';

export const dynamic = 'force-dynamic';

const MAX_IDS = 500;
const BULK_CATEGORIES = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Bíceps', 'Antebraço', 'Tríceps', 'Abdômen', 'Mobilidade', 'Cardio'];
const MODES = ['ADD', 'REMOVE', 'SET'];

/** nomes antigos de ambiente -> os de hoje; vazio = Academia Padrão (o mesmo que a tela da Biblioteca faz ao abrir o exercício) */
function normEnvs(envs: any): string[] {
  if (!Array.isArray(envs) || envs.length === 0) return ['ACADEMIA_PADRAO'];
  const out = envs.map((e) => (e === 'ACADEMIA' ? 'ACADEMIA_PADRAO' : e === 'CONDOMÍNIO' ? 'CONDOMINIO' : e === 'CASA' ? 'EM_CASA' : String(e)));
  return Array.from(new Set(out));
}

export async function POST(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    let body: any = null;
    try { body = await req.json(); } catch { body = null; }
    const rawIds = body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.some((i: any) => typeof i !== 'string' || !i)) {
      return NextResponse.json({ error: 'Informe a lista de exercícios (ids).' }, { status: 400 });
    }
    const ids = Array.from(new Set(rawIds as string[]));
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `No máximo ${MAX_IDS} exercícios por vez.` }, { status: 400 });

    // ── o que mudar ──
    let envPlan: { mode: string; values: string[] } | null = null;
    if (body?.environments != null) {
      const mode = body.environments.mode; const values = body.environments.values;
      if (!MODES.includes(mode)) return NextResponse.json({ error: 'Escolha o que fazer com o ambiente: acrescentar, tirar ou trocar.' }, { status: 400 });
      if (!Array.isArray(values) || values.length === 0 || values.some((v: any) => !(ENVIRONMENT_IDS as readonly string[]).includes(v))) {
        return NextResponse.json({ error: 'Escolha pelo menos um ambiente válido.' }, { status: 400 });
      }
      envPlan = { mode, values: Array.from(new Set(values as string[])) };
    }
    let category: string | null = null; let subCategory: string | null = null;
    if (body?.category != null) {
      if (typeof body.category !== 'string' || !BULK_CATEGORIES.includes(body.category)) return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 });
      category = body.category;
    }
    if (body?.subCategory != null) {
      const s = typeof body.subCategory === 'string' ? body.subCategory.trim() : '';
      if (!s || s.length > 40) return NextResponse.json({ error: 'Subgrupo inválido.' }, { status: 400 });
      subCategory = s;
    }
    let equipment: string | null = null;
    if (body?.equipment != null) {
      if (body.equipment !== 'AUTO' && !isEquipmentId(body.equipment)) return NextResponse.json({ error: `Equipamento inválido. Use um destes: ${EQUIPMENT_IDS.join(', ')} ou AUTO.` }, { status: 400 });
      equipment = body.equipment;
    }
    if (!envPlan && !category && !subCategory && !equipment) return NextResponse.json({ error: 'Escolha o que mudar (ambiente, grupo ou equipamento).' }, { status: 400 });

    const rows: any[] = await prisma.exercise.findMany({
      where: { id: { in: ids }, OR: [{ coachId: auth.user.id }, { coachId: null }] },
      select: { id: true, name: true, category: true, subCategory: true, environments: true, tags: true },
    });

    const skipped: Array<{ id: string; name: string; reason: string }> = [];
    const updates: any[] = [];
    for (const r of rows) {
      const data: any = {};
      if (envPlan) {
        const cur = normEnvs(r.environments);
        let next: string[];
        if (envPlan.mode === 'ADD') next = Array.from(new Set([...cur, ...envPlan.values]));
        else if (envPlan.mode === 'REMOVE') next = cur.filter((e) => !envPlan!.values.includes(e));
        else next = envPlan.values;
        if (next.length === 0) { skipped.push({ id: r.id, name: r.name, reason: 'ficaria sem nenhum ambiente' }); continue; }
        const old: string[] = Array.isArray(r.environments) ? r.environments : [];
        if (!(next.length === old.length && next.every((e) => old.includes(e)))) data.environments = next;
      }
      if (category && category !== r.category) {
        data.category = category;
        if (!subCategory) data.subCategory = 'Geral';   // trocou de grupo sem dizer o subgrupo: o antigo não vale mais
      }
      if (subCategory && subCategory !== r.subCategory) data.subCategory = subCategory;
      if (equipment) {
        const tags: any = r.tags && typeof r.tags === 'object' ? { ...r.tags } : {};
        if (equipment === 'AUTO') { delete tags.equipmentManual; tags.equipment = guessEquipment(r.name, data.category || r.category)?.equipment || 'LIVRE'; }
        else { tags.equipment = equipment; tags.equipmentManual = true; }
        if (tags.equipment !== (r.tags || {}).equipment || tags.equipmentManual !== (r.tags || {}).equipmentManual) data.tags = tags;
      }
      if (Object.keys(data).length) updates.push(prisma.exercise.update({ where: { id: r.id }, data }));
    }
    if (updates.length) await prisma.$transaction(updates);

    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((i) => !found.has(i));
    missing.forEach((i) => skipped.push({ id: i, name: '', reason: 'não encontrado ou não é seu' }));
    const unchanged = rows.length - updates.length - (skipped.length - missing.length);
    return NextResponse.json({ success: true, count: updates.length, unchanged, skipped });
  } catch (error: any) {
    console.error('ERRO exercise/bulk-update POST:', error);
    return NextResponse.json({ error: 'Erro ao corrigir os exercícios em lote.' }, { status: 500 });
  }
}
