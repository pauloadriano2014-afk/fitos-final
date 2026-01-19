import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca histórico de avaliações do usuário
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const latest = searchParams.get('latest'); // Se 'true', traz só a última (para a Home)

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    if (latest === 'true') {
        const lastAssessment = await prisma.assessment.findFirst({
            where: { userId },
            orderBy: { date: 'desc' }
        });
        return NextResponse.json(lastAssessment || {});
    }

    // Busca histórico completo para gráficos
    const history = await prisma.assessment.findMany({
        where: { userId },
        orderBy: { date: 'asc' } // Ordem cronológica para gráficos
    });

    return NextResponse.json(history);

  } catch (error) {
    console.error("Erro GET Assessment:", error);
    return NextResponse.json({ error: "Erro ao buscar avaliações" }, { status: 500 });
  }
}

// POST: Salva uma nova avaliação (Qualquer Nível)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Extraímos os dados garantindo que undefined vire null para o banco
    const { 
        userId, date, weight, height, photos, 
        // Medidas
        neck, shoulders, chest, arms, forearms, waist, abdomen, hips, thighs, calves,
        // Pollock/Avançado
        method, foldTriceps, foldSubscapular, foldChest, foldAxillary, foldSuprailiac, foldAbdominal, foldThigh,
        // Resultados
        bodyFat, muscleMass, visceralFat, notes
    } = body;

    if (!userId || !weight) {
        return NextResponse.json({ error: "Peso e ID do usuário são obrigatórios" }, { status: 400 });
    }

    const newAssessment = await prisma.assessment.create({
        data: {
            userId,
            date: date ? new Date(date) : new Date(),
            weight: Number(weight),
            height: height ? Number(height) : null,
            photos: photos || [],
            
            // Nível 2
            neck: neck ? Number(neck) : null,
            shoulders: shoulders ? Number(shoulders) : null,
            chest: chest ? Number(chest) : null,
            arms: arms ? Number(arms) : null,
            forearms: forearms ? Number(forearms) : null,
            waist: waist ? Number(waist) : null,
            abdomen: abdomen ? Number(abdomen) : null,
            hips: hips ? Number(hips) : null,
            thighs: thighs ? Number(thighs) : null,
            calves: calves ? Number(calves) : null,

            // Nível 3
            method: method || "MANUAL",
            foldTriceps: foldTriceps ? Number(foldTriceps) : null,
            foldSubscapular: foldSubscapular ? Number(foldSubscapular) : null,
            foldChest: foldChest ? Number(foldChest) : null,
            foldAxillary: foldAxillary ? Number(foldAxillary) : null,
            foldSuprailiac: foldSuprailiac ? Number(foldSuprailiac) : null,
            foldAbdominal: foldAbdominal ? Number(foldAbdominal) : null,
            foldThigh: foldThigh ? Number(foldThigh) : null,

            // Resultados
            bodyFat: bodyFat ? Number(bodyFat) : null,
            muscleMass: muscleMass ? Number(muscleMass) : null,
            visceralFat: visceralFat ? Number(visceralFat) : null,
            notes: notes || ""
        }
    });

    return NextResponse.json({ success: true, id: newAssessment.id });

  } catch (error: any) {
    console.error("Erro POST Assessment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}