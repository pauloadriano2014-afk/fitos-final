// src/app/api/checkin/update-photo/route.ts
// Nova rota: recebe a foto editada em base64, faz upload pro R2
// e atualiza o campo correto do check-in no banco.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

const accountId  = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const accessKey  = process.env.R2_ACCESS_KEY_ID || '';
const secretKey  = process.env.R2_SECRET_ACCESS_KEY || '';
const publicUrl  = process.env.R2_PUBLIC_URL || '';
const bucketName = process.env.R2_BUCKET_NAME || 'fitos-fotos';

const s3Client = (accountId && accessKey && secretKey)
    ? new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    })
    : null;

export async function POST(req: Request) {
    try {
        const { checkinId, photoField, imageBase64 } = await req.json();
        // photoField: "photoFront" | "photoSide" | "photoBack"

        if (!checkinId || !photoField || !imageBase64) {
            return NextResponse.json(
                { error: "Parâmetros obrigatórios: checkinId, photoField, imageBase64." },
                { status: 400 }
            );
        }

        if (!s3Client) {
            return NextResponse.json({ error: "R2 não configurado no servidor." }, { status: 500 });
        }

        // 1. Converte base64 → buffer
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(cleanBase64, 'base64');

        // 2. Gera nome único e faz upload pro R2
        const fileName = `checkins/${checkinId}/edited_${photoField}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;

        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: "image/jpeg",
        }));

        const newUrl = `${publicUrl}/${fileName}`;

        // 3. Atualiza o campo correto no banco
        const updated = await prisma.checkIn.update({
            where: { id: checkinId },
            data: { [photoField]: newUrl },
        });

        return NextResponse.json({ success: true, newUrl, checkIn: updated });

    } catch (error) {
        console.error("Erro ao atualizar foto editada:", error);
        return NextResponse.json({ error: "Erro interno ao salvar foto." }, { status: 500 });
    }
}