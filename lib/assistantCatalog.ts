// lib/assistantCatalog.ts
// 🧭 (13 out 2026) Catálogo do ASSISTENTE ÚNICO (perguntas rápidas por categoria). É o servidor que diz ao app quais botões existem (GET /api/coach-assistant/catalogo):
// uma pergunta nova aparece no app só subindo o backend, sem mexer no frontend. `finance` some no app do iPhone (Apple 3.1.1); `master` só aparece para o time master (Paulo/Adri).
// Cada botão é uma consulta fixa (intent + params) respondida SEM IA por lib/coachAssistant.ts.
export type CatalogButton = { key: string; label: string; intent: string; params?: { dias?: number; situacao?: 'vencendo' | 'atrasada' | 'todas' }; icon: string; finance?: boolean; noIos?: boolean };   // noIos: some no iPhone por outro motivo que não dinheiro (ex.: teste grátis, que leva a falar de contratar fora do app)
export type CatalogCategory = { id: string; label: string; icon: string; master?: boolean; buttons: CatalogButton[] };

export const CATALOG: CatalogCategory[] = [
  { id: 'hoje', label: 'Hoje', icon: 'weather-sunny', buttons: [
    { key: 'resumo_hoje', label: 'O que tenho hoje?', intent: 'RESUMO_HOJE', icon: 'clipboard-text-clock-outline' },
    { key: 'agenda', label: 'Agenda de hoje', intent: 'AGENDA_HOJE', icon: 'calendar-today' },
    { key: 'tarefas', label: 'Minhas tarefas', intent: 'TAREFAS', icon: 'format-list-checks' },
  ] },
  { id: 'alunos', label: 'Alunos', icon: 'account-group-outline', buttons: [
    { key: 'total', label: 'Quantos alunos', intent: 'TOTAL_ALUNOS', icon: 'account-group-outline' },
    { key: 'novos', label: 'Alunos novos', intent: 'NOVOS_ALUNOS', params: { dias: 7 }, icon: 'account-plus-outline' },
    { key: 'aniversarios', label: 'Aniversariantes', intent: 'ANIVERSARIANTES', params: { dias: 7 }, icon: 'cake-variant-outline' },
    { key: 'sem', label: 'Sem treinar', intent: 'SEM_TREINAR', params: { dias: 7 }, icon: 'run-fast' },
    { key: 'sem_treino', label: 'Sem treino montado', intent: 'SEM_TREINO_MONTADO', icon: 'clipboard-off-outline' },
    { key: 'deload', label: 'Em deload ou choque', intent: 'DELOAD_CHOQUE', icon: 'speedometer-slow' },
  ] },
  { id: 'financas', label: 'Finanças', icon: 'cash-multiple', buttons: [
    { key: 'cobranca', label: 'Cobranças vencendo', intent: 'COBRANCA', params: { situacao: 'vencendo', dias: 7 }, icon: 'cash-clock', finance: true },
    { key: 'atrasadas', label: 'Cobranças atrasadas', intent: 'COBRANCA', params: { situacao: 'atrasada' }, icon: 'cash-remove', finance: true },
    { key: 'paguei', label: 'Disseram que pagaram', intent: 'PAGAMENTOS_AGUARDANDO', icon: 'cash-check', finance: true },
  ] },
  { id: 'treinos', label: 'Treinos', icon: 'dumbbell', buttons: [
    { key: 'treinos', label: 'Treinos vencendo', intent: 'TREINO_VENCENDO', params: { dias: 7 }, icon: 'clipboard-clock-outline' },
    { key: 'aparelhos', label: 'Aparelho que não tem', intent: 'APARELHOS', icon: 'dumbbell-off' },
    { key: 'videos', label: 'Vídeos para responder', intent: 'VIDEOS_AGUARDANDO', icon: 'video-outline' },
    { key: 'comentarios', label: 'Observações de exercício', intent: 'COMENTARIOS_EXERCICIO', icon: 'comment-text-outline' },
    { key: 'corrida', label: 'Alunos na corrida', intent: 'CORRIDA_ATIVOS', icon: 'shoe-sneaker' },
  ] },
  { id: 'dieta', label: 'Dieta', icon: 'food-apple-outline', buttons: [
    { key: 'sem_dieta', label: 'Sem dieta', intent: 'SEM_DIETA', icon: 'food-off-outline' },
    { key: 'dieta_fb', label: 'Feedbacks de dieta', intent: 'DIETA_FEEDBACKS', icon: 'message-text-outline' },
  ] },
  { id: 'avaliacoes', label: 'Avaliações', icon: 'camera-timer', buttons: [
    { key: 'checkins', label: 'Avaliações sem retorno', intent: 'CHECKINS_AGUARDANDO', icon: 'camera-outline' },
    { key: 'checkin_atrasado', label: 'Avaliações atrasadas', intent: 'CHECKIN_ATRASADO', icon: 'camera-off-outline' },
    { key: 'feedbacks', label: 'Feedbacks da semana', intent: 'FEEDBACKS', icon: 'message-text-clock-outline' },
  ] },
  { id: 'crescimento', label: 'Crescimento', icon: 'trending-up', buttons: [
    { key: 'teste', label: 'Links de teste grátis', intent: 'TESTE_GRATIS', icon: 'link-variant', noIos: true },
  ] },
  { id: 'coaches', label: 'Coaches', icon: 'account-tie-outline', master: true, buttons: [
    { key: 'c_resumo', label: 'Visão geral dos coaches', intent: 'COACHES_RESUMO', icon: 'view-dashboard-outline' },
    { key: 'c_pendentes', label: 'Cadastros para aprovar', intent: 'COACHES_PENDENTES', icon: 'account-clock-outline' },
    { key: 'c_cobranca', label: 'Coaches em atraso ou vencendo', intent: 'COACHES_COBRANCA', params: { dias: 7 }, icon: 'cash-clock', finance: true },
    { key: 'c_alunos', label: 'Alunos por coach', intent: 'COACHES_ALUNOS', icon: 'account-multiple-outline' },
    { key: 'c_novos', label: 'Coaches novos', intent: 'COACHES_NOVOS', params: { dias: 7 }, icon: 'account-plus-outline' },
    { key: 'c_origem', label: 'De onde vêm os cadastros', intent: 'COACHES_ORIGEM', params: { dias: 30 }, icon: 'cellphone-arrow-down' },
    { key: 'c_fundadores', label: 'Vagas de Fundador', intent: 'COACHES_FUNDADORES', icon: 'medal-outline', finance: true },
  ] },
];

/** As categorias que ESTE usuário vê: `master` = time master; `ios` = app do iPhone (sem os botões de finanças/cobrança). Categoria que ficar vazia some. */
export function catalogFor(o: { master: boolean; ios: boolean }): CatalogCategory[] {
  return CATALOG.filter((c) => !c.master || o.master)
    .map((c) => ({ ...c, buttons: c.buttons.filter((b) => !(o.ios && (b.finance || b.noIos))) }))
    .filter((c) => c.buttons.length > 0);
}

export const CATALOG_INTENTS: string[] = CATALOG.flatMap((c) => c.buttons.map((b) => b.intent)).filter((v, i, a) => a.indexOf(v) === i);
