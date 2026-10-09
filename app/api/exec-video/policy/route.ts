// app/api/exec-video/policy/route.ts
// 🎥 Quem pode enviar vídeo por conta própria (liberação + limite por mês). Sem regra: só a pedido do coach.
//   GET ?studentId=  (coach do aluno ou master) -> { effective, own, default, used }
//   PUT { studentId, enabled, monthlyLimit }      studentId = '*' grava o PADRÃO do coach (vale para quem não tem regra própria); monthlyLimit vazio = sem limite
//   PUT { studentId, clear: true }                apaga a regra do aluno (volta ao padrão)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';
import { monthlyUsage, resolvePolicy } from '@/lib/execVideo';
import { actsAsCoach, loadStudent } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const MAX_LIMIT = 100;

const view = (r: any) => (r ? { enabled: !!r.enabled, monthlyLimit: Number.isInteger(r.monthlyLimit) ? r.monthlyLimit : null } : null);

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachRole(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const studentId = new URL(req.url).searchParams.get('studentId') || '*';
    const def = await prisma.videoPolicy.findFirst({ where: { coachId: auth.user.id, studentId: '*' } });
    if (studentId === '*') return NextResponse.json({ default: view(def), own: null, effective: { enabled: !!def?.enabled, monthlyLimit: view(def)?.monthlyLimit ?? null, source: def ? 'DEFAULT' : 'NONE' }, used: 0 });
    const student: any = await loadStudent(prisma, studentId);
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const coachId = student.coachId || auth.user.id;
    const own = await prisma.videoPolicy.findFirst({ where: { coachId, studentId } });
    const defOfCoach = coachId === auth.user.id ? def : await prisma.videoPolicy.findFirst({ where: { coachId, studentId: '*' } });
    const effective = await resolvePolicy(prisma, coachId, studentId);
    return NextResponse.json({ default: view(defOfCoach), own: view(own), effective, used: await monthlyUsage(prisma, studentId, new Date()), isMaster: isMasterId(auth.user.id) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'O vídeo de execução ainda não está habilitado no servidor.', unavailable: true }, { status: 503 });
    console.error('[GET /api/exec-video/policy]', e);
    return NextResponse.json({ error: 'Erro ao carregar a liberação.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachRole(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const b = await req.json().catch(() => null);
    const studentId = String(b?.studentId || '');
    if (!studentId) return NextResponse.json({ error: 'studentId obrigatório.' }, { status: 400 });
    let coachId = auth.user.id;
    if (studentId !== '*') {
      const student: any = await loadStudent(prisma, studentId);
      if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
      if (!actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      coachId = student.coachId || auth.user.id;
    }
    if (b.clear === true) {
      if (studentId === '*') return NextResponse.json({ error: 'O padrão não pode ser apagado: desligue-o.' }, { status: 400 });
      await prisma.videoPolicy.deleteMany({ where: { coachId, studentId } });
      return NextResponse.json({ success: true, own: null });
    }
    const raw = b.monthlyLimit;
    let monthlyLimit: number | null = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) return NextResponse.json({ error: `O limite mensal deve ser de 1 a ${MAX_LIMIT} vídeos (ou vazio para sem limite).` }, { status: 400 });
      monthlyLimit = n;
    }
    const enabled = b.enabled === true;
    const row = await prisma.videoPolicy.upsert({ where: { coachId_studentId: { coachId, studentId } }, update: { enabled, monthlyLimit }, create: { coachId, studentId, enabled, monthlyLimit } });
    return NextResponse.json({ success: true, own: view(row) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'O vídeo de execução ainda não está habilitado no servidor.', unavailable: true }, { status: 503 });
    console.error('[PUT /api/exec-video/policy]', e);
    return NextResponse.json({ error: 'Erro ao salvar a liberação.' }, { status: 500 });
  }
}
