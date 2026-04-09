import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// 🔥 DETONADOR DE CACHE: Garante que as fotos e o feedback cheguem IMEDIATAMENTE no app do aluno
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT as string,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
});

// Intervalo automático por plano (em dias)
const PLAN_AUTO_DAYS: Record<string, number> = {
    PREMIUM: 14,
    PERFORMANCE: 30,
    standard: 30,
    LOW_COST: 30,
    FICHA_8S: 56,
    FICHAS: 56,
    CHALLENGE_21: 21,
};

// Máximo de check-ins permitidos por plano de ciclo
const PLAN_MAX_CHECKINS: Record<string, number> = {
    FICHA_8S: 2,
    FICHAS: 2,
    CHALLENGE_21: 2,
};

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

async function uploadToR2(base64String: string, userId: string, prefix: string) {
    if (!base64String) return null;
    if (base64String.startsWith('http')) return base64String;

    try {
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const fileName = `checkins/${userId}/${Date.now()}-${prefix}.jpg`;

        const command = new PutObjectCommand({
            Bucket: 'fitos-fotos',
            Key: fileName,
            Body: buffer,
            ContentType: 'image/jpeg',
        });

        await s3.send(command);
        
        const publicUrlBase = (process.env.R2_PUBLIC_URL as string).replace(/\/$/, ""); 
        return `${publicUrlBase}/${fileName}`;
    } catch (error) {
        console.error(`Erro ao subir ${prefix} para o R2:`, error);
        return null;
    }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, weight, feedback, photoFront, photoBack, photoSide, extraPhotos, allowMarketing } = body;

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    // Upload paralelo das fotos
    const [frontUrl, backUrl, sideUrl] = await Promise.all([
        uploadToR2(photoFront, userId, 'front'),
        uploadToR2(photoBack, userId, 'back'),
        uploadToR2(photoSide, userId, 'side')
    ]);

    let extraUrls: string[] = [];
    if (Array.isArray(extraPhotos) && extraPhotos.length > 0) {
        const uploadedExtras = await Promise.all(
            extraPhotos.map((photo: string, index: number) => uploadToR2(photo, userId, `extra-${index}`))
        );
        extraUrls = uploadedExtras.filter(url => url !== null) as string[];
    }

    const checkInData: any = {
        userId,
        weight: parseFloat(weight) || null,
        feedback: feedback || "",
        photoFront: frontUrl,
        photoBack: backUrl,
        photoSide: sideUrl,
        extraPhotos: extraUrls, 
        date: new Date()
    };

    const checkIn = await prisma.checkIn.create({
      data: checkInData
    });

    // ── Busca dados do usuário para calcular próxima data ──
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true, coachId: true, name: true }
    });

    if (!user) return NextResponse.json({ success: true, id: checkIn.id });

    const plan = user.plan || 'PERFORMANCE';
    const isCyclePlan = ['FICHA_8S', 'FICHAS', 'CHALLENGE_21'].includes(plan);

    // Conta quantos check-ins o aluno já tem (incluindo o que acabou de criar)
    const totalCheckins = await prisma.checkIn.count({ where: { userId } });

    // ── Calcula nextCheckInDate ──
    let nextDate: Date | null = null;

    if (isCyclePlan) {
        const maxCheckins = PLAN_MAX_CHECKINS[plan] || 2;
        if (totalCheckins < maxCheckins) {
            // Primeiro check-in do ciclo: agenda o próximo
            const autoDays = PLAN_AUTO_DAYS[plan] || 30;
            nextDate = addDays(new Date(), autoDays);
        }
        // Se já atingiu o máximo, nextDate fica null (ciclo encerrado, travado)
    } else {
        // Planos contínuos (Premium, Básico): sempre agenda o próximo
        const autoDays = PLAN_AUTO_DAYS[plan] || 14;
        nextDate = addDays(new Date(), autoDays);
    }

    // ── Atualiza usuário ──
    const updateData: any = { nextCheckInDate: nextDate };
    if (weight) updateData.currentWeight = parseFloat(weight);

    await prisma.user.update({
        where: { id: userId },
        data: updateData
    }).catch(e => console.log("Erro ao atualizar user após check-in:", e));

    // ── Notificação Push para o Coach ──
    if (user.coachId) {
         const coach = await prisma.user.findUnique({
             where: { id: user.coachId },
             select: { pushToken: true }
         });
         
         if (coach?.pushToken) {
             fetch('https://exp.host/--/api/v2/push/send', {
                 method: 'POST',
                 headers: {
                     Accept: 'application/json',
                     'Accept-encoding': 'application/json',
                     'Content-Type': 'application/json',
                 },
                 body: JSON.stringify({
                     to: coach.pushToken,
                     sound: 'default',
                     title: '📸 Novo Check-in Recebido!',
                     body: `O aluno ${user.name || 'Atleta'} enviou as fotos de evolução.`,
                 }),
             }).catch(err => console.log("Erro ao enviar push:", err));
         }
    }

    return NextResponse.json({ success: true, id: checkIn.id });

  } catch (error) {
    console.error("Erro Checkin POST:", error);
    return NextResponse.json({ error: "Erro ao enviar check-in" }, { status: 500 });
  }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const adminId = searchParams.get('adminId'); 

    try {
        const whereClause: any = {};
        if (userId) {
            whereClause.userId = userId; 
        } else if (adminId) {
            whereClause.user = { coachId: adminId }; 
        }

        const checkins = await prisma.checkIn.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            // 🔥 LIPOASPIRAÇÃO DE DADOS: Reduz para os 5 últimos e extrai SÓ o essencial.
            take: 5, 
            select: {
                id: true,
                weight: true,
                feedback: true,
                coachFeedback: true,
                date: true,
                createdAt: true,
                photoFront: true,
                photoBack: true,
                photoSide: true,
                extraPhotos: true,
                allowMarketing: true,
                user: { select: { name: true, email: true } }
            }
        });

        return NextResponse.json(checkins);
    } catch (error) {
        console.error("Erro Checkin GET:", error);
        return NextResponse.json({ error: "Erro ao buscar check-ins" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });

        await prisma.checkIn.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erro Checkin DELETE:", error);
        return NextResponse.json({ error: "Erro ao excluir check-in" }, { status: 500 });
    }
}