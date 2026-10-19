// app/api/gen-presets/route.ts
// 🎛️ (19 out 2026) PRESETS de filtros de exercícios do coach (lib/genRules.ts): "Condomínio sem máquina", "Joelho sensível"... para aplicar em vários alunos.
//   GET    [?coachId=]                -> { presets: [{ id, name, rules, summary }] }   (master pode ver o de outro coach)
//   POST   { id?, name, rules }       -> cria (ou troca as regras do preset de mesmo nome); com `id` renomeia/atualiza
//   DELETE ?id=                       -> apaga o preset (os alunos que já aplicaram NÃO mudam: aplicar copia as regras)
// Antes do `db push` (tabela nova GenPreset): GET responde lista vazia e POST avisa que falta o push.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { cleanRules, describeRules } from '@/lib/genRules';

export const dynamic = 'force-dynamic';
const MAX_PRESETS = 30;
const SEM_TABELA = 'Falta criar a tabela dos presets no banco (npx prisma db push). Os presets ainda não podem ser salvos.';
const view = (p: any) => { const rules = cleanRules(p.rules); return { id: p.id, name: p.name, rules, summary: describeRules(rules), updatedAt: p.updatedAt }; };

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req); if ('response' in auth) return auth.response;
    const coachId = new URL(req.url).searchParams.get('coachId') || auth.user.id;
    if (!canActAsCoach(auth.user, coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    try {
      const rows = await (prisma as any).genPreset.findMany({ where: { coachId }, orderBy: { name: 'asc' } });
      return NextResponse.json({ presets: rows.map(view), available: true });
    } catch (_) { return NextResponse.json({ presets: [], available: false }); }
  } catch (e) {
    console.error('Erro nos presets (GET):', e);
    return NextResponse.json({ error: 'Não foi possível ler os presets agora.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req); if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const coachId = body?.coachId ? String(body.coachId) : auth.user.id;
    if (!canActAsCoach(auth.user, coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) return NextResponse.json({ error: 'Dê um nome para o preset.' }, { status: 400 });
    const rules = cleanRules(body.rules);
    try {
      const db = (prisma as any).genPreset;
      if (body.id) {
        const cur = await db.findUnique({ where: { id: String(body.id) } });
        if (!cur || cur.coachId !== coachId) return NextResponse.json({ error: 'Preset não encontrado.' }, { status: 404 });
        const clash = await db.findFirst({ where: { coachId, name } });
        if (clash && clash.id !== cur.id) return NextResponse.json({ error: 'Já existe um preset com esse nome.' }, { status: 409 });
        return NextResponse.json({ ok: true, preset: view(await db.update({ where: { id: cur.id }, data: { name, rules } })) });
      }
      const same = await db.findFirst({ where: { coachId, name } });
      if (same) return NextResponse.json({ ok: true, updated: true, preset: view(await db.update({ where: { id: same.id }, data: { rules } })) });
      const mine = await db.findMany({ where: { coachId } });
      if (mine.length >= MAX_PRESETS) return NextResponse.json({ error: `Limite de ${MAX_PRESETS} presets. Apague algum para criar outro.` }, { status: 400 });
      return NextResponse.json({ ok: true, updated: false, preset: view(await db.create({ data: { coachId, name, rules } })) });
    } catch (_) {
      return NextResponse.json({ error: SEM_TABELA, code: 'SEM_TABELA' }, { status: 503 });
    }
  } catch (e) {
    console.error('Erro nos presets (POST):', e);
    return NextResponse.json({ error: 'Não foi possível salvar o preset agora.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req); if ('response' in auth) return auth.response;
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    try {
      const db = (prisma as any).genPreset;
      const cur = await db.findUnique({ where: { id } });
      if (!cur) return NextResponse.json({ ok: true });
      if (!canActAsCoach(auth.user, cur.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      await db.deleteMany({ where: { id } });
    } catch (_) { /* sem tabela: nada a apagar */ }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Erro nos presets (DELETE):', e);
    return NextResponse.json({ error: 'Não foi possível apagar o preset agora.' }, { status: 500 });
  }
}
