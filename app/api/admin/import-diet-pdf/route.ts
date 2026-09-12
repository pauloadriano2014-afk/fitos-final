import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 🔥 A sua chave já está segura no .env do Render
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo PDF foi enviado." }, { status: 400 });
    }

    // Prepara o PDF em base64 para a visão nativa da IA
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // 🔥 ATUALIZADO: GEMINI 2.0 FLASH (O MAIS RÁPIDO E INTELIGENTE)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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
    2. GRUPOS DIFERENTES POR PADRÃO (MUITO IMPORTANTE): Alimentos de uma mesma refeição que NÃO estão ligados pela palavra "ou" são itens DIFERENTES que se somam na refeição (o aluno come os dois, não escolhe um OU outro) — cada um precisa de um "groupId" ÚNICO E DIFERENTE dos outros, mesmo estando um logo depois do outro na lista. NUNCA reutilize o mesmo "groupId" para itens de categorias diferentes (ex: arroz e feijão e frango são 3 grupos DIFERENTES) só porque estão na mesma refeição. Exemplo de uma refeição com "Arroz Branco 100g, Feijão 80g, Frango Grelhado 120g ou 3 Ovos":
       [
         { "name": "Arroz Branco", "amount": "100", "unit": "g", "groupId": "grp1" },
         { "name": "Feijão", "amount": "80", "unit": "g", "groupId": "grp2" },
         { "name": "Frango Grelhado", "amount": "120", "unit": "g", "groupId": "grp3" },
         { "name": "Ovos", "amount": "3", "unit": "unid", "groupId": "grp3" }
       ]
       Repare que só "Frango Grelhado" e "Ovos" dividem o "grp3" (por causa do "ou" explícito) — Arroz e Feijão têm cada um o seu próprio groupId, mesmo sem nenhuma palavra de ligação entre eles.
    3. UNIDADES: Traduza para as unidades padrão. "gramas" vira "g", "unidades" vira "unid", "fatias" vira "fatia".
    4. QUANTIDADES (NUTRIUM): Se disser "1 unidade pequena de filé de frango grelhado (100 g)", extraia a gramatura: amount: "100", unit: "g". Ignore o "1 unidade pequena".
    5. HORÁRIOS: Procure horários como "08:00", "12:00" que antecedem as refeições.
    `;

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