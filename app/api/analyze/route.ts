import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configurações
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '');

export const maxDuration = 60; // Permite processamento mais longo no Vercel/Render
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Caminho do arquivo temporário (fora do try para deletar no finally)
  let tempFilePath = '';

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    const exercise = formData.get('exerciseName') || 'Exercício';
    
    // Nível removido do frontend, assumimos padrão universal
    const level = 'Geral (Linguagem Universal)';

    if (!file) {
      return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });
    }

    console.log(`🎥 1. Recebendo vídeo: ${file.name} (${file.size} bytes)`);

    // --- PASSO 1: SALVAR EM DISCO (Para não estourar RAM do servidor) ---
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Cria nome único para não misturar alunos
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

    // --- PASSO 3: ESPERAR PROCESSAMENTO (Obrigatório para vídeo) ---
    let fileState = await fileManager.getFile(uploadResponse.file.name);
    
    // Loop de verificação (Polling)
    while (fileState.state === "PROCESSING") {
      console.log("⏳ Processando vídeo no Google...");
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Espera 2s
      fileState = await fileManager.getFile(uploadResponse.file.name);
    }

    if (fileState.state === "FAILED") {
      throw new Error("O Google falhou ao processar o vídeo.");
    }

    // --- PASSO 4: ANÁLISE ---
    // Usando Flash 2.0 (Mais rápido, barato e eficiente para vídeo)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Atue como um Treinador de Elite e Biomecânico. Analise este vídeo de ${exercise}.
    
    OBJETIVO: Dar um feedback de segurança e técnica que QUALQUER pessoa entenda (do iniciante ao avançado).
    Seja didático, direto e motivador. Evite "biquês" (termos técnicos) desnecessários.
    
    Retorne APENAS um JSON puro (sem markdown, sem crases) neste formato estrito:
    {
      "feedback": "Seu feedback principal aqui. Se houver erro, explique como corrigir. (Máx 25 palavras)",
      "score": 0 a 10 (Seja criterioso com a segurança),
      "correction": "Ação corretiva imediata (ex: 'Estufe o peito', 'Contraia o abdômen')."
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
    
    // Limpeza do JSON (caso venha com ```json ou espaços extras)
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    console.log("🤖 5. Resposta IA:", cleanedText);

    // Tenta parsear para garantir que é JSON válido
    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanedText);
    } catch (e) {
        // Se falhar o JSON, manda como texto no feedback para não quebrar o app
        jsonResponse = { 
            feedback: cleanedText,
            score: 0,
            correction: "Não foi possível estruturar a resposta."
        };
    }

    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error("❌ ERRO CRÍTICO:", error);
    return NextResponse.json({ 
      error: "Erro na análise.", 
      details: error.message 
    }, { status: 500 });

  } finally {
    // --- PASSO 5: FAXINA (Apagar arquivo do servidor) ---
    // Importante para não lotar o disco do Render
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