const fs = require('fs');

// 1. Carrega o ficheiro JSON original da base de dados
console.log("A ler o ficheiro Exercise.json...");
const rawData = fs.readFileSync('Exercise.json');
const exercises = JSON.parse(rawData);

// 2. O Cérebro do Tagger: Regras de identificação
const tagExercise = (ex) => {
    const name = ex.name.toLowerCase();
    const category = ex.category ? ex.category.toLowerCase() : '';

    let target = category.toUpperCase(); // Fallback para a categoria principal
    let mechanic = 'ISOLADO';
    let equipment = 'LIVRE';
    let jointRisk = [];

    // 🔥 FOCO DO MÚSCULO (Target)
    if (name.includes('stiff') || name.includes('flexora')) target = 'POSTERIOR';
    else if (name.includes('extensora') || name.includes('agachamento') || name.includes('leg press') || name.includes('hack')) target = 'QUADRICEPS';
    else if (name.includes('pelve') || name.includes('abdução') || name.includes('glúteo') || name.includes('elevação pélvica') || name.includes('coice')) target = 'GLUTEOS';
    else if (name.includes('supino') || name.includes('crucifixo') || name.includes('peck deck')) target = 'PEITO';
    else if (name.includes('remada') || name.includes('puxada') || name.includes('serrote') || name.includes('pull down')) target = 'COSTAS';
    else if (name.includes('desenvolvimento') || name.includes('elevação lateral') || name.includes('elevação frontal')) target = 'OMBROS';
    else if (name.includes('tríceps') || name.includes('francesa') || name.includes('testa')) target = 'TRICEPS';
    else if (name.includes('bíceps') || name.includes('rosca')) target = 'BICEPS';
    else if (name.includes('abdominal') || name.includes('prancha') || name.includes('infra')) target = 'ABDOMEN';

    // 🔥 MECÂNICA (Composto vs Isolado)
    if (name.includes('agachamento') || name.includes('leg press') || name.includes('supino') || 
        name.includes('remada') || name.includes('puxada') || name.includes('desenvolvimento') || 
        name.includes('stiff') || name.includes('terra') || name.includes('hack') || name.includes('mergulho')) {
        mechanic = 'COMPOSTO';
    }

    // 🔥 EQUIPAMENTO (Equipment)
    if (name.includes('máquina') || name.includes('maq') || name.includes('leg') || name.includes('extensora') || name.includes('flexora') || name.includes('peck deck') || name.includes('hack')) {
        equipment = 'MAQUINA';
    } else if (name.includes('cross') || name.includes('polia') || name.includes('cabo')) {
        equipment = 'POLIA';
    } else if (name.includes('halter')) {
        equipment = 'HALTER';
    } else if (name.includes('barra') || name.includes('smith')) {
        equipment = 'BARRA';
    } else if (name.includes('caneleira')) {
        equipment = 'CANELEIRA';
    } else if (name.includes('prancha') || name.includes('livre') || name.includes('corporal')) {
        equipment = 'PESO CORPORAL';
    }

    // 🔥 RISCO ARTICULAR (Para o Smart Swap & Warn)
    if (name.includes('stiff') || name.includes('terra') || name.includes('remada curvada') || name.includes('agachamento livre')) {
        jointRisk.push('LOMBAR');
    }
    if (name.includes('agachamento') || name.includes('extensora') || name.includes('leg press') || name.includes('hack') || name.includes('sissy')) {
        jointRisk.push('JOELHO');
    }
    if (name.includes('desenvolvimento') || name.includes('tríceps testa') || name.includes('puxada costas') || name.includes('crucifixo')) {
        jointRisk.push('OMBRO');
    }

    // Devolve o exercício intacto, mas com o objeto "tags" injetado
    return {
        ...ex,
        tags: {
            target,
            mechanic,
            equipment,
            jointRisk
        }
    };
};

// 3. Executa a magia em todos os exercícios
console.log("A aplicar a inteligência artificial de tags...");
const taggedExercises = exercises.map(tagExercise);

// 4. Guarda o resultado num ficheiro novo
fs.writeFileSync('Exercise_tagged.json', JSON.stringify(taggedExercises, null, 2));

console.log(`\n🔥 Sucesso Absoluto! ${taggedExercises.length} exercícios foram tagueados.`);
console.log("O ficheiro 'Exercise_tagged.json' foi criado e está pronto para ir para a base de dados.");