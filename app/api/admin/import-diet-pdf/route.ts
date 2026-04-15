// app/api/admin/import-diet-pdf/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

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
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // 🔥 O PADRÃO OURO DE PDF: Lê qualquer tabela sem quebrar no servidor
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    let extractedText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        extractedText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }

    console.log(`🔥 PDF DE DIETA LIDO! Páginas: ${pdf.numPages} | Tamanho do texto:`, extractedText.length);

    if (extractedText.length < 150) {
        return NextResponse.json({ error: "O PDF não pôde ser lido ou é uma imagem escaneada." }, { status: 400 });
    }

    const systemPrompt = `
    Você é um nutricionista esportivo e especialista em estruturação de dados.
    Vou enviar o texto extraído de uma dieta em PDF (formato Nutrium ou texto livre do Coach).
    Sua tarefa é extrair os dados e convertê-los EXATAMENTE para este formato JSON:

    {
      "meals": [
        {
          "name": "Nome da Refeição",
          "time": "HH:MM",
          "notes": "Observações gerais (vazio se não tiver)",
          "items": [
            {
              "name": "Nome do alimento limpo",
              "amount": "Apenas número numérico (Ex: 100)",
              "unit": "APENAS UMA DESSAS E SEMPRE NO SINGULAR: g, ml, unid, colher, fatia, xícara",
              "groupId": "Identificador do grupo de substituição (Ex: grp1)"
            }
          ]
        }
      ]
    }

    REGRAS DE EXTRAÇÃO:
    1. AGRUPAMENTO ("ou" / "SUBSTITUIÇÃO"): Se o PDF diz "100g de Frango OU 3 Ovos", eles são substitutos e pertencem ao MESMO "groupId".
    2. UNIDADES NO SINGULAR: Se estiver "unidades", escreva "unid". Se estiver "fatias", escreva "fatia". Se estiver "gramas", escreva "g".
    3. QUANTIDADES (NUTRIUM): Se disser "1 unidade pequena de filé de frango grelhado (100 g)", extraia a gramatura: amount: "100", unit: "g".
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
    if (!aiResponse) throw new Error("Resposta da IA vazia");

    const parsedData = JSON.parse(aiResponse);

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
    console.error("Erro na importação da Dieta:", error);
    return NextResponse.json({ error: "Falha ao processar o PDF.", details: error.message }, { status: 500 });
  }
}