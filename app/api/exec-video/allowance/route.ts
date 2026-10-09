// app/api/exec-video/allowance/route.ts
// GET ?userId=&exerciseId=  -> o aluno pode enviar vídeo agora? { allowance, requests }. O app usa para mostrar (ou esconder) o botão de câmera e o "seu coach pediu".
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { checkAllowance, openRequests } from '@/lib/execVideo';
import { actsAsCoach, actsAsStudent, loadStudent } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const userId = sp.get('userId') || auth.user.id;
    const student: any = await loadStudent(prisma, userId);
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!actsAsStudent(auth.user, student) && !actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const allowance = await checkAllowance(prisma, { studentId: userId, coachId: student.coachId, exerciseId: sp.get('exerciseId') });
    const requests = (await openRequests(prisma, userId)).map((r: any) => ({ id: r.id, exerciseId: r.exerciseId, exerciseName: r.exerciseName, workoutId: r.workoutId, workoutExerciseId: r.workoutExerciseId, day: r.day, note: r.note, createdAt: r.createdAt }));
    return NextResponse.json({ allowance, requests });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ allowance: { canUpload: false, mode: 'NONE', requestId: null, enabled: false, used: 0, limit: null, reason: null }, requests: [], unavailable: true });
    console.error('[GET /api/exec-video/allowance]', e);
    return NextResponse.json({ error: 'Erro ao consultar a liberação.' }, { status: 500 });
  }
}
