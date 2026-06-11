// app/api/checkin/update-photo/route.ts
// Salva foto editada preservando a original.
// mode=single  → salva editada em photoFront/Side/Back, preserva original em photoFrontOriginal etc
// mode=compare → salva imagem composta e injeta [COMPARE_IMG:url] no coachFeedback
// mode=restore → restaura a foto original (remove marcações)

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

// Mapa do campo editado → campo original correspondente
const ORIGINAL_FIELD: Record<string, string> = {
    photoFront: 'photoFrontOriginal',
    photoSide:  'photoSideOriginal',
    photoBack:  'photoBackOriginal',
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { mode, checkinId, photoField, imageBase64, compareCheckinId } = body;

        if (!checkinId) {
            return NextResponse.json({ error: 'checkinId obrigatório.' }, { status: 400 });
        }

        // ── Modo restaurar: remove marcações voltando para a foto original ────
        if (mode === 'restore') {
            if (!photoField) return NextResponse.json({ error: 'photoField obrigatório.' }, { status: 400 });

            const originalField = ORIGINAL_FIELD[photoField];
            const current = await prisma.checkIn.findUnique({ where: { id: checkinId } });
            if (!current) return NextResponse.json({ error: 'Check-in não encontrado.' }, { status: 404 });

            const originalUrl = (current as any)[originalField];
            if (!originalUrl) {
                return NextResponse.json({ error: 'Foto original não encontrada. A foto pode já ser a original.' }, { status: 400 });
            }

            // Restaura: copia originalUrl de volta para o campo editado e limpa o original
            const updated = await prisma.checkIn.update({
                where: { id: checkinId },
                data: {
                    [photoField]:    originalUrl,
                    [originalField]: null,       // limpa o backup
                },
            });

            return NextResponse.json({ success: true, restoredUrl: originalUrl, checkIn: updated });
        }

        if (!imageBase64) {
            return NextResponse.json({ error: 'imageBase64 obrigatório.' }, { status: 400 });
        }

        // ── Modo individual: salva foto editada e preserva a original ─────────
        if (mode === 'single') {
            if (!photoField) return NextResponse.json({ error: 'photoField obrigatório.' }, { status: 400 });

            const originalField = ORIGINAL_FIELD[photoField];

            // Busca o check-in para pegar a URL atual (para preservar como original)
            const current = await prisma.checkIn.findUnique({ where: { id: checkinId } });
            if (!current) return NextResponse.json({ error: 'Check-in não encontrado.' }, { status: 404 });

            const currentUrl  = (current as any)[photoField];
            const originalUrl = (current as any)[originalField];

            // Sobe a nova foto editada
            const newUrl = await uploadBase64(imageBase64, `checkins/${checkinId}`);

            // Só guarda o original na primeira edição (se já existe original, mantém)
            const updateData: Record<string, any> = { [photoField]: newUrl };
            if (!originalUrl && currentUrl) {
                updateData[originalField] = currentUrl;
            }

            const updated = await prisma.checkIn.update({
                where: { id: checkinId },
                data:  updateData,
            });

            return NextResponse.json({
                success: true,
                newUrl,
                hasOriginal: !!(updateData[originalField] || originalUrl),
                checkIn: updated,
            });
        }

        // ── Modo comparação: imagem composta ──────────────────────────────────
        if (mode === 'compare') {
            const newUrl = await uploadBase64(imageBase64, `compare/${checkinId}`);

            const current = await prisma.checkIn.findUnique({ where: { id: checkinId } });
            if (!current) return NextResponse.json({ error: 'Check-in não encontrado.' }, { status: 404 });

            let feedback = current.coachFeedback || '';
            feedback = feedback.replace(/\[COMPARE_IMG:[^\]]+\]/g, '').trim();
            feedback = feedback.replace(/\[COMPARE:[^\]]+\]/g, '').trim();

            const updatedFeedback = `[COMPARE_IMG:${newUrl}]\n${feedback}`;

            const updated = await prisma.checkIn.update({
                where: { id: checkinId },
                data:  { coachFeedback: updatedFeedback },
            });

            return NextResponse.json({ success: true, newUrl, updatedFeedback, checkIn: updated });
        }

        return NextResponse.json({ error: 'mode inválido. Use "single", "compare" ou "restore".' }, { status: 400 });

    } catch (error) {
        console.error('Erro update-photo:', error);
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }
}