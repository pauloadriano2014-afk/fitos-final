// app/api/coach-notes/interpretar/route.ts
// 🎙️ NOTAS POR VOZ -- passo 2: texto falado -> rascunho da anotação.
//   POST { text } -> { draft: { studentId, studentName, candidates, kind, tag, body, dueDate, ai } }
// A IA (Haiku 5.5) só extrai; o aluno é escolhido AQUI comparando com a lista do coach (a lista não vai para a IA). Se a IA falhar, vem um rascunho por regras (ai: false) e o coach confere do mesmo jeito.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { capResponse } from '@/lib/coachMonthlyCaps';
import { logAiUse, USE_KINDS } from '@/lib/aiCost';
import { draftFromExtraction, ruleDraft, MAX_SPOKEN_TEXT, todayKeyBrt } from '@/lib/coachNotes';
import { extractNote } from '@/lib/coachNotesAI';
import { loadCoachStudents, missing, requireNotesCoach } from '@/lib/coachNotesStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = await requireNotesCoach(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const text: string = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
    if (text.length < 3) return NextResponse.json({ error: 'Fale ou escreva a anotação antes de interpretar.' }, { status: 400 });
    if (text.length > MAX_SPOKEN_TEXT) return NextResponse.json({ error: `Texto muito longo (máx. ${MAX_SPOKEN_TEXT} letras).` }, { status: 400 });
    const rl = checkRateLimit(`nota-interpretar:${auth.user.id}`, { max: 80, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitas anotações seguidas. Aguarde um pouco.' }, { status: 429 });

    { const cap = await capResponse(prisma, auth.user, 'voz'); if (cap) return cap; }   // 🧮 (20 out 2026) limite mensal de ditado por voz do coach parceiro
    const todayKey = todayKeyBrt();
    const students = await loadCoachStudents(prisma, auth.user.id);
    let draft;
    try {
      const { input, usage } = await extractNote(text, todayKey);
      draft = draftFromExtraction(input, text, students, todayKey);
      await logAiUse(prisma, auth.user.id, USE_KINDS.notaVoz, usage.model, usage.inputTokens, usage.outputTokens);
      console.info(`[nota-voz] interpretou model=${usage.model} in=${usage.inputTokens} out=${usage.outputTokens} ms=${usage.ms}`);
    } catch (e: any) {
      console.error('[nota-voz] IA indisponível, usando regras:', e?.message || e);
      draft = ruleDraft(text, students, todayKey);
    }
    return NextResponse.json({ draft, text });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ draft: null, error: 'Não foi possível interpretar agora.' }, { status: 503 });
    console.error('[POST /api/coach-notes/interpretar]', e);
    return NextResponse.json({ error: 'Erro ao interpretar a anotação.' }, { status: 500 });
  }
}
