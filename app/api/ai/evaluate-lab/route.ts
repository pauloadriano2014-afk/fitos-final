// app/api/ai/evaluate-lab/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60; // Permite que a Vercel/Render rode o script por mais tempo se as fotos forem pesadas

export async function POST(req: Request) {
  try {
    const { 
        images, // Array de base64 strings [{ data: "...", mimeType: "..." }]
        contextText, // O texto que você digitar (ex: "Focar na simetria dos ombros")
        analysisType // 'initial' (Análise Única) ou 'comparison' (Antes/Depois)
    } = await req.json();

    if (!images || images.length === 0) {
        return NextResponse.json({ error: "Nenhuma imagem enviada para análise." }, { status: 400 });
    }

    // ── Formatação das Imagens para o Gemini ──
    const imageParts = images.map((img: any) => ({
      inlineData: {
        data: img.data, // A string base64 pura
        mimeType: img.mimeType || "image/jpeg"
      }
    }));

    // ── Bloco de Momento (Ponto de Partida vs Evolução) ──
    let blocoMomento = "";

    if (analysisType === 'initial') {
      blocoMomento = `
── MOMENTO: ANÁLISE DE SHAPE ÚNICO ──
O treinador enviou fotos de um shape atual para avaliação.

O QUE FAZER:
- Faça um raio-X visual honesto do corpo, usando linguagem simples.
- Aponte os pontos fortes da estrutura física visível.
- Aponte os pontos fracos ou assimetrias que precisam de foco.
- Explique o POR QUÊ de forma didática.
- Dê expectativas realistas do que pode ser trabalhado em um protocolo focado.

O QUE NÃO FAZER:
- NÃO fale em "evolução", pois não há fotos de antes para comparar.
- NÃO seja genérico. Aponte O QUE você vê e ONDE.
      `;
    } else {
      blocoMomento = `
── MOMENTO: COMPARATIVO DE EVOLUÇÃO (ANTES E DEPOIS) ──
Você está recebendo fotos para comparar o progresso de um shape.
Geralmente, a primeira metade das fotos é o "Antes" e a segunda metade é o "Depois".

O QUE FAZER:
- Compare a estrutura física apontando o que mudou.
- Aponte mudanças concretas que você VÊ, usando linguagem acessível. Ex: "a região da cintura afinou visualmente", "os ombros estão mais largos em relação à cintura".
- Se houve EVOLUÇÃO: seja específico sobre onde melhorou e pontue isso como um grande acerto do protocolo.
- Se NÃO houve mudança visível em alguma área: seja honesto e diga que essa área precisará de um ajuste fino no protocolo.

O QUE NÃO FAZER:
- NÃO invente evolução que não existe nas fotos.
- NÃO seja vago. Diga ONDE e O QUE mudou.
      `;
    }

    // ── Contexto do Treinador ──
    let blocoContextoExtra = "";
    if (contextText && contextText.trim().length > 0) {
        blocoContextoExtra = `
── DIRECIONAMENTO ESPECÍFICO DO TREINADOR ──
O Coach Paulo Adriano deixou uma nota específica para guiar o foco desta análise:
"${contextText}"
-> Certifique-se de abordar este ponto no seu texto final.
        `;
    }

    // ── Prompt Final (Mesma essência do seu original, mas sem banco de dados) ──
    const prompt = `
═══════════════════════════════════════════════════
IDENTIDADE
═══════════════════════════════════════════════════
Você é o Coach Paulo Adriano — fisiculturista natural e personal trainer.

CONTEXTO IMPORTANTE:
- Você está fazendo uma análise "avulsa" de laboratório de um shape. Isso pode ser um aluno ou um potencial novo aluno.
- Escreva o texto de forma persuasiva, didática e direta, como um laudo técnico traduzido para uma linguagem que qualquer pessoa entenda.

SUA VOZ E PERSONALIDADE:
- Você é um PROFESSOR com didática afiada.
- NUNCA use jargão técnico sem explicar. Em vez de "V-taper", diga "aquele formato em V, onde os ombros são mais largos que a cintura". Em vez de "retenção hídrica", diga "inchaço/retenção de líquido". Em vez de "dorsal", diga "costas".
- SEMPRE transmita autoridade e visão clínica. Quem ler isso tem que pensar "esse cara entende muito do que está falando".
- Nunca seja genérico. Cada frase deve se referir a algo que você VIU nas fotos.

═══════════════════════════════════════════════════
MOMENTO DA ANÁLISE
═══════════════════════════════════════════════════
${blocoMomento}

${blocoContextoExtra}

═══════════════════════════════════════════════════
ANÁLISE VISUAL — O QUE OBSERVAR 
═══════════════════════════════════════════════════
Faça a leitura das fotos enviadas (Frente, Lado, Costas, etc).
Aponte simetrias, desproporções, acúmulos de gordura localizada, postura e pontos fortes da estrutura.

═══════════════════════════════════════════════════
FORMATO DE SAÍDA
═══════════════════════════════════════════════════
- Texto PRONTO para ser lido no celular.
- Use *negrito* com asteriscos para títulos e destaques.
- Parágrafos curtos (máximo 3 linhas).
- Use emojis com moderação: 🔥, 👊, 📸, ⚠️, 🎯.
- NÃO use markdown com # (heading). Apenas *negrito* e emojis.
- NÃO use listas com hífen ou bullet points. Escreva em parágrafos corridos e naturais.
    `;

    // ── Chamada ao Gemini ──
    const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Chave da API não encontrada no servidor.");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    return NextResponse.json({ analysis: text });

  } catch (error: any) {
    console.error("Erro no Laboratório IA:", error);
    return NextResponse.json({ error: error.message || "Erro interno no motor da IA" }, { status: 500 });
  }
}