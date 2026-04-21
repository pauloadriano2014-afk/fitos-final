// app/api/admin/import-pdf/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const mode = formData.get('mode') as string || 'FULL'; // 🔥 Lendo o modo de importação

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo PDF foi enviado." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 🔥 PDF2JSON PARA EXTRAÇÃO BRUTA E CONFIÁVEL 🔥
    const PDFParser = require("pdf2json");
    
    const extractedText = await new Promise<string>((resolve, reject) => {
      const pdfParser = new PDFParser(null, 1); // 1 = Extrair apenas o texto puro
      
      pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
      pdfParser.on("pdfParser_dataReady", () => {
        resolve(pdfParser.getRawTextContent());
      });

      pdfParser.parseBuffer(buffer);
    });

    console.log(`🔥 LIDO COM SUCESSO! Modo: ${mode} | Tamanho do texto:`, extractedText.length);

    // 🔥 O COMANDO MESTRE PARA QUEBRAR A PREGUIÇA DO GPT
    const modeInstruction = mode === 'FULL' 
        ? `🚨 ALERTA CRÍTICO: Este é um PDF de ROTINA COMPLETA. Ele contém múltiplos dias de treino (ex: Treino A, Treino B, Treino C, etc.).
           Você DEVE mapear TODOS os dias encontrados no documento. NÃO interrompa a extração após o primeiro dia.
           Analise o documento do início ao fim e crie as chaves "A", "B", "C", "D", "E", etc., no objeto "exercisesByDay" conforme os dias mudam no PDF.`
        : `🚨 Este PDF contém apenas UM dia de treino (avulso). Coloque absolutamente TODOS os exercícios extraídos dentro da chave "A" no objeto "exercisesByDay". Ignora quebras de dia se houver.`;

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
            "category": "Tente adivinhar a categoria",
            "blocks": [
              {
                "sets": "1", 
                "reps": "15",
                "load": "30kgs",
                "restTime": "60",
                "technique": "NORMAL"
              },
              {
                "sets": "1", 
                "reps": "12",
                "load": "40kgs",
                "restTime": "60",
                "technique": "NORMAL"
              }
            ],
            "observation": ""
          }
        ]
      }
    }

    ${modeInstruction}

    REGRAS DE EXTRAÇÃO ADICIONAIS:
    1. load (CARGA): AGORA VOCÊ DEVE EXTRAIR AS CARGAS! Se houver progressão de carga (ex: 30-40-40-45kgs) ou de repetições (ex: 15-12-10-8), crie um bloco individual para CADA série dentro do array 'blocks' (sets: "1") com sua respectiva "reps" e "load" (carga extraída exatamente como no PDF, ex: "10kgs de cada lado" ou "40kgs").
    2. Séries Simples: Se a carga e as repetições forem iguais para todas as séries (ex: Séries: 3/10, Carga: 20kgs), crie um único bloco (ex: sets: "3", reps: "10", load: "20kgs").
    3. restTime: Extraia apenas o número (ex: '45s' -> "45"). Se não houver, use "60".
    4. technique: Leia as "Instruções" e o contexto. Use APENAS os valores: "DROPSET", "RESTPAUSE", "BISET", "21", "CLUSTERSET", "GVT" ou "NORMAL".
    5. BISET: Se houver "Exercícios combinados" ou "Alterne esses exercícios", os próximos dois exercícios pertencem a um BISET. Atribua "BISET" no campo technique.
    6. observation: Deixe vazio (""), a não ser que o PDF tenha instruções extras relevantes sobre a execução (ex: "Segure bem a descida").
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Texto do PDF:\n\n${extractedText}` }
      ],
      temperature: 0.1 
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