import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Extrai apenas o que existe no seu banco atual
    const { 
      userId, 
      peso, 
      altura,
      imc,
      aguaIdeal, // Agora existe no banco
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
      return NextResponse.json({ error: "Dados obrigatórios faltando (Peso/Altura)" }, { status: 400 });
    }

    const novaAnamnese = await prisma.anamnese.create({
      data: {
        userId,
        peso: parseFloat(peso),
        altura: parseFloat(altura),
        imc: imc ? parseFloat(imc) : null,
        aguaIdeal: aguaIdeal ? parseFloat(aguaIdeal) : null, // Salva corretamente
        
        objetivo: objetivo || "Não informado",
        nivel: nivel || "Iniciante",
        
        frequencia: Number(frequencia) || 3,
        tempoDisponivel: Number(tempoDisponivel) || 60,
        
        // Garante array
        limitacoes: Array.isArray(limitacoes) ? limitacoes : [],
        cirurgias: Array.isArray(cirurgias) ? cirurgias : [],
        equipamentos: Array.isArray(equipamentos) ? equipamentos : [],
      },
    });

    // Atualiza User
    await prisma.user.update({
        where: { id: userId },
        data: { goal: objetivo, level: nivel }
    });

    return NextResponse.json(novaAnamnese);

  } catch (error: any) {
    console.error("ERRO BACKEND:", error);
    return NextResponse.json({ error: "Erro ao salvar: " + error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "UserId necessário" }, { status: 400 });

  try {
    const anamnese = await prisma.anamnese.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(anamnese);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}