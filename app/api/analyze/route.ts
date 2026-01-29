import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configurações
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '');

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let tempFilePath = '';

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    const exercise = formData.get('exerciseName') || 'Exercício';
    
    if (!file) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    // Trava de segurança 45MB (Para aguentar vídeos de iPhone)
    if (file.size > 45 * 1024 * 1024) { 
        return NextResponse.json({ 
            error: "Vídeo muito pesado.", 
            details: "Tente gravar um vídeo mais curto (max 6-7s)." 
        }, { status: 413 });
    }

    console.log(`🎥 1. Recebendo vídeo: ${file.name} (${file.size} bytes)`);

    // --- SALVAR EM DISCO ---
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
    tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, buffer);

    // --- UPLOAD PARA GOOGLE ---
    console.log("🚀 2. Enviando para Google AI...");
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: "video/mp4",
      displayName: `Analysis ${exercise}`,
    });

    console.log(`✅ 3. Upload concluído. URI: ${uploadResponse.file.uri}`);

    // --- AGUARDAR PROCESSAMENTO ---
    let fileState = await fileManager.getFile(uploadResponse.file.name);
    while (fileState.state === "PROCESSING") {
      console.log("⏳ Processando vídeo...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      fileState = await fileManager.getFile(uploadResponse.file.name);
    }

    if (fileState.state === "FAILED") throw new Error("O Google falhou ao processar o vídeo.");

    // --- ANÁLISE (Prompt Detalhado - Coach Paulo Team) ---
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `ATENÇÃO: Você é o 'Coach Paulo Team', um especialista em biomecânica e musculação de elite.
    
    O aluno enviou este vídeo afirmando ser a execução do exercício: "${exercise}".

    SUA MISSÃO (SIGA RIGOROSAMENTE):

    1. IDENTIFICAÇÃO VISUAL (O Filtro Anti-Fraude):
       - Assista ao vídeo. O que está acontecendo?
       - É um ser humano fazendo musculação? É realmente o exercício "${exercise}"?
       - Se for um animal (cavalo, cachorro), uma parede, um teto, ou um exercício completamente diferente (ex: filmou o pé em vez de Supino), REPROVE.
       - NÃO invente feedback técnico se o vídeo não mostrar o exercício claro.

    2. ANÁLISE TÉCNICA (Se o vídeo estiver correto):
       - Avalie a segurança (coluna, articulações).
       - Avalie a cadência e amplitude.
       - Seja direto, técnico mas acessível.

    Retorne APENAS um JSON puro (sem markdown) neste formato estrito:
    {
      "feedback": "Seu veredito aqui. (Se for o vídeo errado, diga: 'Isso não é um ${exercise}, estou vendo [o que você viu]. Grave corretamente.'). (Máx 30 palavras)",
      "score": 0 a 10 (Dê 0 se for vídeo errado/fraude),
      "correction": "Ação corretiva imediata ou 'Envie o vídeo certo'."
    }`;

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: prompt }
    ]);

    const cleanedText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    console.log("🤖 Resposta IA:", cleanedText);

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanedText);
    } catch (e) {
        // Fallback caso a IA não mande JSON perfeito
        jsonResponse = { 
            feedback: cleanedText, 
            score: 0, 
            correction: "Não foi possível estruturar a resposta. Tente novamente." 
        };
    }

    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error("❌ ERRO NO SERVER:", error);
    
    // Tratamento específico para erro de modelo (caso o 2.0 saia do ar no futuro)
    if (error.message?.includes('404') || error.message?.includes('not found')) {
        return NextResponse.json({ 
            error: "Erro na IA.", 
            details: "Modelo indisponível no momento." 
        }, { status: 500 });
    }

    return NextResponse.json({ error: "Erro interno.", details: error.message }, { status: 500 });

  } finally {
    // Limpeza
    if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) { console.error("Erro ao limpar temp:", e); }
    }
  }
}