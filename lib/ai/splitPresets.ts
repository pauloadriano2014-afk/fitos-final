// lib/ai/splitPresets.ts
// @ts-nocheck -- cópia fiel do JavaScript do app (para a paridade ser verificável linha a linha); o código novo que usa este arquivo é tipado.
// 🏋️ (3 out 2026) Divisão de treino padrão (dias, grupos musculares, fase do ciclo, ambiente) -- CÓPIA do que o app do coach usa em
// src/components/GerarTreino/_constants.js e _helpers.js, para o plano automático do aluno (lib/autoPlan.ts) montar a mesma configuração de ciclo
// no servidor. Se mexer num dos lados, mexa no outro (há um teste de paridade entre os dois).

export const MUSCLE_GROUPS = [
  { id: 'QUADRICEPS',    label: 'Quadríceps',       color: '#FF6B6B', defaultRest: 60, defaultSets: 4, restType: 'MULTI'   },
  { id: 'POSTERIORES',   label: 'Posteriores',      color: '#FF8E53', defaultRest: 60, defaultSets: 4, restType: 'MULTI'   },
  { id: 'GLUTEOS',       label: 'Glúteos',          color: '#FF6B9D', defaultRest: 60, defaultSets: 4, restType: 'MULTI'   },
  { id: 'PANTURRILHA',   label: 'Panturrilha',      color: '#C77DFF', defaultRest: 15, defaultSets: 3, restType: 'PANT'    },
  { id: 'ADUTOR',        label: 'Adutor',           color: '#E8A0BF', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'ABDUTOR',       label: 'Abdutor',          color: '#DDA0DD', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'COSTAS_PUXADA', label: 'Costas — Puxada',  color: '#4ECDC4', defaultRest: 60, defaultSets: 4, restType: 'MULTI'   },
  { id: 'COSTAS_REMADA', label: 'Costas — Remada',  color: '#45B7D1', defaultRest: 60, defaultSets: 4, restType: 'MULTI'   },
  { id: 'OMBRO_MULTI',   label: 'Ombro — Multi.',   color: '#96CEB4', defaultRest: 60, defaultSets: 4, restType: 'MULTI'   },
  { id: 'OMBRO_FRONTAL', label: 'Ombro — Frontal',  color: '#88D8B0', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'OMBRO_LATERAL', label: 'Ombro — Lateral',  color: '#F0E68C', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'OMBRO_POST',    label: 'Ombro — Post.',    color: '#DDA0DD', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'TRAPEZIO',      label: 'Trapézio',         color: '#98D8C8', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'PEITO',         label: 'Peito',            color: '#F7DC6F', defaultRest: 60, defaultSets: 4, restType: 'MULTI'   },
  { id: 'BICEPS',        label: 'Bíceps',           color: '#82E0AA', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'TRICEPS',       label: 'Tríceps',          color: '#85C1E9', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'ABDOMEN',       label: 'Abdômen',          color: '#F1948A', defaultRest: 30, defaultSets: 3, restType: 'ISOLADO' },
  { id: 'CARDIO',        label: 'Cardio',           color: '#FF6B6B', defaultRest: 0,  defaultSets: 1, restType: 'CARDIO'  },
  // 🔥 NOVO: Mobilidade — seleção manual, não passa pela IA
  { id: 'MOBILIDADE',    label: 'Alongamento e Mobilidade', color: '#5AC8FA', defaultRest: 30, defaultSets: 2, restType: 'ISOLADO', manualPick: true },
];

