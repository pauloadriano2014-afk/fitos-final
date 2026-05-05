import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configurações
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);
const prisma = new PrismaClient();

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// 🔥 FUNÇÃO NATIVA PARA NOTIFICAR O COACH
async function notifyCoach(alunoName: string, exerciseName: string, score: number) {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { pushToken: true }
    });

    if (admin?.pushToken) {
      const message = {
        to: admin.pushToken,
        sound: 'default',
        title: '🤖 IA de Vídeo Utilizada!',
        body: `${alunoName} analisou: ${exerciseName}. Nota: ${score}/10.`,
      };

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
    }
  } catch (error) {
    console.error("❌ Erro ao enviar push notification:", error);
  }
}

// Helper para aguardar o processamento no Google AI
async function waitForProcessing(fileName: string, label: string) {
  let fileState = await fileManager.getFile(fileName);
  let tentativas = 0;
  while (fileState.state === "PROCESSING") {
    tentativas++;
    console.log(`⏳ Processando ${label} no Google... (Tentativa ${tentativas}/20)`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    fileState = await fileManager.getFile(fileName);
    if (tentativas >= 20) throw new Error(`O Google demorou demais para processar o ${label}.`);
  }
  if (fileState.state === "FAILED") throw new Error(`Google falhou ao processar o formato do ${label}.`);
  return fileState;
}

export async function POST(req: Request) {
  const tempFilesToClean: string[] = [];

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    const rawExercise = formData.get('exerciseName') as string || 'Exercício';
    const alunoName = formData.get('alunoName') as string || 'Um aluno';
    
    // 🔥 NOVO: RECEBE A URL DO GABARITO (CLOUDFLARE) DO FRONTEND
    const referenceVideoUrl = formData.get('referenceVideoUrl') as string; 
    
    const parts = rawExercise.split(' | REGRAS DO COACH:');
    const exerciseName = parts[0].trim();
    const eliteRules = parts[1] ? `\n    🚨 REGRAS EXCLUSIVAS PARA ESTE EXERCÍCIO:\n    - ${parts[1].trim()}` : '';

    if (!file) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    if (file.size > 50 * 1024 * 1024) { 
        return NextResponse.json({ error: "Vídeo muito pesado.", details: "Tente gravar um vídeo mais curto (max 10s)." }, { status: 413 });
    }

    console.log(`🎥 1. Recebendo vídeo do Aluno [${alunoName}]: ${file.name} - Ex: ${exerciseName}`);

    // --- 1. PREPARA O VÍDEO DO ALUNO ---
    const actualMimeType = file.type || "video/mp4";
    const extension = actualMimeType.includes("quicktime") ? ".mov" : ".mp4";
    const studentBuffer = Buffer.from(await file.arrayBuffer());
    const studentTempPath = path.join(os.tmpdir(), `student-${Date.now()}${extension}`);
    fs.writeFileSync(studentTempPath, studentBuffer);
    tempFilesToClean.push(studentTempPath);

    // --- 2. PREPARA O VÍDEO DE REFERÊNCIA (GABARITO), SE EXISTIR E FOR CLOUDFLARE/HTTP ---
    let refTempPath = '';
    let refMimeType = 'video/mp4';
    if (referenceVideoUrl && referenceVideoUrl.startsWith('http')) {
      console.log(`📥 2. Baixando vídeo Gabarito... URL: ${referenceVideoUrl}`);
      try {
        const refRes = await fetch(referenceVideoUrl);
        if (refRes.ok) {
          const refBuffer = Buffer.from(await refRes.arrayBuffer());
          refMimeType = refRes.headers.get('content-type') || 'video/mp4';
          const refExtension = refMimeType.includes("quicktime") ? ".mov" : ".mp4";
          refTempPath = path.join(os.tmpdir(), `ref-${Date.now()}${refExtension}`);
          fs.writeFileSync(refTempPath, refBuffer);
          tempFilesToClean.push(refTempPath);
        } else {
          console.log(`⚠️ Falha ao baixar gabarito. Seguindo sem ele.`);
        }
      } catch (fetchErr) {
        console.log(`⚠️ Erro de rede ao buscar o vídeo gabarito:`, fetchErr);
      }
    }

    // --- 3. UPLOAD PARA O GOOGLE AI (CONCORRENTE PARA GANHAR TEMPO) ---
    console.log(`🚀 3. Enviando para Google AI...`);
    const uploadTasks = [];
    
    uploadTasks.push(
      fileManager.uploadFile(studentTempPath, { mimeType: actualMimeType, displayName: `Student_${exerciseName.replace(/[^a-zA-Z0-9]/g, '')}` })
    );

    if (refTempPath) {
      uploadTasks.push(
        fileManager.uploadFile(refTempPath, { mimeType: refMimeType, displayName: `CoachRef_${exerciseName.replace(/[^a-zA-Z0-9]/g, '')}` })
      );
    }

    const uploadResults = await Promise.all(uploadTasks);
    const studentUpload = uploadResults[0];
    const refUpload = uploadResults.length > 1 ? uploadResults[1] : null;

    // --- 4. AGUARDA PROCESSAMENTO ---
    const waitTasks = [waitForProcessing(studentUpload.file.name, "Vídeo do Aluno")];
    if (refUpload) {
      waitTasks.push(waitForProcessing(refUpload.file.name, "Vídeo do Coach"));
    }
    await Promise.all(waitTasks);

    console.log("🟢 Vídeos prontos! Iniciando Scanner Biomecânico...");

    // --- 5. MONTA O PROMPT INTELIGENTE (COM OU SEM GABARITO) ---
    let promptIntro = "";
    if (refUpload) {
      promptIntro = "ATENÇÃO: Você é o treinador de Elite 'Coach Paulo'.\n" +
      "Eu estou lhe enviando DOIS vídeos executando o exercício: '" + exerciseName + "'.\n\n" +
      "🎥 O PRIMEIRO VÍDEO é o GABARITO (A execução perfeita feita por você).\n" +
      "🎥 O SEGUNDO VÍDEO é a execução do ALUNO.\n\n" +
      "Sua tarefa é agir como um 'jogo dos 7 erros' biomecânico. Compare rigorosamente a execução do ALUNO com o seu GABARITO. O aluno está inclinando mais o tronco? A amplitude está menor? O quadril joga pra trás? Seja cirúrgico.\n";
    } else {
      promptIntro = "ATENÇÃO: Você é o treinador de Elite 'Coach Paulo'.\n" +
      "O aluno enviou este vídeo executando o exercício: '" + exerciseName + "'. Analise com extremo rigor biomecânico.\n";
    }

    const prompt = promptIntro + 
    "\nSIGA ESTE PROTOCOLO DE 3 ETAPAS RIGOROSAS:\n\n" +
    "🚨 1. VISIBILIDADE:\n" +
    "- O vídeo do aluno está escuro ou ângulo impossível de avaliar? Se sim, retorne: 'Vídeo escuro ou ângulo ruim. Não consigo avaliar. Refaça a gravação.'\n\n" +
    "🚨 2. IDENTIFICAÇÃO DO MOVIMENTO:\n" +
    "- O aluno está fazendo o movimento correto de '" + exerciseName + "'? Se estiver fazendo outro exercício, REPROVE e diga: 'Você selecionou " + exerciseName + ", mas está gravando outro movimento.'\n\n" +
    "🚨 3. ANÁLISE TÉCNICA E BIOMECÂNICA:\n" +
    "- Avalie postura da coluna, cadência, profundidade/amplitude e segurança articular.\n" +
    "- Se houver GABARITO, aponte exatamente onde a postura do aluno divergiu do gabarito.\n" +
    "- ⚠️ NUNCA ELOGIE se houver flexão excessiva de tronco, lombar curvada ou falta de amplitude.\n" +
    eliteRules + "\n\n" +
    "Retorne APENAS um JSON puro no formato abaixo:\n" +
    "{\n" +
    "  \"feedback\": \"Veredito técnico e direto do que está errado (Máximo 30 palavras).\",\n" +
    "  \"score\": 0 a 10,\n" +
    "  \"correction\": \"A Dica de Ouro focada em consertar o erro detectado para ficar igual ao gabarito.\"\n" +
    "}";

    // Monta o array multimodal dinamicamente
    const contentParts: any[] = [];
    if (refUpload) {
      contentParts.push({ fileData: { mimeType: refMimeType, fileUri: refUpload.file.uri } });
      contentParts.push({ text: "Este vídeo acima é o GABARITO." });
    }
    contentParts.push({ fileData: { mimeType: actualMimeType, fileUri: studentUpload.file.uri } });
    contentParts.push({ text: "Este vídeo acima é o ALUNO." });
    contentParts.push({ text: prompt });

    // 🔥 SISTEMA DE MOTOR DUPLO 🔥
    const model25Flash = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const model25Pro = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    let result;
    try {
      console.log("🔥 Rodando Análise Comparativa (2.5-flash)...");
      result = await model25Flash.generateContent(contentParts);
    } catch (err: any) {
      console.log("⚠️ Falhou no Flash. Acionando o tanque reserva (2.5-PRO)...");
      try {
        result = await model25Pro.generateContent(contentParts);
      } catch (errPro: any) {
        return NextResponse.json({
          feedback: "Sistema de análise sobrecarregado no momento.",
          score: 0,
          correction: "Aguarde 1 minuto e tente analisar novamente."
        }, { status: 200 }); 
      }
    }

    const rawText = result.response.text();
    
    // 🔥 CORREÇÃO DO ERRO DO VS CODE (Sem Regex) 🔥
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    let cleanedText = rawText;
    
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleanedText = rawText.substring(firstBrace, lastBrace + 1);
    }

    console.log("🤖 Veredito Biomecânico:", cleanedText);

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanedText);
    } catch (e) {
        jsonResponse = { feedback: cleanedText, score: 0, correction: "Não foi possível extrair a dica de ouro. Tente de novo." };
    }

    if (jsonResponse.score >= 0) {
      await notifyCoach(alunoName, exerciseName, jsonResponse.score);
    }

    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error("❌ ERRO NO SERVER DE VÍDEO:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  } finally {
    // 🔥 LIMPEZA DA GARAGEM: Apaga todos os vídeos temporários
    tempFilesToClean.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    });
  }
}