// scripts/voz-eval/cases.ts
// 🎙️ Casos da avaliação "montar treino por voz".
//
// `text`  = como a transcrição (Whisper) devolveria a fala do coach.
// `ideal` = o que a IA DEVERIA extrair (formato da ferramenta registrar_treino).
//           O resultado esperado FINAL (exercício da biblioteca + blocos +
//           padrões) é calculado pelo mesmo código de produção a partir dele.
// `why`   = o que torna o caso difícil (ou "básico").
// Origem: `real` = frase dita pelo Paulo; `sintético` = escrito por Claude a
// partir dos padrões de fala do Paulo e de exercícios da biblioteca dele.
// Pra somar casos reais: copie um bloco, cole a sua fala em `text`, rode
// `npx tsx scripts/voz-eval/run.ts --check` e confira o "esperado" que aparece.
import type { RawParse } from '../../lib/voiceWorkout/normalize';

export type EvalCase = {
  id: string;
  origem: 'real' | 'sintético';
  tags: string[];
  why: string;
  text: string;
  ideal: RawParse;
};

// helpers de escrita (só pra os casos ficarem legíveis)
type B = { series?: number; reps?: string; tecnica?: string; descanso_seg?: number };
const b = (series?: number, reps?: string, tecnica?: string, descanso_seg?: number): B => {
  const o: B = {};
  if (series !== undefined) o.series = series;
  if (reps !== undefined) o.reps = reps;
  if (tecnica !== undefined) o.tecnica = tecnica;
  if (descanso_seg !== undefined) o.descanso_seg = descanso_seg;
  return o;
};
const ex = (nome_falado: string, blocos?: B[], extra: Record<string, unknown> = {}) =>
  ({ nome_falado, ...(blocos ? { blocos } : {}), ...extra });