export const DEFAULT_LIMITATION_RULES = [
  {
    id: 'SILICONE', trigger: 'Prótese de Silicone', label: 'Prótese de Silicone', color: '#FF9500',
    rules: [{ group: 'PEITO', maxExercises: 2, forceLight: true, note: 'Amplitude reduzida, carga leve. Qualquer desconforto me avise imediatamente.' }],
  },
  {
    id: 'CESARÉA', trigger: 'Cesaréa', label: 'Cesaréa / Abdominoplastia', color: '#FF3B30',
    rules: [{ group: 'ABDOMEN', staticOnly: true, note: 'Apenas exercícios estáticos (prancha, isometria). Sem impacto abdominal.' }],
  },
  {
    id: 'JOELHO', trigger: 'Joelho', label: 'Problema no Joelho', color: '#FF6B6B',
    rules: [
      { group: 'QUADRICEPS', addNote: true, note: 'Execução controlada. Qualquer desconforto no joelho, entre em contato.' },
      { group: 'POSTERIORES', addNote: true, note: 'Amplitude reduzida. Avise se sentir qualquer dor.' },
    ],
  },
  {
    id: 'LOMBAR', trigger: 'Lombar', label: 'Problema na Lombar', color: '#FF8E53',
    rules: [
      { group: 'COSTAS_REMADA', addNote: true, note: 'Mantenha a lombar neutra. Qualquer dor me avise.' },
      { group: 'POSTERIORES', addNote: true, note: 'Sem flexão excessiva do tronco. Execução lenta e controlada.' },
    ],
  },
  {
    id: 'CERVICAL', trigger: 'Cervical', label: 'Problema Cervical', color: '#C77DFF',
    rules: [
      { group: 'OMBRO_MULTI', addNote: true, note: 'Prefira movimentos com apoio. Evite sobrecarregar a cervical.' },
      { group: 'TRAPEZIO', addNote: true, note: 'Amplitude reduzida. Avise se sentir irradiação para os braços.' },
    ],
  },
];

export const buildPresets = (gender) => {
  const isFem = gender === 'Feminino';
  return [
    { category: 'Pernas', label: 'Pernas Completo', groups: [{ id: 'QUADRICEPS', qty: 3 }, { id: 'POSTERIORES', qty: 2 }, { id: 'GLUTEOS', qty: 2 }, { id: 'PANTURRILHA', qty: 2 }, { id: 'ADUTOR', qty: 1 }, { id: 'ABDUTOR', qty: 1 }] },
    { category: 'Pernas', label: 'Quadríceps Isolado', groups: [{ id: 'QUADRICEPS', qty: 5 }, { id: 'PANTURRILHA', qty: 2 }] },
    { category: 'Pernas', label: 'Posteriores Isolado', groups: [{ id: 'POSTERIORES', qty: 4 }, { id: 'PANTURRILHA', qty: 2 }] },
    ...(isFem ? [
      { category: 'Pernas', label: 'Glúteos Foco', groups: [{ id: 'GLUTEOS', qty: 5 }, { id: 'ABDUTOR', qty: 2 }, { id: 'PANTURRILHA', qty: 1 }] },
      { category: 'Pernas', label: 'Glúteos + Post.', groups: [{ id: 'GLUTEOS', qty: 4 }, { id: 'POSTERIORES', qty: 3 }, { id: 'PANTURRILHA', qty: 1 }] },
    ] : []),
    { category: 'Superiores', label: 'Costas Completa', groups: [{ id: 'COSTAS_PUXADA', qty: 3 }, { id: 'COSTAS_REMADA', qty: 3 }, { id: 'TRAPEZIO', qty: 1 }] },
    { category: 'Superiores', label: 'Peito Isolado', groups: [{ id: 'PEITO', qty: 4 }, { id: 'TRICEPS', qty: 2 }] },
    { category: 'Superiores', label: 'Ombros Completo', groups: [{ id: 'OMBRO_MULTI', qty: 2 }, { id: 'OMBRO_FRONTAL', qty: 1 }, { id: 'OMBRO_LATERAL', qty: 2 }, { id: 'OMBRO_POST', qty: 1 }, { id: 'TRAPEZIO', qty: 1 }] },
    { category: 'Superiores', label: 'Braços Isolado', groups: [{ id: 'BICEPS', qty: 3 }, { id: 'TRICEPS', qty: 3 }, { id: 'ABDOMEN', qty: 2 }] },
    { category: 'Superiores', label: 'Costas + Ombros', groups: [{ id: 'COSTAS_PUXADA', qty: 3 }, { id: 'COSTAS_REMADA', qty: 2 }, { id: 'OMBRO_MULTI', qty: 2 }, { id: 'TRAPEZIO', qty: 1 }] },
    ...(isFem ? [] : [
      { category: 'Superiores', label: 'Peito + Tríceps', groups: [{ id: 'PEITO', qty: 3 }, { id: 'TRICEPS', qty: 3 }, { id: 'ABDOMEN', qty: 2 }] },
      { category: 'Superiores', label: 'Costas + Bíceps', groups: [{ id: 'COSTAS_PUXADA', qty: 3 }, { id: 'COSTAS_REMADA', qty: 2 }, { id: 'BICEPS', qty: 3 }] },
    ]),
    { category: 'Combinados', label: 'Superior Geral', groups: [{ id: 'PEITO', qty: 2 }, { id: 'COSTAS_PUXADA', qty: 2 }, { id: 'OMBRO_LATERAL', qty: 2 }, { id: 'BICEPS', qty: 2 }, { id: 'TRICEPS', qty: 2 }] },
    { category: 'Combinados', label: 'Full Body', groups: [{ id: 'QUADRICEPS', qty: 2 }, { id: isFem ? 'GLUTEOS' : 'POSTERIORES', qty: 2 }, { id: 'COSTAS_REMADA', qty: 2 }, { id: 'PEITO', qty: 2 }, { id: 'ABDOMEN', qty: 1 }] },
    { category: 'Isolados', label: 'Abdômen Isolado', groups: [{ id: 'ABDOMEN', qty: 5 }] },
    { category: 'Isolados', label: 'Cardio', groups: [{ id: 'CARDIO', qty: 1 }] },
  ];
};
export const buildDefaultDays = (freq) => {
  const letters = 'ABCDEFGHIJKLMNOP';
  const count = Math.min(Math.max(freq || 3, 1), 7);
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1), name: letters[i], groups: [], editingName: false,
  }));
};

