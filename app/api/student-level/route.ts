// app/api/student-level/route.ts
// 🏅 (18 out 2026) GET /api/student-level[?userId=<aluno>] -> nível do aluno (Iniciante/Intermediário/Avançado), quanto falta para o próximo e a frase para mostrar a ele.
// Sem `userId` = o próprio aluno logado. Quem pode ver: o próprio aluno, o coach dele ou o time master (mesma regra do relatório mensal). Só lê; o nível é calculado na hora
// (ver lib/studentLevel.ts), então não precisa de coluna nova.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { loadStudentLevels, levelMessage } from '@/lib/studentLevel';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const userId = new URL(req.url).searchParams.get('userId') || auth.user.id;
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, coachId: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const info = (await loadStudentLevels(prisma, [userId])).get(userId);
    if (!info) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    return NextResponse.json({ ...info, message: levelMessage(info) });
  } catch (e) {
    console.error('Erro no nível do aluno:', e);
    return NextResponse.json({ error: 'Não foi possível ver o nível agora.' }, { status: 500 });
  }
}
