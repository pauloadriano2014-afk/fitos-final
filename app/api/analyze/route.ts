import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configurações
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '');

export const maxDuration = 60; // Permite processamento mais longo
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let tempFilePath = '';

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    const exercise = formData.get('exerciseName') || 'Exercício';
    
    if (!file) {
      return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });
    }

    // 🛡️ TRAVA DE SEGURANÇA: 45MB (Aumentamos para garantir que vídeos de 6s passem folgados)
    if (file.size > 45 * 1024 * 1024) { 
        console.error("❌ ERRO: Arquivo muito grande:", file.size);
        return NextResponse.json({ 
            error: "Vídeo muito pesado.", 
            details: "Tente gravar um vídeo mais curto (max 6-7s)." 
        }, { status: 413 });
    }

    console.log(`🎥 1. Recebendo vídeo: ${file.name} (${file.size} bytes)`);

    // --- PASSO 1: SALVAR EM DISCO ---
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const fileName = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
    tempFilePath = path.join(os.tmpdir(), fileName);
    
    fs.writeFileSync(tempFilePath, buffer);
    console.log(`💾 2. Salvo temporariamente em: ${tempFilePath}`);

    // --- PASSO 2: UPLOAD PARA GOOGLE FILE MANAGER ---
    console.log("🚀 3. Enviando para o Google AI...");
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: "video/mp4",
      displayName: `Analysis ${exercise}`,
    });

    console.log(`✅ 4. Upload concluído. URI: ${uploadResponse.file.uri}`);

    // --- PASSO 3: ESPERAR PROCESSAMENTO ---
    let fileState = await fileManager.getFile(uploadResponse.file.name);
    
    while (fileState.state === "PROCESSING") {
      console.log("⏳ Processando vídeo no Google...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      fileState = await fileManager.getFile(uploadResponse.file.name);
    }

    if (fileState.state === "FAILED") {
      throw new Error("O Google falhou ao processar o vídeo.");
    }

    // --- PASSO 4: ANÁLISE ---
    // 🔥 AQUI ESTÁ A MUDANÇA QUE VOCÊ PEDIU:
    // Usando a versão 2.0 Flash (Estável)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Atue como um Treinador de Elite e Biomecânico. Analise este vídeo de ${exercise}.
    
    OBJETIVO: Dar um feedback de segurança e técnica que QUALQUER pessoa entenda.
    Seja didático, direto e motivador.
    
    Retorne APENAS um JSON puro (sem markdown) neste formato estrito:
    {
      "feedback": "Seu feedback principal aqui (Máx 25 palavras).",
      "score": 0 a 10,
      "correction": "Ação corretiva imediata (ex: 'Estufe o peito')."
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

    const responseText = result.response.text();
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    console.log("🤖 5. Resposta IA:", cleanedText);

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanedText);
    } catch (e) {
        jsonResponse = { 
            feedback: cleanedText,
            score: 0,
            correction: "Não foi possível estruturar a resposta."
        };
    }

    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error("❌ ERRO CRÍTICO:", error);
    
    // Tratamento específico para o erro de modelo não encontrado
    if (error.message?.includes('404') || error.message?.includes('not found')) {
        return NextResponse.json({ 
            error: "Erro de Configuração da IA.", 
            details: "Modelo Gemini não encontrado na região." 
        }, { status: 500 });
    }

    return NextResponse.json({ 
      error: "Erro na análise.", 
      details: error.message 
    }, { status: 500 });

  } finally {
    try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log("🧹 Arquivo temporário limpo.");
        }
    } catch (cleanupError) {
        console.error("Erro ao limpar arquivo:", cleanupError);
    }
  }
}