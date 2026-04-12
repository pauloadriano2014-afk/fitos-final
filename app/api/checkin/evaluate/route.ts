import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';

// 🔥 DETONADOR DE CACHE: Obriga o servidor a processar na hora
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

// 🔥 CONFIGURAÇÃO DO CLOUDFLARE R2 🔥
const s3Client = process.env.R2_ACCOUNT_ID ? new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
}) : null;

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

export async function POST(req: Request) {
    try {
        const { checkinId, coachFeedback, userId, images } = await req.json();

        if (!coachFeedback) {
            return NextResponse.json({ error: "O texto do laudo (coachFeedback) é obrigatório." }, { status: 400 });
        }

        let checkIn;

        // ====================================================================
        // CASO 1: FLUXO NORMAL (Avaliando um Check-in Existente do Aluno)
        // ====================================================================
        if (checkinId) {
            checkIn = await prisma.checkIn.update({
                where: { id: checkinId },
                data: { coachFeedback },
                include: {
                    user: { select: { name: true, pushToken: true } }
                }
            });
        } 
        // ====================================================================
        // CASO 2: FLUXO LABORATÓRIO IA (Criando um Relatório Técnico Avulso)
        // ====================================================================
        else if (userId) {
            let uploadedUrls: string[] = [];

            // 1. Faz o Upload das fotos para o Cloudflare R2
            if (images && images.length > 0 && s3Client) {
                for (let i = 0; i < images.length; i++) {
                    // Limpa o prefixo do base64 caso venha do frontend
                    const base64Data = typeof images[i] === 'string' ? images[i] : (images[i].data || '');
                    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(cleanBase64, 'base64');
                    
                    // Salva organizado na pasta: lab_evaluations / ID_DO_ALUNO / foto.jpg
                    const fileName = `lab_evaluations/${userId}/lab_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`;

                    const command = new PutObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: fileName,
                        Body: buffer,
                        ContentType: "image/jpeg",
                    });

                    await s3Client.send(command);
                    uploadedUrls.push(`${R2_PUBLIC_URL}/${fileName}`);
                }
            }

            // 2. Cria o novo Laudo na tabela de Check-ins
            checkIn = await prisma.checkIn.create({
                data: {
                    userId: userId,
                    date: new Date(),
                    coachFeedback: coachFeedback,
                    photoFront: uploadedUrls[0] || null,
                    photoSide: uploadedUrls[1] || null,
                    photoBack: uploadedUrls[2] || null,
                    extraPhotos: uploadedUrls.length > 3 ? uploadedUrls.slice(3) : [],
                    weight: 0, 
                    feedback: "Relatório Técnico gerado via Laboratório IA."
                },
                include: {
                    user: { select: { name: true, pushToken: true } }
                }
            });
        } 
        else {
            return NextResponse.json({ error: "Faltam parâmetros (checkinId ou userId)." }, { status: 400 });
        }

        // ====================================================================
        // ENVIO DE NOTIFICAÇÃO PUSH PRO ALUNO
        // ====================================================================
        if (checkIn.user?.pushToken) {
            fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: checkIn.user.pushToken,
                    sound: 'default',
                    title: '📋 Relatório Técnico Disponível!',
                    body: 'O Coach analisou seu shape e enviou um novo laudo. Toque para ver!',
                }),
            }).catch(err => console.log("Erro ao enviar push pro aluno:", err));
        }

        return NextResponse.json({ success: true, checkIn });

    } catch (error) {
        console.error("Erro checkin/evaluate:", error);
        return NextResponse.json({ error: "Erro ao salvar avaliação e fazer upload." }, { status: 500 });
    }
}
