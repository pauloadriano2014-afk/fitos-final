// src/app/api/checkin/update-photo/route.ts
// Rota unificada:
//   mode=single  → sobe a foto editada e atualiza o campo (photoFront/Side/Back)
//   mode=compare → sobe a imagem composta e injeta [COMPARE_IMG:url] no coachFeedback

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';

export const dynamic   = 'force-dynamic';
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

async function uploadBase64(base64: string, folder: string): Promise<string> {
    if (!s3Client) throw new Error('R2 não configurado.');
    const clean  = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    const key    = `${folder}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
    await s3Client.send(new PutObjectCommand({
        Bucket: bucketName, Key: key, Body: buffer, ContentType: 'image/jpeg',
    }));
    return `${publicUrl}/${key}`;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { mode, checkinId, photoField, imageBase64, compareCheckinId } = body;

        if (!checkinId || !imageBase64) {
            return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 });
        }

        // ── Modo individual: sobrescreve a foto com marcações ─────────────────
        if (mode === 'single') {
            if (!photoField) return NextResponse.json({ error: 'photoField obrigatório.' }, { status: 400 });

            const newUrl = await uploadBase64(imageBase64, `checkins/${checkinId}`);
            const updated = await prisma.checkIn.update({
                where: { id: checkinId },
                data:  { [photoField]: newUrl },
            });
            return NextResponse.json({ success: true, newUrl, checkIn: updated });
        }

        // ── Modo comparação: sobe imagem composta e insere tag no feedback ─────
        if (mode === 'compare') {
            const newUrl = await uploadBase64(imageBase64, `compare/${checkinId}`);

            // Busca o feedback atual para não apagar o texto
            const current = await prisma.checkIn.findUnique({ where: { id: checkinId } });
            if (!current) return NextResponse.json({ error: 'Check-in não encontrado.' }, { status: 404 });

            let feedback = current.coachFeedback || '';

            // Remove tag anterior de comparação se existir (evita duplicar)
            feedback = feedback.replace(/\[COMPARE_IMG:[^\]]+\]/g, '').trim();
            feedback = feedback.replace(/\[COMPARE:[^\]]+\]/g, '').trim();

            // Injeta a nova tag de imagem composta no início
            const updatedFeedback = `[COMPARE_IMG:${newUrl}]\n${feedback}`;

            const updated = await prisma.checkIn.update({
                where: { id: checkinId },
                data:  { coachFeedback: updatedFeedback },
            });

            return NextResponse.json({
                success: true,
                newUrl,
                updatedFeedback,
                checkIn: updated,
            });
        }

        return NextResponse.json({ error: 'mode inválido. Use "single" ou "compare".' }, { status: 400 });

    } catch (error) {
        console.error('Erro update-photo:', error);
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }
}