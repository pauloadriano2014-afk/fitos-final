// app/api/diet/meal-log/route.ts
// 🔥 Diário alimentar por refeição (16 set 2026) — registro opcional, um
// toque só (ver DietMealLog em nutrition.prisma pro significado de cada
// status). Nunca obriga nada: ausência de registro é só ausência, não vira
// "PULOU" automaticamente.
//
// GET  ?userId=&date=YYYY-MM-DD           → lista os registros do aluno nesse dia
// POST { userId, date, mealId, mealName, status, substitutionLabel?, note?, photo? }
//      → upsert por [userId, date, mealId]
//
// 🔥 (17 set 2026) `photo` opcional (base64) na refeição livre — Paulo pediu
// foto mas ficou preocupado com custo de armazenamento no Cloudflare R2, então
// aqui a compressão é BEM mais agressiva que a de checkin/route.ts: só uma
// imagem (sem thumb separado), redimensionada pra no máximo 800px de largura
// e qualidade 70. Isso mantém cada foto na faixa de ~80-150KB em vez dos
// 2-5MB de uma foto original de celular.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_STATUS = ['SEGUIU', 'SUBSTITUIU', 'PULOU', 'LIVRE'];

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT as string,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
  },
});

// 🔥 Upload comprimido pro diário alimentar — de propósito mais leve que o
// uploadToR2 do checkin (que guarda original + thumb). Aqui é só UMA imagem,
// já redimensionada e comprimida, pra não pesar no armazenamento com um uso
// casual e frequente (registro de refeição livre pode acontecer todo dia).
async function uploadCompressedDiaryPhoto(base64String: string, userId: string, mealId: string): Promise<string | null> {
  if (!base64String) return null;
  if (base64String.startsWith('http')) return base64String; // já é uma URL, não precisa re-subir

  try {
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    const inputBuffer = Buffer.from(base64Data, 'base64');

    const compressedBuffer = await sharp(inputBuffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const timestamp = Date.now();
    const safeMealId = String(mealId).replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `diary/${userId}/${timestamp}-${safeMealId}.jpg`;

    await s3.send(new PutObjectCommand({
      Bucket: 'fitos-fotos',
      Key: fileName,
      Body: compressedBuffer,
      ContentType: 'image/jpeg',
    }));

    const publicUrlBase = (process.env.R2_PUBLIC_URL as string).replace(/\/$/, '');
    return `${publicUrlBase}/${fileName}`;
  } catch (error) {
    console.error('[diet/meal-log] Erro ao subir foto pro R2:', error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');

    if (!userId || !date) {
      return NextResponse.json({ error: 'userId e date são obrigatórios' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, userId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const logs = await prisma.dietMealLog.findMany({ where: { userId, date } });
    return NextResponse.json(logs);
  } catch (error: any) {
    console.error('[diet/meal-log] Erro GET:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao buscar diário alimentar' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, date, mealId, mealName, status, substitutionLabel, note, photo } = body;

    if (!userId || !date || !mealId || !status) {
      return NextResponse.json({ error: 'userId, date, mealId e status são obrigatórios' }, { status: 400 });
    }
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: `status inválido: ${status}` }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, userId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const data: any = {
      mealName: mealName || '',
      status,
      substitutionLabel: substitutionLabel ?? null,
      note: note ?? null,
      coachId: student.coachId ?? null,
    };

    // 🔥 Só mexe em photoUrl se uma foto nova veio nesse POST — assim
    // reenviar o mesmo registro sem foto não apaga uma foto já salva antes.
    if (photo) {
      const uploadedUrl = await uploadCompressedDiaryPhoto(photo, userId, mealId);
      if (uploadedUrl) data.photoUrl = uploadedUrl;
    }

    const log = await prisma.dietMealLog.upsert({
      where: { userId_date_mealId: { userId, date, mealId } },
      update: data,
      create: { userId, date, mealId, ...data },
    });

    return NextResponse.json({ success: true, log });
  } catch (error: any) {
    console.error('[diet/meal-log] Erro POST:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao salvar diário alimentar' }, { status: 500 });
  }
}
