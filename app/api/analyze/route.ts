import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configurações
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '');
const prisma = new PrismaClient();

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// 🔥 FUNÇÃO NATIVA PARA NOTIFICAR O COACH VIA EXPO & PRISMA 🔥
async function notifyCoach(alunoName: string, exerciseName: string, score: number) {
  try {
    // 1. Busca o Administrador (Você) no banco de dados para pegar o Push Token
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { pushToken: true }
    });

    if (admin?.pushToken) {
      // 2. Monta a mensagem no padrão exato do Expo
      const message = {
        to: admin.pushToken,
        sound: 'default',
        title: '🤖 IA de Vídeo Utilizada!',
        body: `${alunoName} acabou de analisar o exercício: ${exerciseName}. Nota: ${score}/10.`,
      };

      // 3. Dispara direto pro servidor do Expo
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      console.log(`📱 Push Notification Expo enviada com sucesso pro Coach!`);
    } else {
      console.log(`⚠️ Coach não notificado: O usuário ADMIN não possui um pushToken registrado.`);
    }
  } catch (error) {
    console.error("❌ Erro ao enviar push notification:", error);
  }
}

export async function POST(req: Request) {
  let tempFilePath = '';

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    const rawExercise = formData.get('exerciseName') as string || 'Exercício';
    
    // 🔥 Captura o nome do aluno que o app vai enviar
    const alunoName = formData.get('alunoName') as string || 'Um aluno';
    
    // Separa o nome limpo das regras de elite enviadas pelo app
    const parts = rawExercise.split(' | REGRAS DO COACH:');
    const exerciseName = parts[0].trim();
    const eliteRules = parts[1] ? `\n    🚨 REGRAS EXCLUSIVAS PARA ESTE EXERCÍCIO (OBRIGATÓRIO SEGUIR):\n    - ${parts[1].trim()}` : '';

    if (!file) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    if (file.size > 50 * 1024 * 1024) { 
        return NextResponse.json({ 
            error: "Vídeo muito pesado.", 
            details: "Tente gravar um vídeo mais curto (max 10s)." 
        }, { status: 413 });
    }

    console.log(`🎥 1. Recebendo vídeo de [${alunoName}]: ${file.name} (${file.size} bytes, tipo: ${file.type}) - Ex: ${exerciseName}`);

    const actualMimeType = file.type || "video/mp4";
    const extension = actualMimeType.includes("quicktime") ? ".mov" : ".mp4";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
    tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, buffer);

    console.log(`🚀 2. Enviando para Google AI como ${actualMimeType}...`);
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: actualMimeType, 
      displayName: `Analysis ${exerciseName}`,
    });

    console.log(`✅ 3. Upload concluído. URI: ${uploadResponse.file.uri}`);

    let fileState = await fileManager.getFile(uploadResponse.file.name);
    let tentativas = 0;
    
    while (fileState.state === "PROCESSING") {
      tentativas++;
      console.log(`⏳ Processando vídeo no Google... (Tentativa ${tentativas}/20)`);
      
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

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // 🔥 O SEU PROMPT INTACTO
    const prompt = `ATENÇÃO: Você é o treinador de Elite 'Coach Paulo'.
    O aluno enviou este vídeo executando o exercício: "${exerciseName}".
    
    SIGA ESTE PROTOCOLO DE 3 ETAPAS RIGOROSAS:
    
    🚨 1. VISIBILIDADE:
    - O vídeo está escuro ou a câmera está virada para a parede? 
    - Se não for possível ver o movimento claramente, PARE a análise e retorne: "Vídeo escuro ou ângulo ruim. Não consigo avaliar. Refaça a gravação."
    
    🚨 2. IDENTIFICAÇÃO DO MOVIMENTO:
    - O movimento que o aluno está fazendo no vídeo corresponde à biomecânica do exercício "${exerciseName}"?
    - Se o aluno selecionou um exercício de braço, mas está fazendo perna (ou vice-versa), REPROVE IMEDIATAMENTE e diga: "Você selecionou ${exerciseName}, mas está gravando outro movimento. Corrija o card."
    
    🚨 3. ANÁLISE TÉCNICA E BIOMECÂNICA (O SEU DEVER PRINCIPAL):
    - Avalie a postura da coluna (lordose/cifose), a cadência (velocidade de subida e descida) e a segurança articular.
    ${eliteRules}
    - Dê um veredito direto e reto. Nada de elogios falsos se o treino estiver ruim.
    
    Retorne APENAS um JSON puro no formato abaixo, sem nenhum texto antes ou depois:
    {
      "feedback": "Seu veredito técnico direto (Máximo de 30 palavras).",
      "score": 0 a 10,
      "correction": "Sua Dica de Ouro ou Hack mental para corrigir a postura."
    }`;

    // 🔥 SISTEMA DE BLINDAGEM ANTI-FALHAS 429
    let result;
    const maxRetries = 2; 
    const baseDelayMs = 3000; 

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await model.generateContent([
          {
            fileData: {
              mimeType: actualMimeType,
              fileUri: uploadResponse.file.uri
            }
          },
          { text: prompt }
        ]);
        break; // Sucesso
      } catch (err: any) {
        const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
        
        if (isRateLimit && attempt < maxRetries) {
          console.log(`⚠️ [429] Limite atingido. Tentando novamente em ${baseDelayMs/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, baseDelayMs));
        } else if (isRateLimit) {
          console.log("❌ Limite do Google estourado de vez. Devolvendo mensagem amigável.");
          return NextResponse.json({
            feedback: "Sistema de análise de vídeo sobrecarregado no momento devido ao alto volume de treinos. Nossa IA está processando outros atletas da equipe.",
            score: 0,
            correction: "Aguarde cerca de 1 minuto e tente analisar o vídeo novamente. Mantenha o foco no treino!"
          }, { status: 200 }); 
        } else {
          throw err;
        }
      }
    }

    const rawText = result!.response.text();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const cleanedText = jsonMatch ? jsonMatch[0] : rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    console.log("🤖 Resposta IA (Limpa):", cleanedText);

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanedText);
    } catch (e) {
        jsonResponse = { 
            feedback: cleanedText, 
            score: 0, 
            correction: "Não foi possível estruturar a resposta. Tente novamente." 
        };
    }

    // 🔥 GATILHO DA NOTIFICAÇÃO PUSH PRO COACH 🔥
    if (jsonResponse.score > 0 || jsonResponse.score === 0) {
      await notifyCoach(alunoName, exerciseName, jsonResponse.score);
    }

    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error("❌ ERRO NO SERVER:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }
  }
}