import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Desestruturando TUDO: O que já existia + Novos campos VIP
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
      equipamentos,
      
      // --- NOVOS CAMPOS VIP (NUTRIÇÃO) ---
      refeicoesDia,
      alergias,
      alimentosAversao, // O que ele não gosta
      suplementos
    } = body;

    // Validação básica de segurança (Mantida)
    if (!userId || !peso || !altura) {
      return NextResponse.json({ error: "Dados obrigatórios faltando" }, { status: 400 });
    }

    const novaAnamnese = await prisma.anamnese.create({
      data: {
        userId,
        
        // --- DADOS FÍSICOS (Mantidos) ---
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
        
        // Arrays Antigos
        limitacoes: limitacoes || [],
        cirurgias: cirurgias || [],
        equipamentos: equipamentos || [],

        // --- NOVOS DADOS VIP (Adicionados) ---
        // Se o usuário for COMUM, esses dados virão vazios/nulos, e tudo bem:
        refeicoesDia: refeicoesDia ? Number(refeicoesDia) : null,
        alergias: alergias || [],
        alimentosAversao: alimentosAversao || [],
        suplementos: suplementos || []
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