import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      userId, 
      objetivo, 
      nivel, 
      frequencia, 
      limitacoes, 
      equipamentos, 
      peso, 
      altura,
      tempoDisponivel // <-- Campo adicionado conforme solicitado
    } = body;

    // Em vez de UPSERT, vamos apenas criar uma nova. 
    // Isso é melhor porque você mantém o histórico de evolução do aluno.
    const novaAnamnese = await prisma.anamnese.create({
      data: {
        userId,
        objetivo,
        nivel,
        frequencia: Number(frequencia),
        tempoDisponivel: Number(tempoDisponivel), // <-- Salva o tempo de treino
        limitacoes,
        equipamentos: equipamentos || [],
        peso: peso ? parseFloat(peso) : null,
        altura: altura ? parseFloat(altura) : null,
      },
    });

    return NextResponse.json(novaAnamnese);
  } catch (error) {
    console.error("ERRO NA ANAMNESE:", error);
    return NextResponse.json({ error: "Erro ao salvar anamnese" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "UserId necessário" }, { status: 400 });

  try {
    // Busca a mais recente
    const anamnese = await prisma.anamnese.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(anamnese);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar" }, { status: 500 });
  }
}