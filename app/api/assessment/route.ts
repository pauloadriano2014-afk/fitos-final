// app/api/assessment/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// 🔥 CONFIGURAÇÃO DO CLOUDFLARE R2 🔥
const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT as string,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
});

const safeFloat = (val: any) => {
    if (val === '' || val === null || val === undefined) return null;
    const str = String(val).replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
};

// 🔥 FUNÇÃO DE UPLOAD PARA O R2 COM SHARP 🔥
async function uploadToR2(base64String: string | null, userId: string, prefix: string) {
    if (!base64String) return null;
    if (base64String.startsWith('http')) return base64String;

    try {
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const timestamp = Date.now();
        const fileName = `assessments/${userId}/${timestamp}-${prefix}.jpg`;
        const thumbFileName = `assessments/${userId}/${timestamp}-${prefix}-thumb.jpg`;

        const command = new PutObjectCommand({
            Bucket: 'fitos-fotos',
            Key: fileName,
            Body: buffer,
            ContentType: 'image/jpeg',
        });
        await s3.send(command);

        try {
            const thumbBuffer = await sharp(buffer)
                .resize({ width: 300, withoutEnlargement: true }) 
                .jpeg({ quality: 60 }) 
                .toBuffer();

            const thumbCommand = new PutObjectCommand({
                Bucket: 'fitos-fotos',
                Key: thumbFileName,
                Body: thumbBuffer,
                ContentType: 'image/jpeg',
            });
            await s3.send(thumbCommand);
        } catch (thumbError) {
            console.log("Aviso: Falha ao gerar thumbnail, mas foto original foi salva.", thumbError);
        }
        
        const publicUrlBase = (process.env.R2_PUBLIC_URL as string).replace(/\/$/, ""); 
        return `${publicUrlBase}/${fileName}`; 
    } catch (error) {
        console.error(`Erro ao subir ${prefix} para o R2:`, error);
        return null;
    }
}

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

    // 🔥 INCLUDE REMOVIDO: Agora a busca é direta e à prova de falhas (Evita o Erro 500)
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
        userId, date, weight, height, method, 
        bodyFat, muscleMass, visceralFat, notes, 
        folds, measures,
        neck, shoulders, chest, chestMeasure, arms, armLeft, forearms, forearmLeft, waist, abdomen, hips, thighs, thighLeft, calves, calfLeft,
        foldTriceps, foldSubscapular, foldChest, foldAxillary, foldSuprailiac, foldAbdominal, foldThigh,
        photoFront, photoSide, photoBack
    } = body;

    if (!userId || !weight) {
        return NextResponse.json({ error: "Peso e ID são obrigatórios" }, { status: 400 });
    }

    const f = folds || {};
    const m = measures || {};

    // 🔥 FAZ O UPLOAD DAS FOTOS ANTES DE SALVAR NO BANCO 🔥
    const [frontUrl, sideUrl, backUrl] = await Promise.all([
        uploadToR2(photoFront, userId, 'front'),
        uploadToR2(photoSide, userId, 'side'),
        uploadToR2(photoBack, userId, 'back')
    ]);

    // 🔥 AGRUPA AS URLS NO ARRAY ESPERADO PELO PRISMA 🔥
    const uploadedPhotos = [frontUrl || '', sideUrl || '', backUrl || ''];

    const newAssessment = await prisma.assessment.create({
        data: {
            userId,
            date: date ? new Date(date) : new Date(),
            weight: Number(String(weight).replace(',', '.')),
            height: safeFloat(height),
            
            // 🔥 Array de Fotos (Mapeado corretamente)
            photos: uploadedPhotos,
            
            neck: safeFloat(m.neck || neck),
            shoulders: safeFloat(m.shoulders || shoulders),
            chest: safeFloat(m.chest || chestMeasure || chest), // Mapeado para receber da tela com segurança
            waist: safeFloat(m.waist || waist),
            abdomen: safeFloat(m.abdomen || abdomen),
            hips: safeFloat(m.hips || hips),
            
            arms: safeFloat(m.arms || arms),
            armLeft: safeFloat(m.armLeft || armLeft),
            forearms: safeFloat(m.forearms || forearms),
            forearmLeft: safeFloat(m.forearmLeft || forearmLeft),
            
            thighs: safeFloat(m.thighs || thighs),
            thighLeft: safeFloat(m.thighLeft || thighLeft),
            calves: safeFloat(m.calves || calves),
            calfLeft: safeFloat(m.calfLeft || calfLeft),

            method: method || "MANUAL",
            foldTriceps: safeFloat(f.triceps || foldTriceps),
            foldSubscapular: safeFloat(f.subscapular || foldSubscapular),
            foldChest: safeFloat(f.chest || foldChest),
            foldAxillary: safeFloat(f.axillary || foldAxillary),
            foldSuprailiac: safeFloat(f.suprailiac || foldSuprailiac),
            foldAbdominal: safeFloat(f.abdominal || foldAbdominal),
            foldThigh: safeFloat(f.thigh || foldThigh),

            bodyFat: safeFloat(bodyFat),
            muscleMass: safeFloat(muscleMass),
            visceralFat: safeFloat(visceralFat),
            notes: notes || ""
        }
    });

    return NextResponse.json({ success: true, id: newAssessment.id });

  } catch (error: any) {
    console.error("Erro Backend POST:", error);
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

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { 
        id, date, weight, method, 
        bodyFat, 
        chest, chestMeasure, shoulders, hips, arms, armLeft, forearms, forearmLeft, waist, abdomen, thighs, thighLeft, calves, calfLeft,
        foldTriceps, foldSubscapular, foldChest, foldAxillary, foldSuprailiac, foldAbdominal, foldThigh,
        photoFront, photoSide, photoBack 
    } = body;

    if (!id) return NextResponse.json({ error: "ID obrigatório para edição" }, { status: 400 });

    // 🔥 BUSCA A AVALIAÇÃO PARA PEGAR O userId E AS FOTOS ANTIGAS 🔥
    const existingAssessment = await prisma.assessment.findUnique({
        where: { id },
        select: { userId: true, photos: true }
    });

    if (!existingAssessment) {
        return NextResponse.json({ error: "Avaliação não encontrada" }, { status: 404 });
    }

    const userId = existingAssessment.userId;
    let finalPhotos = existingAssessment.photos || [];

    // 🔥 UPA APENAS SE FORAM ENVIADAS NOVAS FOTOS 🔥
    let frontUrl = photoFront !== undefined ? await uploadToR2(photoFront, userId, 'front') : undefined;
    let sideUrl = photoSide !== undefined ? await uploadToR2(photoSide, userId, 'side') : undefined;
    let backUrl = photoBack !== undefined ? await uploadToR2(photoBack, userId, 'back') : undefined;

    // 🔥 MESCLA AS FOTOS NOVAS COM AS ANTIGAS NO ARRAY 🔥
    const mergedPhotos = [
        frontUrl !== undefined ? (frontUrl || '') : (finalPhotos[0] || ''),
        sideUrl !== undefined ? (sideUrl || '') : (finalPhotos[1] || ''),
        backUrl !== undefined ? (backUrl || '') : (finalPhotos[2] || '')
    ];

    const updatedAssessment = await prisma.assessment.update({
        where: { id },
        data: {
            date: date ? new Date(date) : undefined,
            // 🔥 PREVENÇÃO CONTRA ERRO 500: Só tenta formatar o peso se ele realmente foi enviado. 
            weight: weight ? Number(String(weight).replace(',', '.')) : undefined,
            
            // 🔥 Salvando o array final de fotos perfeitamente alinhado com o Prisma
            photos: mergedPhotos,

            chest: safeFloat(chestMeasure || chest),
            shoulders: safeFloat(shoulders),
            waist: safeFloat(waist),
            abdomen: safeFloat(abdomen),
            hips: safeFloat(hips),
            arms: safeFloat(arms),
            armLeft: safeFloat(armLeft),
            forearms: safeFloat(forearms),
            forearmLeft: safeFloat(forearmLeft),
            thighs: safeFloat(thighs),
            thighLeft: safeFloat(thighLeft),
            calves: safeFloat(calves),
            calfLeft: safeFloat(calfLeft),

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
    console.error("Erro Backend PUT:", error);
    return NextResponse.json({ error: error.message || "Erro interno ao atualizar" }, { status: 500 });
  }
}