// 🔥 (22 set 2026) Teste de automação (treino+dieta sem o Coach configurar
// nada na mão, pra provar o conceito com um aluno LOW_COST de cobaia).
// `buildDefaultDays` só cria os SLOTS de dia (A, B, C...) com `groups: []`
// vazio -- é o coach quem escolhe manualmente o que treina em cada dia via
// `DayGroupCard`/`applyTemplate`. Essa função preenche isso sozinha, usando
// os MESMOS templates prontos de `buildPresets` (os mesmos que já aparecem
// no "Aplicar Modelo" pro coach usar manualmente), numa sequência fixa por
// quantidade de dias/gênero -- é só um PONTO DE PARTIDA razoável: a tela de
// revisão (ComparisonModal → MontarTreinoAdmin) continua existindo depois,
// então o coach ainda pode ajustar tudo antes de qualquer coisa ser salva.
const DEFAULT_SPLIT_SEQUENCES = {
  masculino: {
    1: ['Full Body'],
    2: ['Superior Geral', 'Pernas Completo'],
    3: ['Peito + Tríceps', 'Costas + Bíceps', 'Pernas Completo'],
    4: ['Peito + Tríceps', 'Costas + Bíceps', 'Pernas Completo', 'Ombros Completo'],
    5: ['Peito + Tríceps', 'Costas + Bíceps', 'Pernas Completo', 'Ombros Completo', 'Braços Isolado'],
    6: ['Peito + Tríceps', 'Costas + Bíceps', 'Pernas Completo', 'Ombros Completo', 'Braços Isolado', 'Quadríceps Isolado'],
  },
  feminino: {
    1: ['Full Body'],
    2: ['Superior Geral', 'Pernas Completo'],
    3: ['Superior Geral', 'Glúteos Foco', 'Pernas Completo'],
    4: ['Costas Completa', 'Pernas Completo', 'Peito Isolado', 'Glúteos + Post.'],
    5: ['Costas Completa', 'Peito Isolado', 'Pernas Completo', 'Glúteos Foco', 'Ombros Completo'],
    6: ['Costas Completa', 'Peito Isolado', 'Glúteos Foco', 'Pernas Completo', 'Ombros Completo', 'Glúteos + Post.'],
  },
};

