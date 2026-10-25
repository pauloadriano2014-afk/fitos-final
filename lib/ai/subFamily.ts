// lib/ai/subFamily.ts
// 🔗 (25 out 2026) MESMO MOVIMENTO, APARELHO DIFERENTE: "Panturrilha máquina" e "Panturrilha no Smith" são SUBSTITUTOS um do outro (aba "substitutos" do exercício na biblioteca:
// `Exercise.defaultSubstitutes`). Substituto é OPÇÃO de troca para o aluno, nunca um segundo exercício: no MESMO dia o treino só pode ter um dos dois. Pedindo 2 de panturrilha,
// entra um da dupla máquina/Smith e outro de outro movimento (ex.: panturrilha no banco). Idem abduções, stiff no Smith/stiff com halter etc. (quem muda só o aparelho não entra junto;
// o good morning, que é outro movimento, pode).
// A ligação é DIRETA e vale nos dois sentidos (se A lista B ou B lista A): não é "amigo do amigo", para a tag errada de um exercício não juntar movimentos que não têm nada a ver.
// Só vale dentro do mesmo dia (entre dias diferentes a variação é bem-vinda). Exercício FIXADO pelo coach nunca é tirado por esta regra. Funções puras (sem banco, sem IA).
export type SubLinks = Map<string, Set<string>>;

/** { id → ids ligados a ele } nos dois sentidos, a partir de `defaultSubstitutes` da biblioteca. */
export function buildSubLinks(rows: Array<{ id: string; defaultSubstitutes?: string[] | null }> | null | undefined): SubLinks {
  const links: SubLinks = new Map();
  const add = (a: string, b: string) => { if (!a || !b || a === b) return; let s = links.get(a); if (!s) { s = new Set(); links.set(a, s); } s.add(b); };
  for (const r of rows || []) {
    if (!r || !r.id) continue;
    for (const raw of Array.isArray(r.defaultSubstitutes) ? r.defaultSubstitutes : []) { const o = String(raw || ''); add(r.id, o); add(o, r.id); }
  }
  return links;
}

/** Um é substituto do outro (ligação direta, nos dois sentidos)? */
export const areLinked = (links: SubLinks | undefined | null, a: string, b: string): boolean => !!links && a !== b && !!links.get(a)?.has(b);

/** O exercício `id` é substituto de algum dos exercícios `others`? */
export const linkedToAny = (links: SubLinks | undefined | null, id: string, others: Iterable<string>): boolean => {
  if (!links) return false;
  for (const o of others) if (areLinked(links, id, o)) return true;
  return false;
};

/** Todos os ids ligados a algum dos exercícios de `ids` (o que NÃO pode entrar junto no mesmo dia). */
export function linkedIds(links: SubLinks | undefined | null, ids: Iterable<string>): Set<string> {
  const out = new Set<string>(); if (!links) return out;
  for (const id of ids) for (const l of links.get(id) || []) out.add(l);
  return out;
}
