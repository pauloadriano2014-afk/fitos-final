import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT as string,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
});

async function uploadToR2(base64String: string, userId: string, prefix: string) {
    if (!base64String) return null;
    
    // 🔥 Proteção: Se a string já for uma URL (começar com http), não tenta fazer upload de novo
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
    const { userId, weight, feedback, photoFront, photoBack, photoSide, extraPhotos } = body;

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    // Faz o upload paralelo para ganhar tempo
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

    // Atualiza dados do usuário
    const userToUpdate = await prisma.user.findUnique({
        where: { id: userId },
        select: { coachId: true, name: true }
    });

    const updateData: any = { nextCheckInDate: null };
    if (weight) updateData.currentWeight = parseFloat(weight);

    await prisma.user.update({
        where: { id: userId },
        data: updateData
    }).catch(e => console.log("Erro ao atualizar peso e data do user:", e));

    // Notificação Push para o Coach
    if (userToUpdate?.coachId) {
         const coach = await prisma.user.findUnique({
             where: { id: userToUpdate.coachId },
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
                     body: `O aluno ${userToUpdate.name || 'Atleta'} enviou as fotos de evolução.`,
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

        // 🔥 O SEGREDO DA VELOCIDADE: Trazemos 20 check-ins. 
        // Se eles forem URLs do R2, o peso é zero. Se forem Base64, você PRECISA rodar o SQL de limpeza.
        const checkins = await prisma.checkIn.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            select: {
                id: true,
                weight: true,
                feedback: true,
                date: true,
                photoFront: true,
                photoBack: true,
                photoSide: true,
                extraPhotos: true, 
                user: { select: { name: true, email: true } }
            },
            take: 20 
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