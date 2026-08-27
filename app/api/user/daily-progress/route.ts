import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, canAccessStudent } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  const date = searchParams.get("date");

  if (!studentId || !date) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  const targetForAuth = await prisma.user.findUnique({ where: { id: studentId }, select: { coachId: true } });
  if (!canAccessStudent(auth.user, studentId, targetForAuth?.coachId)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  try {
    const data = await prisma.dailyCheckin.findUnique({
      where: { studentId_date: { studentId, date } }
    });
    return NextResponse.json(data || { water_ml: 0 });
  } catch (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { studentId, date, water_ml, fome, digestao, energia } = body;

    if (!studentId || !date) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetForAuth = await prisma.user.findUnique({ where: { id: studentId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, studentId, targetForAuth?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const checkin = await prisma.dailyCheckin.upsert({
      where: { studentId_date: { studentId, date } },
      update: {
        water_ml: water_ml !== undefined ? water_ml : undefined,
        fome, digestao, energia
      },
      create: { studentId, date, water_ml: water_ml || 0, fome, digestao, energia }
    });

    return NextResponse.json(checkin);
  } catch (error) {
    return NextResponse.json({ error: "Failed to save data" }, { status: 500 });
  }
}