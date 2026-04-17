import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  const date = searchParams.get("date");

  if (!studentId || !date) return NextResponse.json({ error: "Missing params" }, { status: 400 });

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