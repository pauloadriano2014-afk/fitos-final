// lib/uiLayouts.ts
// 🎨 (20 out 2026) "Personalizar o app": cada coach escolhe, tela por tela, entre os desenhos A, B ou C (e D nas telas que têm um quarto desenho). A é o desenho de sempre (é o que vale enquanto o coach não escolher).
// As telas do ALUNO, "Montar treino" e "Montar dieta" ficam de fora de propósito (não têm escolha). Guardado em CoachUiLayout (prisma/schema/config.prisma).
export const UI_SCREENS = [
  'alunos',          // aba Alunos
  'ficha',           // ficha do aluno (admin-aluno)
  'agenda',          // aba Agenda
  'financas',        // aba Finanças
  'avaliacoes',      // aba Avaliações (check-ins)
  'feed',            // aba Feed
  'formularios',     // Formulários e anamnese
  'vendas',          // Sistema > Vendas
  'produtos',        // Sistema > Produtos digitais
  'desafios',        // Sistema > Desafios
  'marca',           // Sistema > Minha marca
  'ferramentas',     // Sistema > Treino e dieta (ferramentas)
  'feedbackSemana',  // Feedback da semana
  'biblioteca',      // Biblioteca de exercícios
  'prontuario',      // Prontuário / evolução do aluno
  'gestao',          // aba Gestão
  'ia',              // aba IA
  'config',          // aba Configurações
  'templates',       // Modelos de treino
  'treinoAvulso',    // Treino avulso
  'relatorioMes',    // Relatório do mês
  'tecnicas',        // Técnicas avançadas
  'alimentos',       // Alimentos e substituições
  'cofreDietas',     // Cofre de dietas
  'parecidos',       // Alunos parecidos
  'videosExecucao',  // Vídeos de execução
  'modo',            // 🎨 Modo Bento (21 out 2026): chave GERAL do app do coach. 'D' = Modo Bento ligado em todas as telas; 'A' (ou ausente) = o padrão de sempre
] as const;
export type UiScreen = (typeof UI_SCREENS)[number];
export const UI_VARIANTS = ['A', 'B', 'C', 'D'] as const;
export type UiVariant = (typeof UI_VARIANTS)[number];
export type UiLayouts = Partial<Record<UiScreen, UiVariant>>;

export const isUiScreen = (v: any): v is UiScreen => (UI_SCREENS as readonly string[]).includes(String(v));
export const isUiVariant = (v: any): v is UiVariant => (UI_VARIANTS as readonly string[]).includes(String(v));

/** Fica só com tela e letra válidas (o que vier de fora ou de uma versão antiga nunca quebra o app). */
export function sanitizeLayouts(raw: any): UiLayouts {
  const out: UiLayouts = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of UI_SCREENS) { if (!Object.prototype.hasOwnProperty.call(raw, k)) continue; const v = (raw as any)[k]; if (isUiVariant(v)) out[k] = v; }   // só o que é do próprio objeto (nada herdado)
  return out;
}
