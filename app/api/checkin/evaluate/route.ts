import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

// 🔥 PUXANDO EXATAMENTE OS NOMES DO SEU .ENV 🔥
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const accessKey = process.env.R2_ACCESS_KEY_ID || '';
const secretKey = process.env.R2_SECRET_ACCESS_KEY || '';
const publicUrl = process.env.R2_PUBLIC_URL || '';

// 🔥 BUCKET FIXADO PELO SEU PRINT (fitos-fotos) 🔥
const bucketName = process.env.R2_BUCKET_NAME || 'fitos-fotos';

const s3Client = (accountId && accessKey && secretKey) ? new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
    },
}) : null;

export async function POST(req: Request) {
    try {
        const { checkinId, coachFeedback, userId, images } = await req.json();

        if (!coachFeedback) {
            return NextResponse.json({ error: "O texto do laudo (coachFeedback) é obrigatório." }, { status: 400 });
        }

        let checkIn;

        // ==========================================================
        // FLUXO 1: ATUALIZAR CHECK-IN EXISTENTE
        // ==========================================================
        if (checkinId) {
            checkIn = await prisma.checkIn.update({
                where: { id: checkinId },
                data: { coachFeedback },
                include: { user: { select: { name: true, pushToken: true } } }
            });
        } 
        // ==========================================================
        // FLUXO 2: GERAR LAUDO NOVO PELO LAB IA COM UPLOAD DE FOTOS
        // ==========================================================
        else if (userId) {
            let uploadedUrls: string[] = [];

            if (images && images.length > 0) {
                
                // Trava de segurança para garantir que conectou no R2
                if (!s3Client) {
                    return NextResponse.json({ error: "Erro no Servidor: Falha ao conectar com Cloudflare R2. Verifique as credenciais." }, { status: 500 });
                }

                for (let i = 0; i < images.length; i++) {
                    const base64Data = typeof images[i] === 'string' ? images[i] : (images[i].data || '');
                    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(cleanBase64, 'base64');
                    
                    // Vai salvar na pasta lab_evaluations/ID_ALUNO/foto.jpg
                    const fileName = `lab_evaluations/${userId}/lab_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`;

                    const command = new PutObjectCommand({
                        Bucket: bucketName,
                        Key: fileName,
                        Body: buffer,
                        ContentType: "image/jpeg",
                    });

                    await s3Client.send(command);
                    uploadedUrls.push(`${publicUrl}/${fileName}`);
                }
            }

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
                include: { user: { select: { name: true, pushToken: true } } }
            });
        } 
        else {
            return NextResponse.json({ error: "Faltam parâmetros (checkinId ou userId)." }, { status: 400 });
        }

        // ==========================================================
        // DISPARO DE PUSH NOTIFICATION
        // ==========================================================
        if (checkIn.user?.pushToken) {
            fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Accept-encoding': 'application/json', 'Content-Type': 'application/json' },
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
        return NextResponse.json({ error: "Erro interno ao salvar avaliação e fazer o upload." }, { status: 500 });
    }
}