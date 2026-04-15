import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 🔥 1. DESTRUTURANDO TODOS OS CAMPOS QUE VÊM DO APP
    const { 
      userId, peso, altura, imc, aguaIdeal,
      objetivo, nivel, frequencia, tempoDisponivel,
      limitacoes, cirurgias, equipamentos,
      // 🔥 CAMPOS NUTRICIONAIS (VIP/ELITE)
      mealsPerDay, wakeUpTime, sleepTime, workTime, trainTime,
      allergies, foodPreferences, foodAversions, supplements
    } = body;

    if (!userId || !peso || !altura) {
      return NextResponse.json({ error: "Dados obrigatórios faltando" }, { status: 400 });
    }

    // 🔥 2. GRAVANDO TUDO NO BANCO DE DADOS
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
        
        // 🔥 INJETANDO OS DADOS DE NUTRIÇÃO PARA O RAIO-X
        mealsPerDay: mealsPerDay ? Number(mealsPerDay) : null,
        wakeUpTime: wakeUpTime || null,
        sleepTime: sleepTime || null,
        workTime: workTime || null,
        trainTime: trainTime || null,
        allergies: allergies || null,
        foodPreferences: foodPreferences || null,
        foodAversions: foodAversions || null,
        supplements: supplements || null,
      },
    });

    return NextResponse.json(novaAnamnese);

  } catch (error: any) {
    console.error("ERRO BACKEND:", error);
    return NextResponse.json({ error: "Erro ao salvar: " + error.message }, { status: 500 });
  }
}

// 👇 AQUI ESTÁ A CORREÇÃO PARA O ADMIN
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "UserId necessário" }, { status: 400 });

  try {
    // Voltei para findFirst (Traz um Objeto Único, não uma lista)
    // O Admin espera { objetivo: '...' } e não [{ objetivo: '...' }]
    const anamnese = await prisma.anamnese.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json(anamnese);
    
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}