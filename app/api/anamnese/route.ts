import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Desestruturando TUDO que o Front-end novo manda
    const { 
      userId, 
      peso, 
      altura,
      imc,          // Novo
      aguaIdeal,    // Novo
      objetivo, 
      nivel, 
      frequencia, 
      tempoDisponivel,
      limitacoes, 
      cirurgias,    // Novo
      equipamentos 
    } = body;

    // Validação básica de segurança
    if (!userId || !peso || !altura) {
      return NextResponse.json({ error: "Dados obrigatórios faltando" }, { status: 400 });
    }

    const novaAnamnese = await prisma.anamnese.create({
      data: {
        userId,
        // Convertendo para garantir que são números (Float)
        peso: parseFloat(peso),
        altura: parseFloat(altura),
        imc: imc ? parseFloat(imc) : null,
        aguaIdeal: aguaIdeal ? parseFloat(aguaIdeal) : null,
        
        // Strings
        objetivo,
        nivel,
        
        // Inteiros
        frequencia: Number(frequencia),
        tempoDisponivel: Number(tempoDisponivel),
        
        // Arrays de String (Listas) - Se vier nulo, salva array vazio
        limitacoes: limitacoes || [],
        cirurgias: cirurgias || [],
        equipamentos: equipamentos || [],
      },
    });

    return NextResponse.json(novaAnamnese);

  } catch (error) {
    console.error("ERRO NA ANAMNESE:", error);
    return NextResponse.json({ error: "Erro ao salvar anamnese no servidor." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "UserId necessário" }, { status: 400 });

  try {
    const anamnese = await prisma.anamnese.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' } // Pega sempre a última ficha preenchida
    });
    return NextResponse.json(anamnese);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}