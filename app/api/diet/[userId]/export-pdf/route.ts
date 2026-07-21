// app/api/admin/diet/[userId]/export-pdf/route.ts
// Gera PDF profissional da dieta do aluno e retorna como base64
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import { generateDietHtml } from '@/utils/dietPdfTemplate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Render permite até 60s no plano pago

const prisma = new PrismaClient();

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // ── 1. Busca dados do aluno ──────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        gender: true,
        goal: true,
        currentWeight: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }

    // ── 2. Busca a dieta ativa ───────────────────────────────────────────────
    const diet = await prisma.diet.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: {
          orderBy: { order: 'asc' },
          where: {
            // Só versões principais (não alternativas)
            OR: [
              { isMainVersion: true },
              { alternativeGroupId: null },
            ],
          },
          include: { items: true },
        },
      },
    });

    if (!diet) {
      return NextResponse.json({ error: 'Nenhuma dieta encontrada' }, { status: 404 });
    }

    // ── 3. Gera o HTML ───────────────────────────────────────────────────────
    const html = generateDietHtml(user, diet);

    // ── 4. Puppeteer → PDF ───────────────────────────────────────────────────
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Importante no Render
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();

    // ── 5. Retorna base64 ────────────────────────────────────────────────────
    const base64 = Buffer.from(pdfBuffer).toString('base64');
    const studentName = user.name?.split(' ')[0] ?? 'Aluno';

    return NextResponse.json({
      success: true,
      base64,
      filename: `dieta_${studentName.toLowerCase()}.pdf`,
      studentName: user.name,
    });

  } catch (error: any) {
    console.error('Erro ao gerar PDF da dieta:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar PDF', details: error.message },
      { status: 500 }
    );
  }
}