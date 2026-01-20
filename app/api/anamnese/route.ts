import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const { 
      userId, 
      peso, 
      altura,
      imc,
      aguaIdeal,
      objetivo, 
      nivel, 
      frequencia, 
      tempoDisponivel,
      limitacoes, 
      cirurgias,
      equipamentos
    } = body;

    console.log("Recebendo Anamnese para:", userId);

    if (!userId || !peso || !altura) {
      return NextResponse.json({ error: "Dados obrigatórios faltando" }, { status: 400 });
    }

    const novaAnamnese = await prisma.anamnese.create({
      data: {
        userId,
        peso: parseFloat(peso),
        altura: parseFloat(altura),
        imc: imc ? parseFloat(imc) : null,
        aguaIdeal: aguaIdeal ? parseFloat(aguaIdeal) : null,
        objetivo: objetivo || "Não informado",
        nivel: nivel || "Iniciante",
        frequencia: Number(frequencia) || 3,
        tempoDisponivel: Number(tempoDisponivel) || 60,
        limitacoes: Array.isArray(limitacoes) ? limitacoes : [],
        cirurgias: Array.isArray(cirurgias) ? cirurgias : [],
        equipamentos: Array.isArray(equipamentos) ? equipamentos : [],
      },
    });

    return NextResponse.json(novaAnamnese);

  } catch (error: any) {
    console.error("ERRO BACKEND:", error);
    return NextResponse.json({ error: "Erro ao salvar: " + error.message }, { status: 500 });
  }
}

// 👇 AQUI ESTÁ A CORREÇÃO (Voltei para findMany)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "UserId necessário" }, { status: 400 });

  try {
    // Busca TODAS as fichas (retorna Array), ordenadas da mais recente
    const anamneses = await prisma.anamnese.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    
    // Retorna a lista completa, não só um objeto. O Admin vai entender.
    return NextResponse.json(anamneses);
    
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}