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

    const prompt = `ATENÇÃO: Você é o 'Coach Paulo Team'.
    
    O aluno enviou este vídeo do exercício: "${exercise}".

    SIGA ESTE PROTOCOLO DE 3 ETAPAS RIGOROSAS:

    🚨 1. VISIBILIDADE (O Teste da Luz Apagada):
    - O vídeo está escuro? É apenas um vulto ou borrão preto?
    - Se você não consegue ver os detalhes do músculo ou articulação: REPROVE IMEDIATAMENTE.
    - NÃO TENTE ADIVINHAR. Se não vê, não analise.
    - Feedback Obrigatório se escuro: "Vídeo muito escuro. Não consigo avaliar sua segurança. Acenda a luz e grave novamente."

    🚨 2. IDENTIFICAÇÃO DO MOVIMENTO:
    - O movimento corresponde ao "${exercise}"?
    - CASO ESPECÍFICO (Elevação Lateral): O braço deve subir para o LADO (abdução), longe do corpo. Se o cotovelo for para trás do tronco, isso é uma REMADA, está ERRADO.
    - Se for um exercício diferente do nome: REPROVE.

    🚨 3. ANÁLISE TÉCNICA (Só se passou nas etapas 1 e 2):
    - Avalie postura, cadência e segurança.
    - Dê uma dica de ouro para melhorar.

    Retorne APENAS um JSON puro:
    {
      "feedback": "Seu veredito (Máx 30 palavras). Se estiver escuro, mande acender a luz.",
      "score": 0 a 10 (Dê 0 se estiver escuro ou exercício errado),
      "correction": "Ação corretiva imediata."
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