export const CASES: EvalCase[] = [
  // ───────────────────────────── básicos ─────────────────────────────
  { id: 'c01', origem: 'sintético', tags: ['básico'], why: 'básico: séries x reps + descanso',
    text: 'Agachamento livre, 3 séries de 12, descanso de 60 segundos.',
    ideal: { exercicios: [ex('agachamento livre', [b(3, '12')], { descanso_seg: 60 })] } },

  { id: 'c02', origem: 'sintético', tags: ['básico', 'faixa'], why: 'faixa de repetições ("8 a 10")',
    text: 'Supino reto com halteres, 4 séries de 8 a 10 repetições, 90 segundos de descanso.',
    ideal: { exercicios: [ex('supino reto com halteres', [b(4, '8-10')], { descanso_seg: 90 })] } },

  { id: 'c03', origem: 'sintético', tags: ['básico', 'decrescente'], why: 'repetições diferentes por série (15, 12 e 10)',
    text: 'Leg press 45, 3 séries de 15, 12 e 10 repetições, descanso de 60 segundos.',
    ideal: { exercicios: [ex('leg press 45', [b(1, '15'), b(1, '12'), b(1, '10')], { descanso_seg: 60 })] } },

  { id: 'c04', origem: 'sintético', tags: ['básico', 'formato'], why: 'formato "NxM" e descanso não dito (deve virar padrão assumido)',
    text: 'Rosca martelo 3x12, elevação lateral com halteres 4x15, tríceps francês 3x12.',
    ideal: { exercicios: [ex('rosca martelo', [b(3, '12')]), ex('elevação lateral com halteres', [b(4, '15')]), ex('tríceps francês', [b(3, '12')])] } },

  { id: 'c05', origem: 'sintético', tags: ['básico', 'falha'], why: '"até a falha" em vez de número',
    text: 'Flexão de braços, 3 séries até a falha, 60 segundos de descanso.',
    ideal: { exercicios: [ex('flexão de braços', [b(3, 'Falha')], { descanso_seg: 60 })] } },

  // ───────────────────── técnica numa série específica ─────────────────────
  { id: 'c06', origem: 'sintético', tags: ['técnica', 'drop set'], why: 'drop set só na última série: separa o último bloco',
    text: 'Cadeira extensora, 3 séries de 12, drop set na última série, 45 segundos de descanso.',
    ideal: { exercicios: [ex('cadeira extensora', [b(2, '12'), b(1, '12', 'DROPSET')], { descanso_seg: 45 })] } },

  { id: 'c07', origem: 'sintético', tags: ['técnica', 'rest pause'], why: 'rest pause na última com faixa de reps',
    text: 'Puxada frente aberta, 3 séries de 8 a 10, rest pause na última, descanso de 90 segundos.',
    ideal: { exercicios: [ex('puxada frente aberta', [b(2, '8-10'), b(1, '8-10', 'RESTPAUSE')], { descanso_seg: 90 })] } },

  { id: 'c08', origem: 'sintético', tags: ['técnica', 'decrescente'], why: 'reps decrescentes + drop set na última (padrão mais comum do Paulo)',
    text: 'Agachamento livre, 3 séries de 15, 12 e 10 repetições, drop set na última série, 60 segundos de descanso.',
    ideal: { exercicios: [ex('agachamento livre', [b(1, '15'), b(1, '12'), b(1, '10', 'DROPSET')], { descanso_seg: 60 })] } },

  { id: 'c09', origem: 'sintético', tags: ['técnica', 'grafia'], why: 'grafias diferentes: "dropset", "rest-pause"',
    text: 'Mesa flexora 3 séries de 10, dropset na última. Stiff no Smith 3 séries de 8, rest-pause na última. 60 segundos de descanso em todos.',
    ideal: { descanso_padrao_seg: 60, exercicios: [ex('mesa flexora', [b(2, '10'), b(1, '10', 'DROPSET')]), ex('stiff no Smith', [b(2, '8'), b(1, '8', 'RESTPAUSE')])] } },

  { id: 'c10', origem: 'sintético', tags: ['técnica', 'descanso por bloco'], why: 'descanso diferente só na série da técnica',
    text: 'Puxada frente aberta 3 séries de 10, rest pause na última série com 90 segundos de descanso nessa série. Nas outras, 60 segundos.',
    ideal: { exercicios: [ex('puxada frente aberta', [b(2, '10', undefined, 60), b(1, '10', 'RESTPAUSE', 90)])] } },

  { id: 'c11', origem: 'sintético', tags: ['técnica', 'correção'], why: 'o coach se corrige e cancela a técnica',
    text: 'Cadeira extensora 3 séries de 12 com drop set na última. Não, tira o drop set, é sem técnica. 60 segundos de descanso.',
    ideal: { exercicios: [ex('cadeira extensora', [b(3, '12')], { descanso_seg: 60 })] } },

  // ────────────────────────────── GVT ──────────────────────────────
  { id: 'c12', origem: 'sintético', tags: ['GVT'], why: 'só "GVT": o sistema aplica 10x10',
    text: 'Mesa flexora, método GVT.',
    ideal: { exercicios: [ex('mesa flexora', undefined, { tecnica_geral: 'GVT' })] } },

  { id: 'c13', origem: 'sintético', tags: ['GVT', 'flexível'], why: 'GVT com números do coach (6 por 10) vence o padrão',
    text: 'Cadeira extensora, GVT 6 por 10.',
    ideal: { exercicios: [ex('cadeira extensora', [b(6, '10')], { tecnica_geral: 'GVT' })] } },

  { id: 'c14', origem: 'sintético', tags: ['GVT', 'flexível'], why: 'GVT só com número de séries (8): reps ficam no padrão',
    text: 'Supino reto com barra, GVT com 8 séries.',
    ideal: { exercicios: [ex('supino reto com barra', [b(8)], { tecnica_geral: 'GVT' })] } },

  { id: 'c15', origem: 'sintético', tags: ['GVT', 'negativo'], why: 'NEGATIVO: 10x10 sem falar GVT não pode virar GVT',
    text: 'Cadeira adutora, 10 séries de 10 repetições, sem técnica, 60 segundos de descanso.',
    ideal: { exercicios: [ex('cadeira adutora', [b(10, '10')], { descanso_seg: 60 })] } },

  { id: 'c16', origem: 'sintético', tags: ['GVT', 'grafia'], why: 'sigla soletrada pela transcrição ("G V T")',
    text: 'Mesa flexora, método G V T.',
    ideal: { exercicios: [ex('mesa flexora', undefined, { tecnica_geral: 'GVT' })] } },

  // ──────────────────────── outras técnicas ────────────────────────
  { id: 'c17', origem: 'sintético', tags: ['técnica', 'bi-set'], why: 'bi-set junta dois exercícios: um item cada, técnica nos dois',
    text: 'Bi-set: rosca direta com barra curvada e tríceps corda na polia, 3 séries de 12 cada, descanso de 60 segundos.',
    ideal: { exercicios: [ex('rosca direta com barra curvada', [b(3, '12')], { tecnica_geral: 'BISET', descanso_seg: 60 }), ex('tríceps corda na polia', [b(3, '12')], { tecnica_geral: 'BISET', descanso_seg: 60 })] } },

  { id: 'c18', origem: 'sintético', tags: ['técnica', 'tri-set'], why: 'tri-set com três exercícios numa frase só',
    text: 'Tri-set: elevação lateral com halteres, elevação frontal com anilha e posterior de ombros com halteres, 3 séries de 12, descanso de 60 segundos.',
    ideal: { exercicios: [ex('elevação lateral com halteres', [b(3, '12')], { tecnica_geral: 'TRISET', descanso_seg: 60 }), ex('elevação frontal com anilha', [b(3, '12')], { tecnica_geral: 'TRISET', descanso_seg: 60 }), ex('posterior de ombros com halteres', [b(3, '12')], { tecnica_geral: 'TRISET', descanso_seg: 60 })] } },

  { id: 'c19', origem: 'sintético', tags: ['técnica', 'método 21'], why: 'método 21 sem repetições: o padrão é 21 (7+7+7)',
    text: 'Rosca Scott, método 21, 3 séries.',
    ideal: { exercicios: [ex('rosca Scott', [b(3)], { tecnica_geral: '21' })] } },

  { id: 'c20', origem: 'sintético', tags: ['técnica', 'cluster'], why: 'cluster set com descanso longo',
    text: 'Agachamento no Smith, cluster set, 4 séries de 6 repetições, 120 segundos de descanso.',
    ideal: { exercicios: [ex('agachamento no Smith', [b(4, '6')], { tecnica_geral: 'CLUSTERSET', descanso_seg: 120 })] } },

  { id: 'c21', origem: 'sintético', tags: ['técnica', 'TUT'], why: '"tempo sob tensão" por extenso',
    text: 'Panturrilha no banco, tempo sob tensão, 4 séries de 15, 30 segundos de descanso.',
    ideal: { exercicios: [ex('panturrilha no banco', [b(4, '15')], { tecnica_geral: 'TUT', descanso_seg: 30 })] } },

  // ───────────────────────────── descanso ─────────────────────────────
  { id: 'c22', origem: 'sintético', tags: ['descanso', 'global'], why: 'um descanso único dito no começo',
    text: 'Descanso de 60 segundos em todos os exercícios. Stiff no Smith, 3 séries de 10. Afundo no Smith, 3 séries de 12.',
    ideal: { descanso_padrao_seg: 60, exercicios: [ex('stiff no Smith', [b(3, '10')]), ex('afundo no Smith', [b(3, '12')])] } },

  { id: 'c23', origem: 'sintético', tags: ['descanso', 'global'], why: 'um descanso único dito no FIM da frase',
    text: 'Elevação pélvica máquina 4x10, cadeira abdutora 3x15, cadeira adutora 3x15. Todos com 45 segundos de descanso.',
    ideal: { descanso_padrao_seg: 45, exercicios: [ex('elevação pélvica máquina', [b(4, '10')]), ex('cadeira abdutora', [b(3, '15')]), ex('cadeira adutora', [b(3, '15')])] } },

  { id: 'c24', origem: 'sintético', tags: ['descanso', 'minuto e meio'], why: 'descanso por extenso ("um minuto e meio")',
    text: 'Desenvolvimento com halteres, 4 séries de 8, um minuto e meio de descanso.',
    ideal: { exercicios: [ex('desenvolvimento com halteres', [b(4, '8')], { descanso_seg: 90 })] } },

  // ─────────────────────── fala real / ruído ───────────────────────
  { id: 'c25', origem: 'sintético', tags: ['números por extenso'], why: 'todos os números por extenso',
    text: 'Remada curvada com barra, quatro séries de dez repetições, sessenta segundos de descanso.',
    ideal: { exercicios: [ex('remada curvada com barra', [b(4, '10')], { descanso_seg: 60 })] } },

  { id: 'c26', origem: 'sintético', tags: ['números por extenso', 'nome com número'], why: 'o número do NOME do exercício vem por extenso ("quarenta e cinco")',
    text: 'Leg press quarenta e cinco, 3 séries de 12, dropset na última, 60 segundos.',
    ideal: { exercicios: [ex('leg press 45', [b(2, '12'), b(1, '12', 'DROPSET')], { descanso_seg: 60 })] } },

  { id: 'c27', origem: 'sintético', tags: ['ruído'], why: 'conversa e hesitação misturadas (nome da aluna, "é...")',
    text: 'Beleza, então pra Maria hoje vamos de perna. Primeiro agachamento livre, 3 séries de 10. Aí depois, é, cadeira extensora, 3 séries de 12. Pronto, é isso.',
    ideal: { exercicios: [ex('agachamento livre', [b(3, '10')]), ex('cadeira extensora', [b(3, '12')])] } },

  { id: 'c28', origem: 'sintético', tags: ['correção'], why: 'o coach corrige o número de séries no meio da frase',
    text: 'Leg press 45, 4 séries de 12... não, 3 séries de 12, 60 segundos de descanso.',
    ideal: { exercicios: [ex('leg press 45', [b(3, '12')], { descanso_seg: 60 })] } },

  { id: 'c29', origem: 'sintético', tags: ['observação'], why: 'orientação de execução não pode contaminar séries/reps (a observação em si não é corrigida)',
    text: 'Agachamento livre, 4 séries de 8, descanso de 90 segundos, descer devagar contando três segundos.',
    ideal: { exercicios: [ex('agachamento livre', [b(4, '8')], { descanso_seg: 90, observacao: 'descer devagar contando três segundos' })] } },

  { id: 'c30', origem: 'sintético', tags: ['cardio'], why: 'cardio: o app troca os blocos pelo padrão; só o exercício é corrigido',
    text: 'Correr na esteira, 20 minutos.',
    ideal: { exercicios: [ex('correr na esteira')] } },

  // ─────────────────────────── treinos completos ───────────────────────────
  { id: 'c31', origem: 'real', tags: ['treino completo', 'real'], why: 'A FRASE DO PAULO: 4 exercícios, drop set, rest pause, GVT e descansos',
    text: 'Agachamento livre 3 séries de 15, 12 e 10 repetições com drop set na última série e 60 segundos de descanso entre as séries. Leg press 45 com 3 séries de 8 a 10 repetições, 60 segundos de descanso e rest pause na última série. Búlgaro no Smith com 3 séries de 10 repetições e 60 segundos de descanso. 10 séries de cadeira extensora com o método GVT.',
    ideal: { exercicios: [
      ex('agachamento livre', [b(1, '15'), b(1, '12'), b(1, '10', 'DROPSET')], { descanso_seg: 60 }),
      ex('leg press 45', [b(2, '8-10'), b(1, '8-10', 'RESTPAUSE')], { descanso_seg: 60 }),
      ex('búlgaro no Smith', [b(3, '10')], { descanso_seg: 60 }),
      ex('cadeira extensora', [b(10)], { tecnica_geral: 'GVT' }),
    ] } },

  { id: 'c32', origem: 'sintético', tags: ['treino completo', 'peito'], why: 'dia de peito com 6 exercícios, misturando números e técnicas',
    text: 'Supino reto com barra 4 séries de 8 a 10, rest pause na última. Supino inclinado com halteres 3 séries de 10. Crucifixo reto com halteres 3 séries de 12. Cross-over polia alta 3 séries de 15, drop set na última. Tríceps corda na polia 4 séries de 12. Tríceps testa com barra H 3 séries de 10. Descanso de 60 segundos em todos.',
    ideal: { descanso_padrao_seg: 60, exercicios: [
      ex('supino reto com barra', [b(3, '8-10'), b(1, '8-10', 'RESTPAUSE')]),
      ex('supino inclinado com halteres', [b(3, '10')]),
      ex('crucifixo reto com halteres', [b(3, '12')]),
      ex('cross-over polia alta', [b(2, '15'), b(1, '15', 'DROPSET')]),
      ex('tríceps corda na polia', [b(4, '12')]),
      ex('tríceps testa com barra H', [b(3, '10')]),
    ] } },

  { id: 'c33', origem: 'sintético', tags: ['treino completo', 'costas'], why: 'dia de costas com 5 exercícios e pegadas no nome',
    text: 'Puxada frente aberta 4x10, com drop set na última. Remada baixa com triângulo 4x10. Serrote 3x12. Puxada com triângulo 3x12. Rosca direta com barra curvada 3x12, 60 segundos de descanso em todos.',
    ideal: { descanso_padrao_seg: 60, exercicios: [
      ex('puxada frente aberta', [b(3, '10'), b(1, '10', 'DROPSET')]),
      ex('remada baixa com triângulo', [b(4, '10')]),
      ex('serrote', [b(3, '12')]),
      ex('puxada com triângulo', [b(3, '12')]),
      ex('rosca direta com barra curvada', [b(3, '12')]),
    ] } },

  { id: 'c34', origem: 'sintético', tags: ['treino completo', 'glúteo'], why: 'dia de glúteo com GVT no meio e descanso global no início',
    text: 'Descanso de 60 segundos em todos. Elevação pélvica com barra, 4 séries de 10, rest pause na última. Agachamento sumô com halter, 3 séries de 12. Mesa flexora, método GVT. Passada com halteres, 3 séries de 12. Cadeira abdutora, 3 séries de 15, drop set na última.',
    ideal: { descanso_padrao_seg: 60, exercicios: [
      ex('elevação pélvica com barra', [b(3, '10'), b(1, '10', 'RESTPAUSE')]),
      ex('agachamento sumô com halter', [b(3, '12')]),
      ex('mesa flexora', undefined, { tecnica_geral: 'GVT' }),
      ex('passada com halteres', [b(3, '12')]),
      ex('cadeira abdutora', [b(2, '15'), b(1, '15', 'DROPSET')]),
    ] } },
];
