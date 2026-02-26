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

// 🔥 CORREÇÃO 1: Adicionado ": Request" para o TypeScript entender a requisição
export async function POST(req: Request) {
  let tempFilePath = '';

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    const exercise = formData.get('exerciseName') as string || 'Exercício';
    
    if (!file) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    // Trava de segurança aumentada para 50MB
    if (file.size > 50 * 1024 * 1024) { 
        return NextResponse.json({ 
            error: "Vídeo muito pesado.", 
            details: "Tente gravar um vídeo mais curto (max 10s)." 
        }, { status: 413 });
    }

    console.log(`🎥 1. Recebendo vídeo: ${file.name} (${file.size} bytes, tipo: ${file.type})`);

    // --- DESCOBRIR O FORMATO REAL DO ARQUIVO ---
    const actualMimeType = file.type || "video/mp4";
    const extension = actualMimeType.includes("quicktime") ? ".mov" : ".mp4";

    // --- SALVAR EM DISCO ---
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
    tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, buffer);

    // --- UPLOAD PARA GOOGLE ---
    console.log(`🚀 2. Enviando para Google AI como ${actualMimeType}...`);
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: actualMimeType, 
      displayName: `Analysis ${exercise}`,
    });

    console.log(`✅ 3. Upload concluído. URI: ${uploadResponse.file.uri}`);

    // --- AGUARDAR PROCESSAMENTO BLINDADO (ATÉ 60s) ---
    let fileState = await fileManager.getFile(uploadResponse.file.name);
    let tentativas = 0;
    
    while (fileState.state === "PROCESSING") {
      tentativas++;
      console.log(`⏳ Processando vídeo no Google... (Tentativa ${tentativas}/20)`);
      
      // Espera 3 segundos antes de perguntar de novo
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      fileState = await fileManager.getFile(uploadResponse.file.name);
      
      if (tentativas >= 20) {
        throw new Error("O Google demorou demais para processar esse arquivo.");
      }
    }

    if (fileState.state === "FAILED") {
        throw new Error("O Google falhou ao processar o formato do vídeo. Gravação incompatível.");
    }

    console.log("🟢 Vídeo pronto! Extraindo análise técnica...");

    // --- ANÁLISE ---
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `ATENÇÃO: Você é o 'Coach Paulo Team'.
    O aluno enviou este vídeo do exercício: "${exercise}".
    SIGA ESTE PROTOCOLO DE 3 ETAPAS RIGOROSAS:
    🚨 1. VISIBILIDADE:
    - O vídeo está escuro? É apenas um vulto ou borrão preto? Se não vê, não analise.
    - Feedback: "Vídeo escuro. Não consigo avaliar. Acenda a luz."
    🚨 2. IDENTIFICAÇÃO DO MOVIMENTO:
    - O movimento corresponde ao "${exercise}"? Se for diferente, reprove.
    🚨 3. ANÁLISE TÉCNICA:
    - Avalie postura, cadência e segurança.
    - Dê uma dica de ouro para melhorar.
    Retorne APENAS um JSON puro:
    {
      "feedback": "Seu veredito (Máx 30 palavras).",
      "score": 0 a 10,
      "correction": "Ação corretiva."
    }`;

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: actualMimeType,
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
        jsonResponse = { 
            feedback: cleanedText, 
            score: 0, 
            correction: "Não foi possível estruturar a resposta." 
        };
    }

    return NextResponse.json(jsonResponse);

  // 🔥 CORREÇÃO 2: Adicionado ": any" para liberar a extração do erro
  } catch (error: any) {
    console.error("❌ ERRO NO SERVER:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) { console.error("Erro ao limpar temp:", e); }
    }
  }
}