export const buildDefaultSplit = (freq, gender) => {
  const days = buildDefaultDays(freq);
  const isFem = gender === 'Feminino';
  const presets = buildPresets(gender);
  const byLabel = (label) => (presets.find(p => p.label === label)?.groups || []).map(g => ({ ...g }));
  const seq = (isFem ? DEFAULT_SPLIT_SEQUENCES.feminino : DEFAULT_SPLIT_SEQUENCES.masculino)[Math.min(days.length, 6)]
    || (isFem ? DEFAULT_SPLIT_SEQUENCES.feminino[6] : DEFAULT_SPLIT_SEQUENCES.masculino[6]);
  return days.map((d, i) => ({ ...d, groups: byLabel(seq[i % seq.length]) }));
};

// 🔥 (22 set 2026) Deriva o ambiente de treino direto do que o aluno marcou
// em "Local de Treino" na anamnese (`equipamentos` -- ver TrainingLocationPicker.js).
// Antes o ambiente ficava sempre travado em ACADEMIA_PADRAO por default,
// mesmo pra quem marcou só "Em Casa" -- essa era exatamente a lacuna que o
// Paulo apontou (equipamento coletado na anamnese mas nunca usado na
// montagem de treino). Se marcou mais de um local, prioriza o mais restrito
// (o ambiente com MENOS equipamento disponível), já que a IA filtra os
// exercícios pra caber nesse ambiente.
export const deriveTrainingEnvironment = (equipamentos = []) => {
  const locais = Array.isArray(equipamentos) ? equipamentos : [];
  if (locais.includes('Em Casa') && locais.length === 1) return 'EM_CASA';
  if (locais.includes('Academia de Condomínio') && !locais.includes('Academia Completa')) return 'CONDOMINIO';
  if (locais.includes('Em Casa') && !locais.includes('Academia Completa') && !locais.includes('Academia de Condomínio')) return 'EM_CASA';
  return 'ACADEMIA_PADRAO';
};

export const suggestPhase = (objetivo) => {
  if (!objetivo) return 'HIPERTROFIA';
  const o = objetivo.toLowerCase();
  if (o.includes('emagrec')) return 'EMAGRECIMENTO';
  if (o.includes('defin'))   return 'DEFINICAO';
  if (o.includes('força') || o.includes('forca')) return 'FORCA';
  return 'HIPERTROFIA';
};

export const dayNeedsCardio = (groups, phase) => {
  if (!['EMAGRECIMENTO', 'DEFINICAO'].includes(phase)) return false;
  if (groups.some(g => g.id === 'CARDIO')) return false;
  return groups.some(g =>
    ['PEITO','COSTAS_PUXADA','COSTAS_REMADA','OMBRO_MULTI','OMBRO_FRONTAL',
     'OMBRO_LATERAL','OMBRO_POST','TRAPEZIO','BICEPS','TRICEPS','ABDOMEN'].includes(g.id)
  );
};

export const getGroupInfo = (id) => MUSCLE_GROUPS.find(g => g.id === id);

export const getLevelColor = (level, fallback = '#888') => {
  if (!level) return fallback;
  const l = level.toLowerCase();
  if (l.includes('iniciante')) return '#32ADE6';
  if (l.includes('interm'))    return '#FF9500';
  return '#FF3B30';
};