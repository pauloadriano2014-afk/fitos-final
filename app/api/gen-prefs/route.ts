// app/api/gen-prefs/route.ts
// 🎛️ (19 out 2026) Filtros de exercícios da geração de treino, SALVOS NO ALUNO (lib/genRules.ts).
//   GET    ?userId=<aluno>                       -> { rules, presetId, saved, available }
//   PUT    { userId, rules, presetId? }          -> salva (cria ou troca)
//   DELETE ?userId=<aluno>                       -> volta ao padrão (sem filtros)
// Quem pode: o coach do aluno ou o time master (o próprio aluno NÃO mexe nisso). Antes do `db push` (tabela nova GenPrefs) o GET responde "sem filtros" e o PUT avisa que falta o push.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { cleanRules, emptyRules, describeRules } from '@/lib/genRules';

export const dynamic = 'force-dynamic';
const SEM_TABELA = 'Falta criar a tabela dos filtros no banco (npx prisma db push). Os filtros ainda não podem ser salvos.';

async function guard(req: Request, userId: string | null) {
  const auth = requireAuth(req);
  if ('response' in auth) return { response: auth.response };
  if (!userId) return { response: NextResponse.json({ error: 'userId obrigatório' }, { status: 400 }) };
  const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, coachId: true } });
  if (!student) return { response: NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 }) };
  if (auth.user.id === userId || !canAccessStudent(auth.user, userId, student.coachId)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { auth, student };
}

export async function GET(req: Request) {
  try {
    const userId = new URL(req.url).searchParams.get('userId');
    const g = await guard(req, userId); if ('response' in g) return g.response;
    try {
      const row = await (prisma as any).genPrefs.findUnique({ where: { userId } });
      const rules = row ? cleanRules(row.rules) : emptyRules();
      return NextResponse.json({ rules, summary: describeRules(rules), presetId: row?.presetId || null, saved: !!row, available: true, updatedAt: row?.updatedAt || null });
    } catch (_) {
      return NextResponse.json({ rules: emptyRules(), summary: [], presetId: null, saved: false, available: false });
    }
  } catch (e) {
    console.error('Erro nos filtros do aluno (GET):', e);
    return NextResponse.json({ error: 'Não foi possível ler os filtros agora.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body?.userId ? String(body.userId) : null;
    const g = await guard(req, userId); if ('response' in g) return g.response;
    const rules = cleanRules(body.rules);
    const presetId = body.presetId ? String(body.presetId).slice(0, 64) : null;
    const coachId = g.student.coachId || g.auth.user.id;
    try {
      const row = await (prisma as any).genPrefs.upsert({ where: { userId }, create: { userId, coachId, rules, presetId }, update: { rules, presetId, coachId } });
      return NextResponse.json({ ok: true, rules, summary: describeRules(rules), presetId: row.presetId || null, saved: true });
    } catch (_) {
      return NextResponse.json({ error: SEM_TABELA, code: 'SEM_TABELA' }, { status: 503 });
    }
  } catch (e) {
    console.error('Erro nos filtros do aluno (PUT):', e);
    return NextResponse.json({ error: 'Não foi possível salvar os filtros agora.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = new URL(req.url).searchParams.get('userId');
    const g = await guard(req, userId); if ('response' in g) return g.response;
    try { await (prisma as any).genPrefs.deleteMany({ where: { userId } }); } catch (_) { /* sem tabela = nada salvo */ }
    return NextResponse.json({ ok: true, rules: emptyRules() });
  } catch (e) {
    console.error('Erro nos filtros do aluno (DELETE):', e);
    return NextResponse.json({ error: 'Não foi possível limpar os filtros agora.' }, { status: 500 });
  }
}
