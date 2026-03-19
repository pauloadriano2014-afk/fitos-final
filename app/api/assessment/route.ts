import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const safeFloat = (val: any) => {
    if (val === '' || val === null || val === undefined) return null;
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
    const { 
        userId, date, weight, height, photos, method, 
        bodyFat, muscleMass, visceralFat, notes, 
        folds, measures,
        neck, shoulders, chest, arms, forearms, waist, abdomen, hips, thighs, calves,
        foldTriceps, foldSubscapular, foldChest, foldAxillary, foldSuprailiac, foldAbdominal, foldThigh 
    } = body;

    if (!userId || !weight) {
        return NextResponse.json({ error: "Peso e ID são obrigatórios" }, { status: 400 });
    }

    const f = folds || {};
    const m = measures || {};

    const newAssessment = await prisma.assessment.create({
        data: {
            userId,
            date: date ? new Date(date) : new Date(),
            weight: Number(String(weight).replace(',', '.')),
            height: safeFloat(height),
            photos: photos || [],
            
            // Medidas
            neck: safeFloat(m.neck || neck),
            shoulders: safeFloat(m.shoulders || shoulders),
            chest: safeFloat(m.chest || chest),
            arms: safeFloat(m.arms || arms),
            forearms: safeFloat(m.forearms || forearms),
            waist: safeFloat(m.waist || waist),
            abdomen: safeFloat(m.abdomen || abdomen),
            hips: safeFloat(m.hips || hips),
            thighs: safeFloat(m.thighs || thighs),
            calves: safeFloat(m.calves || calves),

            // Pollock
            method: method || "MANUAL",
            foldTriceps: safeFloat(f.triceps || foldTriceps),
            foldSubscapular: safeFloat(f.subscapular || foldSubscapular),
            foldChest: safeFloat(f.chest || foldChest),
            foldAxillary: safeFloat(f.axillary || foldAxillary),
            foldSuprailiac: safeFloat(f.suprailiac || foldSuprailiac),
            foldAbdominal: safeFloat(f.abdominal || foldAbdominal),
            foldThigh: safeFloat(f.thigh || foldThigh),

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
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

        await prisma.assessment.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
    }
}

// 👇 NOVA FUNÇÃO PUT (PARA EDITAR AVALIAÇÕES) 👇
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { 
        id, date, weight, method, 
        bodyFat, waist, abdomen, 
        foldTriceps, foldSubscapular, foldChest, foldAxillary, foldSuprailiac, foldAbdominal, foldThigh 
    } = body;

    if (!id) return NextResponse.json({ error: "ID obrigatório para edição" }, { status: 400 });

    const updatedAssessment = await prisma.assessment.update({
        where: { id },
        data: {
            date: date ? new Date(date) : undefined,
            weight: Number(String(weight).replace(',', '.')),
            waist: safeFloat(waist),
            abdomen: safeFloat(abdomen),
            method: method || "MANUAL",
            foldTriceps: safeFloat(foldTriceps),
            foldSubscapular: safeFloat(foldSubscapular),
            foldChest: safeFloat(foldChest),
            foldAxillary: safeFloat(foldAxillary),
            foldSuprailiac: safeFloat(foldSuprailiac),
            foldAbdominal: safeFloat(foldAbdominal),
            foldThigh: safeFloat(foldThigh),
            bodyFat: safeFloat(bodyFat),
        }
    });

    return NextResponse.json({ success: true, id: updatedAssessment.id });

  } catch (error: any) {
    console.error("Erro Backend:", error);
    return NextResponse.json({ error: error.message || "Erro interno ao atualizar" }, { status: 500 });
  }
}