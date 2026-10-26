// lib/contentAudience.ts
// 🎯 (26 out 2026) "QUEM VÊ" de cada vídeo/e-book/áudio do PA FLIX (Content.audience). Vazio = todos os alunos. Com marcas = só quem tem TODAS as marcas.
//   TREINO  -> o aluno tem a aba Treinos        DIETA   -> o aluno tem a aba Dieta
//   PREMIUM -> plano completo (tem o chat assistente; fora LOW_COST, CHALLENGE_21 e FICHA_8S)
//   EXAMES  -> o personal ou a nutri dele está com o recurso "Exames" ligado
//   EXEC_VIDEO -> o coach dele está com o recurso "Vídeo de execução" ligado (o master sempre tem)
//   RELATORIO  -> o coach liberou o "Relatório do mês" para este aluno (User.monthlyReportOn)
//   CARGA      -> a "Sugestão de carga" está ligada para este aluno (User.loadSuggestOff = false, que é o padrão)
//   MASTER     -> só aluno do Paulo/Adri (o vídeo fala de PA FLIX, ELITE FIT COACH etc.; aluno de coach parceiro tem outros nomes)
// As regras de TREINO e DIETA são a MESMA lista de abas que o app mostra na barra de baixo (FIT-OS-FRONTEND/src/utils/studentTabs.js, getVisibleStudentTabs):
// o teste do app compara as duas em muitas combinações. Se mudar lá, mude aqui.
import { MASTER_IDS } from './masterIds';

export const AUDIENCE_TAGS = ['TREINO', 'DIETA', 'PREMIUM', 'EXAMES', 'EXEC_VIDEO', 'RELATORIO', 'CARGA', 'MASTER'] as const;
export type AudienceTag = typeof AUDIENCE_TAGS[number];

/** Texto "TREINO,DIETA" (ou lista) -> marcas válidas, sem repetir, na ordem fixa. Lixo é ignorado. */
export function parseAudience(raw: any): AudienceTag[] {
  const parts: string[] = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[,;\s]+/) : [];
  const set = new Set(parts.map((p) => p.trim().toUpperCase()).filter(Boolean));
  return AUDIENCE_TAGS.filter((t) => set.has(t));
}
/** Para gravar: "TREINO,DIETA" ou null (= todos). */
export function audienceToString(tags: AudienceTag[]): string | null { return tags.length ? tags.join(',') : null; }

export type StudentFacts = { coachId?: string | null; nutritionistId?: string | null; plan?: string | null; dietModule?: boolean | null; studentModules?: string | null; monthlyReportOn?: boolean | null; loadSuggestOff?: boolean | null };
/** O que depende de consulta ao banco (chave por coach): o servidor só consulta quando há conteúdo com a marca. */
export type AudienceCaps = { exames?: boolean; execVideo?: boolean };
export const belongsToMasterTeam = (s: StudentFacts) => !s.coachId || MASTER_IDS.includes(s.coachId) || (!!s.nutritionistId && MASTER_IDS.includes(s.nutritionistId));

/** As duas abas que dependem do cadastro do aluno. `assignedCoachPlan` = coachPlan do coach dele (null se não tem coach ou o plano não foi definido). */
export function studentTabFlags(s: StudentFacts, assignedCoachPlan: string | null | undefined): { showDiet: boolean; showTreinos: boolean } {
  const belongsToMaster = !s.coachId || MASTER_IDS.includes(s.coachId) || (!!s.nutritionistId && MASTER_IDS.includes(s.nutritionistId));
  const isElite = s.plan === 'ELITE' || s.plan === 'VIP';
  const coachHasDiet = belongsToMaster || assignedCoachPlan == null || assignedCoachPlan === 'NUTRICIONISTA' || assignedCoachPlan === 'ELITE';
  const coachHasTreinos = belongsToMaster || assignedCoachPlan == null || assignedCoachPlan === 'PERSONAL' || assignedCoachPlan === 'ELITE';
  const isPureNutriCoach = !belongsToMaster && assignedCoachPlan === 'NUTRICIONISTA';
  const showDiet = (belongsToMaster && (s.dietModule === true || isElite)) || isPureNutriCoach || (coachHasDiet && (s.studentModules === 'DIETA' || s.studentModules === 'AMBOS'));
  const isPurePersonalCoach = !belongsToMaster && assignedCoachPlan === 'PERSONAL';
  const showTreinos = belongsToMaster || isPurePersonalCoach || (coachHasTreinos && (s.studentModules === 'TREINO' || s.studentModules === 'AMBOS'));
  return { showDiet, showTreinos };
}

export const isPremiumPlan = (plan: string | null | undefined) => !['LOW_COST', 'CHALLENGE_21', 'FICHA_8S'].includes(plan || 'PREMIUM');

/** Este aluno vê um conteúdo com estas marcas? `caps` = o que veio das chaves por coach (só é olhado quando há a marca). */
export function studentCanSee(tags: AudienceTag[], s: StudentFacts, assignedCoachPlan: string | null | undefined, caps: AudienceCaps = {}): boolean {
  if (!tags.length) return true;
  const { showDiet, showTreinos } = studentTabFlags(s, assignedCoachPlan);
  return tags.every((t) => {
    switch (t) {
      case 'TREINO': return showTreinos;
      case 'DIETA': return showDiet;
      case 'PREMIUM': return isPremiumPlan(s.plan);
      case 'EXAMES': return !!caps.exames;
      case 'EXEC_VIDEO': return !!caps.execVideo;
      case 'RELATORIO': return s.monthlyReportOn === true;
      case 'CARGA': return s.loadSuggestOff !== true;
      case 'MASTER': return belongsToMasterTeam(s);
      default: return false;
    }
  });
}
