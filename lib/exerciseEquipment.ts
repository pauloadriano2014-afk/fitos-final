// lib/exerciseEquipment.ts
// 🏋️ (25 out 2026) EQUIPAMENTO DO EXERCÍCIO: 7 grupos claros, com o SMITH separado da barra (para o Paulo, Smith é outro aparelho: "Stiff no Smith" e "Stiff com halter" só mudam o aparelho).
//   MAQUINA · POLIA (cross) · BARRA (livre) · SMITH · HALTER · PESO_CORPORAL · OUTROS (anilha, caneleira, elástico, bola, banco...)
// Antes havia só um palpite pelo nome espalhado em 2 rotas, que deixava 298 de 739 exercícios como "LIVRE" (a maioria eram máquinas: NEWTECH, MATRIX, articulada, voador...).
// Este arquivo é a regra ÚNICA (cadastro, sincronização e a sugestão em lote usam o mesmo palpite). Função pura.
// LIVRE e CANELEIRA são nomes ANTIGOS: continuam sendo lidos (bloqueios salvos de alunos), mas o palpite novo não os devolve.

export const EQUIPMENT_IDS = ['MAQUINA', 'POLIA', 'BARRA', 'SMITH', 'HALTER', 'PESO_CORPORAL', 'OUTROS'] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];
/** Valores que ainda podem existir gravados/salvos em regras antigas. */
export const LEGACY_EQUIPMENT = ['LIVRE', 'CANELEIRA'] as const;
export const EQUIPMENT_LABEL: Record<string, string> = { MAQUINA: 'Máquina', POLIA: 'Polia / Cross', BARRA: 'Barra livre', SMITH: 'Smith', HALTER: 'Halter', PESO_CORPORAL: 'Peso do corpo', OUTROS: 'Outros', LIVRE: 'Sem classificar', CANELEIRA: 'Caneleira (antigo)' };

const fold = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const has = (n: string, ...words: string[]) => words.some((w) => n.includes(w));

export interface EquipmentGuess { equipment: EquipmentId; reason: string }

/** Palpite pelo nome (e pela categoria). Devolve null quando o nome não diz nada: aí o exercício fica como está e vai para a lista "sem palpite". */
export function guessEquipment(name: any, category?: any): EquipmentGuess | null {
  const n = fold(name); const cat = fold(category);
  if (!n.trim()) return null;
  // 1) Smith
  if (has(n, 'smith')) return { equipment: 'SMITH', reason: 'tem "Smith" no nome' };
  // 2) barra fixa / barra livre fechada: o peso é o do corpo
  if (has(n, 'barra fixa', 'barra livre')) return { equipment: 'PESO_CORPORAL', reason: 'barra fixa: o peso é o do corpo' };
  // 3) a palavra "máquina" escrita no nome manda (Pulldown máquina, Remada T máquina...)
  if (has(n, 'maquina', 'maq.')) return { equipment: 'MAQUINA', reason: '"máquina" no nome' };
  // 4) polia / cross escrito no nome ganha de marca ("Abdução no cabo NEWTECH" é polia)
  if (has(n, 'cross', 'polia', 'cabo', 'corda', 'pulldown', 'pull down', 'pulley', 'puxador')) return { equipment: 'POLIA', reason: 'polia/cross no nome' };
  // 5) aparelho pelo nome do próprio aparelho ou da marca (NEWTECH, MATRIX, Cimerian, Hammer...)
  if (has(n, 'newtech', 'matrix', 'cimerian', 'hammer', 'articulad', 'voador', 'peck deck', 'extensora', 'flexora', 'leg press', 'leg horizontal', 'leg 45', 'leg uni', 'hack', 'graviton', 'pendulo', 'abdutora', 'adutora', 'cadeira', 'pelve', 'sissy', 'frog')) {
    return { equipment: 'MAQUINA', reason: 'aparelho/marca de máquina no nome' };
  }
  // 6) halter
  if (has(n, 'halter')) return { equipment: 'HALTER', reason: 'tem "halter" no nome' };
  // 7) barra livre (e variações de barra)
  if (has(n, 'barra', 'terra', 'good morning')) return { equipment: 'BARRA', reason: 'barra no nome' };
  // 8) outros: anilha, caneleira, elástico, bola, roda, banco romano, kettlebell...
  if (has(n, 'anilha', 'caneleira', 'elastico', 'mini band', 'faixa', 'bola', 'bosu', 'kettlebell', 'banco romano', 'medicine', 'rodinha', 'roda abdominal')) return { equipment: 'OUTROS', reason: 'anilha/caneleira/elástico/bola/roda no nome' };
  // 9) triângulo: puxada/remada no puxador (menos o "cavalinho", que não dá para saber)
  if (has(n, 'triangulo') && !has(n, 'cavalinho')) return { equipment: 'POLIA', reason: 'triângulo = puxador da polia' };
  // 10) peso do corpo
  if (has(n, 'prancha', 'corporal', 'paralela', 'isometri', 'sem peso', 'degrau', 'step', 'colchonete', 'vacuum', 'triceps banco') || (has(n, 'flexao') && !has(n, 'punho'))) return { equipment: 'PESO_CORPORAL', reason: 'peso do corpo no nome' };
  // 11) palpites mais fracos (conferir): búlgaro costuma ser no Smith (regra do Paulo); puxada sem aparelho = puxador (polia); face pull = polia; abdominais sem acessório = peso do corpo
  if (has(n, 'bulgaro')) return { equipment: 'SMITH', reason: 'búlgaro (costuma ser no Smith) — confira' };
  if (has(n, 'puxada', 'face pull')) return { equipment: 'POLIA', reason: 'puxada/face pull sem aparelho no nome (polia) — confira' };
  if (cat.startsWith('abd') && has(n, 'abdominal', 'abs ', 'infra', 'supra', 'core', 'obliquo', 'remador')) return { equipment: 'PESO_CORPORAL', reason: 'abdominal sem acessório — confira' };
  return null;
}

/** O coach marcou o equipamento à mão? Então ninguém (nem a edição do exercício) reescreve. */
export const isEquipmentLocked = (tags: any) => !!tags && typeof tags === 'object' && tags.equipmentManual === true;
export const isEquipmentId = (v: any): v is EquipmentId => (EQUIPMENT_IDS as readonly string[]).includes(v);
