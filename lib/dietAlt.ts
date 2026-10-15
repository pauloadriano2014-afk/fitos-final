// lib/dietAlt.ts
// 🍽️ (15 out 2026) Agrupa as VERSÕES ALTERNATIVAS de uma refeição dentro da principal.
//
// O vínculo é `alternativeGroupId`. Só que o MESMO grupo pode estar em refeições principais de abas diferentes (TREINO, DESCANSO, TREINO_CARDIO...):
// dietas montadas antes das abas copiarem com ids novos tinham a principal do dia de treino duplicada nos outros dias com o grupo igual.
// Agrupando só por `alternativeGroupId`, cada principal recebia as alternativas de TODAS as abas: 1 alternativa criada virava 3 (uma por aba) em
// cada aba, e apagar 2 e salvar não adiantava, porque as outras abas ainda tinham as suas e o grupo juntava tudo de novo.
// Agora a chave é aba + grupo: cada principal só recebe as alternativas da PRÓPRIA aba.

/** Aba da refeição, com a mesma regra do app: sem aba ou "PADRÃO" = TREINO. */
export const dayKeyOf = (meal: any): string => {
  const d = meal?.dayType;
  return !d || d === 'PADRÃO' ? 'TREINO' : String(d);
};

/** Chave do grupo de alternativas: aba + alternativeGroupId. */
export const altScopeKey = (meal: any): string => `${dayKeyOf(meal)}::${meal?.alternativeGroupId}`;

/** Separa principais e alternativas e devolve, para cada principal, só as alternativas da própria aba. */
export function groupMealsWithAlternatives<T extends { alternativeGroupId?: string | null; isMainVersion?: boolean | null; dayType?: string | null }>(meals: T[]) {
  const mainMeals: T[] = [];
  const altMap = new Map<string, T[]>();
  for (const meal of meals || []) {
    if (!meal.alternativeGroupId || meal.isMainVersion !== false) {
      mainMeals.push(meal);
    } else {
      const k = altScopeKey(meal);
      altMap.set(k, [...(altMap.get(k) ?? []), meal]);
    }
  }
  const alternativesOf = (main: T): T[] => (main.alternativeGroupId ? (altMap.get(altScopeKey(main)) ?? []) : []);
  return { mainMeals, alternativesOf };
}
