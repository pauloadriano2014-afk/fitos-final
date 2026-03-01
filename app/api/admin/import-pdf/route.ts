import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';

// Força a rota a ser dinâmica (necessário para uploads no Next.js)
export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo PDF foi enviado." }, { status: 400 });
    }

    // Converter o File do Next.js para Buffer (exigência do pdf-parse)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extrair o texto do PDF
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text;

    // Prompt Cirúrgico para a IA focado na estrutura do seu Frontend
    const systemPrompt = `
    Você é um assistente de Personal Trainer especialista em estruturação de dados. 
    Vou enviar o texto extraído de um treino em PDF gerado pelo aplicativo MFIT.
    Sua tarefa é extrair os dados e convertê-los EXATAMENTE para este formato JSON:

    {
      "workoutName": "Nome da Rotina (ex: Janeiro/Fevereiro)",
      "exercisesByDay": {
        "A": [
          {
            "title": "Nome exato do exercício no PDF",
            "category": "Tente adivinhar a categoria (Peito, Costas, Pernas, Ombros, Bíceps, Tríceps, Abdômen, Cardio)",
            "blocks": [
              {
                "sets": "3", 
                "reps": "12-10-10",
                "restTime": "45",
                "technique": "NORMAL"
              }
            ],
            "observation": "Qualquer instrução extra (ex: Carga: 20kg. Contração 2 seg.)"
          }
        ]
      },
      "dayNames": { "A": "Costas e bíceps", "B": "Glúteos e Quadríceps" }
    }

    REGRAS DE EXTRAÇÃO:
    1. exercisesByDay: Use as chaves "A", "B", "C", etc., para cada dia de treino.
    2. dayNames: Mapeie a letra do dia para o título muscular original que estava no PDF.
    3. sets e reps: Separe o formato '3/15-12-10' (sets: "3", reps: "15-12-10").
    4. restTime: Extraia apenas o número (ex: '45s' -> "45"). Se não houver, use "60".
    5. technique: Leia as "Instruções" e o contexto. Use APENAS os valores: "DROPSET", "RESTPAUSE", "BISET", "21", "CLUSTERSET", "GVT" ou "NORMAL".
    6. BISET: Se houver "Exercícios combinados" ou "Alterne esses exercícios", os próximos dois exercícios pertencem a um BISET. Atribua "BISET" no campo technique do array 'blocks' deles.
    `;

    // Chamada à OpenAI forçando resposta em JSON
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Texto do PDF:\n\n${extractedText}` }
      ],
      temperature: 0.1 // Temperatura baixa para respostas exatas
    });

    const aiResponse = response.choices[0].message.content;
    
    if (!aiResponse) {
        throw new Error("Resposta da IA vazia");
    }

    const structuredWorkout = JSON.parse(aiResponse);

    return NextResponse.json(structuredWorkout, { status: 200 });

  } catch (error: any) {
    console.error("Erro na importação via IA:", error);
    return NextResponse.json(
      { error: "Falha ao processar o PDF e gerar o treino.", details: error.message },
      { status: 500 }
    );
  }
}