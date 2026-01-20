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

    // Validação simples
    if (!userId || !peso || !altura) {
      return NextResponse.json({ error: "Dados obrigatórios faltando (Peso/Altura)" }, { status: 400 });
    }

    // 1. SALVA A ANAMNESE (Isso estava certo)
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

    // 🔴 REMOVI AQUI O "prisma.user.update" QUE DAVA ERRO 🔴
    // O objetivo e nível já estão salvos na Anamnese, não precisa salvar no User.

    console.log("✅ Anamnese Salva com Sucesso ID:", novaAnamnese.id);
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