import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const accessKey = process.env.R2_ACCESS_KEY_ID || '';
const secretKey = process.env.R2_SECRET_ACCESS_KEY || '';
const publicUrl = process.env.R2_PUBLIC_URL || '';

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
        const { checkinId, coachFeedback, userId, images, customOldPhotos, silent } = await req.json();

        if (!coachFeedback && !silent) {
            return NextResponse.json({ error: "O texto do laudo é obrigatório." }, { status: 400 });
        }

        let finalFeedback = coachFeedback || "";
        let checkIn;

        // 🔥 O MOTOR QUE FALTAVA: Upar fotos da Galeria pro R2 e injetar o código [COMPARE] 🔥
        if (customOldPhotos && Array.isArray(customOldPhotos) && customOldPhotos.length > 0) {
            if (!s3Client) {
                return NextResponse.json({ error: "Erro: R2 não configurado." }, { status: 500 });
            }

            let uploadedOldUrls: string[] = [];

            for (let i = 0; i < customOldPhotos.length; i++) {
                const base64Data = customOldPhotos[i];
                
                // Se o slot estiver vazio (Ex: subiu Frente e Costas, mas não subiu a foto de Lado)
                if (!base64Data || base64Data.trim() === '') {
                    uploadedOldUrls.push('null'); // Guarda a posição vazia para não quebrar a ordem da tela dividida
                    continue;
                }

                const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(cleanBase64, 'base64');
                const fileName = `compare_base/${checkinId || userId}/base_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`;

                const command = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: fileName,
                    Body: buffer,
                    ContentType: "image/jpeg",
                });

                await s3Client.send(command);
                uploadedOldUrls.push(`${publicUrl}/${fileName}`);
            }

            // Junta os links do R2 e cria o carimbo secreto no texto
            const joinedUrls = uploadedOldUrls.join('|');
            finalFeedback = `[COMPARE:${joinedUrls}]\n` + finalFeedback;
        }

        // 🔥 ATUALIZA CHECK-IN (Fluxo Padrão da tela de Checkins) 🔥
        if (checkinId) {
            checkIn = await prisma.checkIn.update({
                where: { id: checkinId },
                data: { coachFeedback: finalFeedback },
                include: { user: { select: { name: true, pushToken: true } } }
            });
        } 
        // 🔥 CRIA NOVO CHECK-IN (Vindo da tela de Laboratório IA) 🔥
        else if (userId) {
            let uploadedUrls: string[] = [];

            if (images && images.length > 0) {
                if (!s3Client) {
                    return NextResponse.json({ error: "Erro: R2 não configurado." }, { status: 500 });
                }

                for (let i = 0; i < images.length; i++) {
                    const base64Data = typeof images[i] === 'string' ? images[i] : (images[i].data || '');
                    if (!base64Data || base64Data.trim() === '') continue;

                    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(cleanBase64, 'base64');
                    
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
                    coachFeedback: finalFeedback,
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

        // 🔥 PUSH NOTIFICATION (Não envia se for Baixa Silenciosa) 🔥
        if (checkIn.user?.pushToken && !silent) {
            fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Accept-encoding': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: checkIn.user.pushToken,
                    sound: 'default',
                    title: '📋 Relatório Técnico Disponível!',
                    body: 'O Coach analisou seu shape e enviou um novo laudo. Toque para ver!',
                }),
            }).catch(err => console.log("Erro ao enviar push:", err));
        }

        return NextResponse.json({ 
            success: true, 
            checkIn,
            updatedFeedback: finalFeedback
        });

    } catch (error) {
        console.error("Erro checkin/evaluate:", error);
        return NextResponse.json({ error: "Erro interno ao salvar avaliação." }, { status: 500 });
    }
}