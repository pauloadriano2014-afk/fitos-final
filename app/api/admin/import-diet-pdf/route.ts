// app/api/admin/import-diet-pdf/route.ts
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

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo PDF foi enviado." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 🔥 PDF2JSON PARA EXTRAÇÃO BRUTA (Mesmo padrão que você já usa nos treinos)
    const PDFParser = require("pdf2json");
    
    const extractedText = await new Promise<string>((resolve, reject) => {
      const pdfParser = new PDFParser(null, 1);
      
      pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
      pdfParser.on("pdfParser_dataReady", () => {
        resolve(pdfParser.getRawTextContent());
      });

      pdfParser.parseBuffer(buffer);
    });

    console.log(`🔥 PDF DE DIETA LIDO COM SUCESSO! Tamanho do texto:`, extractedText.length);

    const systemPrompt = `
    Você é um nutricionista esportivo e especialista em estruturação de dados.
    Vou enviar o texto extraído de uma dieta em PDF (pode ser formato Nutrium ou texto livre do Coach).
    Sua tarefa é extrair os dados e convertê-los EXATAMENTE para este formato JSON:

    {
      "meals": [
        {
          "name": "Nome da Refeição (Ex: Café da Manhã, Pós-Treino)",
          "time": "HH:MM (Ex: 08:00)",
          "notes": "Qualquer observação extra da refeição (Deixe vazio se não tiver)",
          "items": [
            {
              "name": "Nome do alimento limpo",
              "amount": "Apenas o número da quantidade (Ex: 100, 2, 1.5)",
              "unit": "APENAS UMA DESSAS: g, ml, unid, colher, fatia, xícara",
              "groupId": "Identificador único do grupo de substituição (Ex: grp1)"
            }
          ]
        }
      ]
    }

    REGRAS DE EXTRAÇÃO ADICIONAIS:
    1. AGRUPAMENTO ("OU" / "SUBSTITUIÇÃO"): Se o PDF diz "100g de Frango OU 3 Ovos", eles são substitutos e pertencem ao MESMO "groupId". Se o texto diz "SUBSTITUIÇÃO 1:", todos os itens dessa substituição recebem o mesmo "groupId" da opção principal. Alimentos que NÃO SÃO substitutos devem ter "groupId" diferentes.
    2. UNIDADES: Traduza para as unidades padrão. Exemplo: "gramas" vira "g", "unidades" vira "unid", "fatias" vira "fatia".
    3. QUANTIDADES: O campo "amount" deve ser numérico (ex: "100", não "100g").
    4. HORÁRIOS: Procure horários como "08:00", "12:00" que sempre antecedem as refeições.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Texto do PDF de Dieta:\n\n${extractedText}` }
      ],
      temperature: 0.1 
    });

    const aiResponse = response.choices[0].message.content;
    
    if (!aiResponse) {
        throw new Error("Resposta da IA vazia");
    }

    const parsedData = JSON.parse(aiResponse);

    // Prepara os UniqueIDs para o Front-end não engasgar
    const mealsReadyForApp = (parsedData.meals || []).map((meal: any) => ({
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        name: meal.name || 'Refeição',
        time: meal.time || '00:00',
        notes: meal.notes || '',
        items: (meal.items || []).map((item: any) => ({
            ...item,
            uniqueId: Date.now().toString() + Math.random().toString(36).substring(7),
            groupId: item.groupId || Date.now().toString() + Math.random().toString(36).substring(7),
            amount: item.amount?.toString() || "0",
            unit: item.unit || "g"
        }))
    }));

    return NextResponse.json({ meals: mealsReadyForApp }, { status: 200 });

  } catch (error: any) {
    console.error("Erro na importação da Dieta via IA:", error);
    return NextResponse.json(
      { error: "Falha ao processar o PDF da Dieta.", details: error.message },
      { status: 500 }
    );
  }
}