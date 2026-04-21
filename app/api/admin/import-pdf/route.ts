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
    const mode = formData.get('mode') as string || 'FULL'; 

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
      "workoutName": "Nome da Rotina",
      "exercisesByDay": {
        "A": [
          {
            "title": "Nome exato do exercício",
            "category": "Tente adivinhar a categoria",
            "substitute": "Nome do exercício substituto (se houver, caso contrário deixe vazio)",
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

    🔥 REGRAS DE EXTRAÇÃO CRÍTICAS (SIGA À RISCA PARA NÃO QUEBRAR O APLICATIVO): 🔥
    
    1. QUEBRA OBRIGATÓRIA DE CARGAS E REPS: NUNCA retorne strings com hifens (ex: "25-25-30-30"). Se o PDF diz "Séries: 4/15-12-10-8" e "Carga: 30-40-40-45kgs", VOCÊ É OBRIGADO a criar exatos 4 objetos separados dentro do array "blocks". Bloco 1: reps "15", load "30kgs". Bloco 2: reps "12", load "40kgs", e assim sucessivamente.
    
    2. QUANTIDADE EXATA DE SÉRIES: Nunca invente blocos extras. Se o texto diz "Séries: 4/15" ou "4/falha", você DEVE gerar exatamente 4 blocos. Não gere 6 séries de forma alguma.
    
    3. SUBSTITUTOS ("Ou substitua por:"): Se no texto houver "Ou substitua por: [Nome do Exercicio]", preencha a propriedade "substitute" com o nome desse exercício substituto no exercício principal acima dele. NÃO crie um objeto de exercício independente para o substituto na lista principal!
    
    4. EXERCÍCIOS COMBINADOS (BISET - LEIA COM ATENÇÃO!): Quando o PDF indicar "Exercícios combinados" ou "Alterne esses exercícios" e listar DOIS ou mais exercícios diferentes (ex: "Elevação frontal neutra" e "Elevação frontal C/ANILHA"), você DEVE CRIAR DOIS OBJETOS SEPARADOS no JSON. NÃO misture e NÃO some as séries deles em um único exercício. Crie um objeto para cada um e coloque "technique": "BISET" em todos os blocos de ambos.
    
    5. INDEPENDÊNCIA DOS DIAS: Não misture exercícios com o mesmo nome que aparecem em dias diferentes. Se a "Elevação Lateral" aparece no Treino B e no Treino E, trate-os como entradas separadas dentro de suas respectivas chaves "B" e "E".
    
    6. restTime: Extraia apenas o número inteiro (ex: '45s' -> "45"). Se não houver informação de descanso, use "60".
    
    7. technique: O valor deve ser EXATAMENTE um destes, em maiúsculo: "DROPSET", "RESTPAUSE", "BISET", "21", "CLUSTERSET", "GVT" ou "NORMAL".
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