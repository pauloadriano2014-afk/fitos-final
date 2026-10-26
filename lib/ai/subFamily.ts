// lib/ai/subFamily.ts
// 🔗 (25 out 2026) MESMO MOVIMENTO, APARELHO DIFERENTE: "Panturrilha máquina" e "Panturrilha no Smith" são SUBSTITUTOS um do outro (aba "substitutos" do exercício na biblioteca:
// `Exercise.defaultSubstitutes`). Substituto é OPÇÃO de troca para o aluno, nunca um segundo exercício: no MESMO dia o treino só pode ter um dos dois. Pedindo 2 de panturrilha,
// entra um da dupla máquina/Smith e outro de outro movimento (ex.: panturrilha no banco). Idem abduções, stiff no Smith/stiff com halter etc. (quem muda só o aparelho não entra junto;
// o good morning, que é outro movimento, pode).
// A ligação é DIRETA e vale nos dois sentidos (se A lista B ou B lista A): não é "amigo do amigo", para a tag errada de um exercício não juntar movimentos que não têm nada a ver.
// Só vale dentro do mesmo dia (entre dias diferentes a variação é bem-vinda). Exercício FIXADO pelo coach nunca é tirado por esta regra. Funções puras (sem banco, sem IA).
export type SubLinks = Map<string, Set<string>>;

// 🔗 (26 out 2026) MESMO EXERCÍCIO, SÓ MUDA A PEGADA/MARCA: "Graviton pegada neutra fechada" e "Graviton pegada semi-pronada" são o mesmo exercício; mesmo sem ninguém ter marcado um como substituto
// do outro, não podem entrar juntos no mesmo dia. A "chave do movimento" é o nome sem pegada (neutra, pronada, supinada, aberta, fechada...), marca (NEWTECH, MATRIX...), "máquina/articulada",
// número/sobrescrito e palavras de ligação. Nomes com a mesma chave (e a mesma categoria) são tratados como substitutos entre si. Conservador de propósito: "Puxada frente aberta" e
// "Puxada com barra" têm chaves diferentes (movimentos diferentes) e continuam podendo entrar juntos.
const KEY_NOISE = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'no', 'na', 'nos', 'nas', 'em', 'c', 'e', 'o', 'a', 'pegada', 'neutra', 'neutro', 'pronada', 'pronado', 'pronacao', 'supinada', 'supinado', 'supinacao', 'semi', 'semipronada', 'semipronado', 'aberta', 'aberto', 'fechada', 'fechado', 'larga', 'largo', 'estreita', 'estreito', 'newtech', 'matrix', 'cimerian', 'hammer', 'maquina', 'maq', 'articulada', 'articulado', 'unilateral', 'bilateral']);
/** Chave do movimento: o nome sem pegada, marca, aparelho genérico, número e palavras de ligação ('' se não sobrar nada). */
export function movementKey(name: any): string {
  const n = String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¹²³]/g, ' ').replace(/[^a-z\s]/g, ' ');
  return n.split(/\s+/).filter((w) => w && !KEY_NOISE.has(w)).join(' ');
}

/** { id → ids ligados a ele } nos dois sentidos, a partir de `defaultSubstitutes` da biblioteca e (se vier `name`) do mesmo movimento pelo nome. */
export function buildSubLinks(rows: Array<{ id: string; name?: string | null; category?: string | null; defaultSubstitutes?: string[] | null }> | null | undefined): SubLinks {
  const links: SubLinks = new Map();
  const add = (a: string, b: string) => { if (!a || !b || a === b) return; let s = links.get(a); if (!s) { s = new Set(); links.set(a, s); } s.add(b); };
  const byKey = new Map<string, string[]>();
  for (const r of rows || []) {
    if (!r || !r.id) continue;
    for (const raw of Array.isArray(r.defaultSubstitutes) ? r.defaultSubstitutes : []) { const o = String(raw || ''); add(r.id, o); add(o, r.id); }
    const k = movementKey(r.name);
    if (k) { const key = String(r.category || '').toLowerCase() + '|' + k; const l = byKey.get(key); if (l) l.push(r.id); else byKey.set(key, [r.id]); }
  }
  for (const ids of byKey.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { add(ids[i], ids[j]); add(ids[j], ids[i]); }
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
