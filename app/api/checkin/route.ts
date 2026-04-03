// app/api/checkin/route.js
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

// 🔥 CONECTA O SERVIDOR AO CLOUDFLARE R2
const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// Função para fazer o upload da imagem e devolver o link público
async function uploadToR2(base64String, userId, prefix) {
    if (!base64String) return null;
    
    // Limpa o cabeçalho do base64
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Cria um nome de arquivo único
    const fileName = `checkins/${userId}/${Date.now()}-${prefix}.jpg`;

    const command = new PutObjectCommand({
        Bucket: 'fitos-fotos',
        Key: fileName,
        Body: buffer,
        ContentType: 'image/jpeg',
    });

    await s3.send(command);
    
    // Retorna o link final da foto montado com a URL pública
    const publicUrlBase = process.env.R2_PUBLIC_URL.replace(/\/$/, ""); 
    return `${publicUrlBase}/${fileName}`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, weight, feedback, photoFront, photoBack, photoSide, extraPhotos } = body;

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    // 🔥 FAZ O UPLOAD DE TODAS AS FOTOS PARA O CLOUDFLARE AO MESMO TEMPO
    const [frontUrl, backUrl, sideUrl] = await Promise.all([
        uploadToR2(photoFront, userId, 'front'),
        uploadToR2(photoBack, userId, 'back'),
        uploadToR2(photoSide, userId, 'side')
    ]);

    // Faz o upload das fotos extras dos atletas, se houver
    let extraUrls = [];
    if (Array.isArray(extraPhotos) && extraPhotos.length > 0) {
        extraUrls = await Promise.all(
            extraPhotos.map((photo, index) => uploadToR2(photo, userId, `extra-${index}`))
        );
    }

    // 1. Salva o Check-in no banco SOMENTE COM OS LINKS
    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        weight: parseFloat(weight) || null,
        feedback,
        photoFront: frontUrl,
        photoBack: backUrl,
        photoSide: sideUrl,
        extraPhotos: extraUrls,
        date: new Date()
      }
    });

    // 2. Pega os dados do aluno para notificar o Coach
    const userToUpdate = await prisma.user.findUnique({
        where: { id: userId },
        select: { coachId: true, name: true }
    });

    // 3. Zera a data de cobrança manual e atualiza o peso
    const updateData = { nextCheckInDate: null };
    if (weight) updateData.currentWeight = parseFloat(weight);

    await prisma.user.update({
        where: { id: userId },
        data: updateData
    }).catch(e => console.log("Erro ao atualizar peso e data do user:", e));

    // 4. NOTIFICAÇÃO PUSH PARA O COACH
    if (userToUpdate?.coachId) {
         const coach = await prisma.user.findUnique({
             where: { id: userToUpdate.coachId },
             select: { pushToken: true }
         });
         
         if (coach?.pushToken) {
             await fetch('https://exp.host/--/api/v2/push/send', {
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
             }).catch(err => console.log("Erro ao enviar push pro coach:", err));
         }
    }

    return NextResponse.json({ success: true, id: checkIn.id });

  } catch (error) {
    console.error("Erro Checkin POST:", error);
    return NextResponse.json({ error: "Erro ao enviar check-in" }, { status: 500 });
  }
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const adminId = searchParams.get('adminId'); 

    try {
        const whereClause = {};
        if (userId) {
            whereClause.userId = userId; 
        } else if (adminId) {
            whereClause.user = { coachId: adminId }; 
        }

        const checkins = await prisma.checkIn.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            include: {
                user: { select: { name: true, email: true } }
            },
            take: 15 // 🔥 CIRURGIA ANTI-CRASH: Baixou de 50 para 15 para não estourar a memória com fotos Base64 antigas
        });

        return NextResponse.json(checkins);
    } catch (error) {
        console.error("Erro Checkin GET:", error);
        return NextResponse.json({ error: "Erro ao buscar check-ins" }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        
        if (!id) return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });

        await prisma.checkIn.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erro Checkin DELETE:", error);
        return NextResponse.json({ error: "Erro ao excluir check-in" }, { status: 500 });
    }
}