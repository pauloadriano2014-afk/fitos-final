const fs = require('fs');

// 🔥 COLOQUE SUA CHAVE NOVA AQUI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

async function generateGuideWithAI(exerciseName, tentativa = 1) {
    const prompt = `
    Você é um treinador de elite especialista em biomecânica. 
    Descreva a execução do exercício "${exerciseName}" em formato JSON rigoroso com as seguintes chaves:
    - "steps": Como executar (passo a passo direto).
    - "maleFocus": Foco para homens (hipertrofia, carga, falha, tensão mecânica).
    - "femaleFocus": Foco para mulheres (tônus, postura, controle motor, glúteos/pernas quando aplicável).
    - "safetyAlert": Um erro comum que deve ser evitado (aviso de segurança).
    
    Retorne APENAS o JSON válido, sem formatação markdown ou textos extras.
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();
        
        if (!data.candidates) {
            // 🔥 O SISTEMA DE TEIMOSIA: Se bater no 503 (Lotado) ou 429 (Limite), ele tenta de novo
            if (data.error && (data.error.code === 503 || data.error.code === 429)) {
                if (tentativa <= 5) {
                    console.log(`   ⏳ Servidor lotado. Respirando e tentando de novo... (Tentativa ${tentativa}/5)`);
                    await new Promise(resolve => setTimeout(resolve, 6000)); // Espera 6 segundos
                    return await generateGuideWithAI(exerciseName, tentativa + 1);
                }
            }
            
            console.error(`\n❌ Erro na API para ${exerciseName}:`, JSON.stringify(data, null, 2));
            return null;
        }

        const textResponse = data.candidates[0].content.parts[0].text;
        return JSON.parse(textResponse);
    } catch (error) {
        console.error(`❌ Erro no código para ${exerciseName}:`, error.message);
        return null;
    }
}

async function processExercises() {
    console.log('🚀 Iniciando o processamento PA ELITE TEAM...');
    
    const rawData = fs.readFileSync('Exercise.json', 'utf8');
    const exercises = JSON.parse(rawData);

    const uniqueExercises = [];
    const seenNames = new Set();

    for (const ex of exercises) {
        const cleanName = ex.name.trim().toLowerCase();
        if (!seenNames.has(cleanName)) {
            seenNames.add(cleanName);
            uniqueExercises.push(ex);
        }
    }

    console.log(`🔪 Duplicatas removidas! Total de exercícios únicos: ${uniqueExercises.length}`);
    console.log('🧠 Iniciando geração de inteligência com a IA (Deixe a tela aberta)...\n');

    const finalDatabase = [];

    for (let i = 0; i < uniqueExercises.length; i++) {
        const ex = uniqueExercises[i];
        console.log(`[${i + 1}/${uniqueExercises.length}] Gerando guia para: ${ex.name}...`);
        
        const guide = await generateGuideWithAI(ex.name);
        
        if (guide) {
            finalDatabase.push({
                id: ex.id,
                name: ex.name,
                category: ex.category,
                executionGuide: guide
            });
        }

        // Aumentamos o freio para 4 segundos para evitar irritar o servidor
        await new Promise(resolve => setTimeout(resolve, 4000));
    }

    fs.writeFileSync('ExerciseGuides_Final.json', JSON.stringify(finalDatabase, null, 2));
    console.log('\n✅ SUCESSO ABSOLUTO! Arquivo "ExerciseGuides_Final.json" salvo com sucesso.');
}

processExercises();