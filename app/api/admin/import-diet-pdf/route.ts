import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

// 🔥 Cole sua chave do Gemini aqui dentro das aspas
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'SUA_CHAVE_DO_GEMINI_AQUI');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo PDF foi enviado." }, { status: 400 });
    }

    // Prepara o PDF para o Gemini "olhar" para ele
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemPrompt = `
    Você é um nutricionista esportivo e especialista em estruturação de dados.
    Estou te enviando um PDF de dieta (gerado pelo Nutrium ou similar).
    Leia o documento e extraia os dados EXATAMENTE para este formato JSON:

    {
      "meals": [
        {
          "name": "Nome da Refeição (Ex: Café da Manhã, Pós-Treino)",
          "time": "HH:MM (Ex: 08:00)",
          "notes": "Qualquer observação extra da refeição (Deixe vazio se não tiver)",
          "items": [
            {
              "name": "Nome do alimento limpo",
              "amount": "Apenas o número numérico (Ex: 100, 2, 1.5)",
              "unit": "APENAS UMA DESSAS E NO SINGULAR: g, ml, unid, colher, fatia, xícara",
              "groupId": "Identificador único do grupo de substituição (Ex: grp1)"
            }
          ]
        }
      ]
    }

    REGRAS DE EXTRAÇÃO:
    1. AGRUPAMENTO ("ou" / "SUBSTITUIÇÃO"): Se o PDF diz "100g de Frango OU 3 Ovos", eles são substitutos e pertencem ao MESMO "groupId".
    2. UNIDADES: Traduza para as unidades padrão. "gramas" vira "g", "unidades" vira "unid", "fatias" vira "fatia".
    3. QUANTIDADES (NUTRIUM): Se disser "1 unidade pequena de filé de frango grelhado (100 g)", extraia a gramatura: amount: "100", unit: "g". Ignore o "1 unidade pequena".
    4. HORÁRIOS: Procure horários como "08:00", "12:00" que antecedem as refeições.
    `;

    // O Gemini engole o PDF direto, sem precisar de bibliotecas de extração no Node
    const result = await model.generateContent([
      systemPrompt,
      { inlineData: { data: base64Data, mimeType: 'application/pdf' } }
    ]);

    const responseText = result.response.text();
    let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsedData = JSON.parse(cleanJson);

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
    console.error("Erro na importação da Dieta via Gemini:", error);
    return NextResponse.json(
      { error: "Falha ao processar o PDF com o Gemini.", details: error.message },
      { status: 500 }
    );
  }
}