// app/api/insights/analyze/route.ts
// 🧠 (18 out 2026) POST { studentId, refresh?, onlyCached? } -> a ANÁLISE COM IA do treino do aluno, comparado com os alunos parecidos (lib/insightAnalysis.ts), COM MEMÓRIA:
//   • mesma situação de antes  -> devolve a análise guardada, sem gastar IA (`cached: true`);
//   • algo mudou               -> recalcula (`incremental: true` quando só as referências mudaram: manda só o que mudou);
//   • onlyCached: true         -> nunca chama a IA (mostra a última análise e `stale` se já estiver desatualizada).
// Trava: coach ativo COM a chave `perguntasVoz` (usa IA; no início só o time master libera coach a coach). Só a carteira do coach. Limite de pedidos por hora para não estourar o custo.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireAskCoach } from '@/lib/coachNotesStore';
import { analyzeStudent } from '@/lib/insightAnalysis';
import { spokenAnalysis } from '@/lib/insightDigest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireAskCoach(req);
  if ('response' in auth) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
    if (!studentId) return NextResponse.json({ error: 'studentId obrigatório' }, { status: 400 });
    const onlyCached = body?.onlyCached === true;
    if (!onlyCached) {
      const rl = checkRateLimit(`insight-analysis:${auth.user.id}`, { max: 30, windowMs: 60 * 60 * 1000 });
      if (!rl.allowed) return NextResponse.json({ error: 'Muitas análises seguidas. Aguarde um pouco.' }, { status: 429 });
    }
    const r = await analyzeStudent(prisma, auth.user.id, studentId, { refresh: body?.refresh === true, onlyCached });
    if (!r.ok && r.reason === 'NAO_ENCONTRADO') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!r.ok && r.reason === 'SEM_GENERO') return NextResponse.json({ ...r, error: 'Falta o gênero no cadastro do aluno (só comparamos o mesmo gênero).' }, { status: 422 });
    return NextResponse.json({ ...r, spoken: r.analysis ? spokenAnalysis(r.analysis) : null });
  } catch (e: any) {
    console.error('Erro POST insights/analyze:', e?.message || e);
    return NextResponse.json({ error: 'Não consegui fazer a análise agora. Tente de novo em instantes.' }, { status: 502 });
  }
}
