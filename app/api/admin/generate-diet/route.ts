// app/api/admin/generate-diet/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { anamnese, coachStyle = "Paulo Adriano Team" } = await req.json();

    if (!anamnese) {
      return NextResponse.json({ error: "Dados da anamnese não encontrados." }, { status: 400 });
    }

    const systemPrompt = `
    Você é o Assistente Técnico de Elite do Coach Paulo Adriano. 
    Sua missão é gerar um PLANO ALIMENTAR personalizado baseado na ANAMNESE do aluno e no MÉTODO PAULO ADRIANO.

    ESTILO DO MÉTODO (Baseado nos nossos protocolos padrão):
    - Foco em Comida de Verdade (Ovos, Arroz, Frango, Carne Moída, Banana, Aveia, Whey, Tapioca/Rap10).
    - Divisão de 5 a 7 refeições dependendo da rotina.
    - Uso constante de SUBSTITUIÇÕES (OUs). Ex: "100g de Frango OU 130g de Tilápia OU 3 Ovos".
    - Proteína alta (aprox. 2.2g/kg), Gordura moderada (1g/kg) e Carbo ajustado ao objetivo.
    - Notas úteis para o aluno em cada refeição.

    DADOS DO ALUNO:
    Objetivo: ${anamnese.objetivo}
    Peso: ${anamnese.peso}kg | Altura: ${anamnese.altura}cm
    Alergias: ${anamnese.allergies || 'Nenhuma'}
    Restrições: ${anamnese.foodAversions || 'Nenhuma'}
    Suplementos que já usa: ${anamnese.supplements || 'Nenhum'}
    Horários: Acorda ${anamnese.wakeUpTime}, Treina ${anamnese.trainTime}, Dorme ${anamnese.sleepTime}

    RETORNE APENAS UM JSON NO SEGUINTE FORMATO:
    {
      "meals": [
        {
          "name": "Nome da Refeição",
          "time": "HH:MM",
          "notes": "Instrução curta",
          "items": [
            {
              "name": "Alimento Principal",
              "amount": "100",
              "unit": "g",
              "groupId": "grp1"
            },
            {
              "name": "Alimento Substituto",
              "amount": "130",
              "unit": "g",
              "groupId": "grp1"
            }
          ]
        }
      ]
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Gere a melhor estratégia alimentar para este aluno agora." }
      ],
      temperature: 0.7 
    });

    const aiResponse = response.choices[0].message.content;
    const parsedData = JSON.parse(aiResponse || '{}');

    // Adiciona UniqueIDs necessários para o Front-end
    const mealsReady = (parsedData.meals || []).map((meal: any) => ({
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        ...meal,
        items: (meal.items || []).map((item: any) => ({
            ...item,
            uniqueId: Date.now().toString() + Math.random().toString(36).substring(7),
            groupId: item.groupId || Date.now().toString() + Math.random().toString(36).substring(7)
        }))
    }));

    return NextResponse.json({ meals: mealsReady }, { status: 200 });

  } catch (error: any) {
    console.error("Erro na geração via IA:", error);
    return NextResponse.json({ error: "Erro ao gerar dieta." }, { status: 500 });
  }
}