import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// Função Mágica: Corrige vírgula, texto vazio e undefined
const safeFloat = (val: any) => {
    if (val === '' || val === null || val === undefined) return null;
    // Se for string, troca vírgula por ponto
    const str = String(val).replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const latest = searchParams.get('latest');

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    if (latest === 'true') {
        const last = await prisma.assessment.findFirst({
            where: { userId },
            orderBy: { date: 'desc' }
        });
        return NextResponse.json(last || {});
    }

    const history = await prisma.assessment.findMany({
        where: { userId },
        orderBy: { date: 'asc' }
    });

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar dados" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, date, weight, height, photos, neck, shoulders, chest, arms, forearms, waist, abdomen, hips, thighs, calves, method, foldTriceps, foldSubscapular, foldChest, foldAxillary, foldSuprailiac, foldAbdominal, foldThigh, bodyFat, muscleMass, visceralFat, notes, folds, measures } = body;

    if (!userId || !weight) {
        return NextResponse.json({ error: "Peso é obrigatório" }, { status: 400 });
    }

    // Unifica dados se vierem dentro de objetos (folds/measures) ou soltos
    const f = folds || {};
    const m = measures || {};

    const newAssessment = await prisma.assessment.create({
        data: {
            userId,
            date: date ? new Date(date) : new Date(),
            weight: Number(String(weight).replace(',', '.')), // Garante peso correto
            height: safeFloat(height),
            photos: photos || [],
            
            // Nível 2 - Medidas
            neck: safeFloat(neck || m.neck),
            shoulders: safeFloat(shoulders || m.shoulders),
            chest: safeFloat(chest || m.chest),
            arms: safeFloat(arms || m.arms),
            forearms: safeFloat(forearms || m.forearms),
            waist: safeFloat(waist || m.waist),
            abdomen: safeFloat(abdomen || m.abdomen),
            hips: safeFloat(hips || m.hips),
            thighs: safeFloat(thighs || m.thighs),
            calves: safeFloat(calves || m.calves),

            // Nível 3 - Pollock
            method: method || "MANUAL",
            foldTriceps: safeFloat(foldTriceps || f.triceps),
            foldSubscapular: safeFloat(foldSubscapular || f.subscapular),
            foldChest: safeFloat(foldChest || f.chest),
            foldAxillary: safeFloat(foldAxillary || f.axillary),
            foldSuprailiac: safeFloat(foldSuprailiac || f.suprailiac),
            foldAbdominal: safeFloat(foldAbdominal || f.abdominal),
            foldThigh: safeFloat(foldThigh || f.thigh),

            // Resultados
            bodyFat: safeFloat(bodyFat),
            muscleMass: safeFloat(muscleMass),
            visceralFat: safeFloat(visceralFat),
            notes: notes || ""
        }
    });

    return NextResponse.json({ success: true, id: newAssessment.id });

  } catch (error: any) {
    console.error("Erro Backend:", error);
    // Retorna o erro real para o App mostrar no Alert
    return NextResponse.json({ error: error.message || "Erro desconhecido no servidor" }, { status: 500 });
  }
}