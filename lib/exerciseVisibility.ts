// lib/exerciseVisibility.ts
// 🙈 (16 out 2026) "Só o Paulo vê": exercício marcado com `hiddenFromCoaches` continua na biblioteca do Paulo (e da Adri), nos treinos já montados e na
// tela do aluno, mas deixa de aparecer na biblioteca dos OUTROS coaches (parceiros). Serve para os vídeos antigos que ele não quer mostrar a quem entra.
//
// Regra única usada pela lista da Biblioteca, pelos dados do painel e pelos substitutos. Nunca apaga nada e nunca mexe em treino montado.
import { PAULO_ID, MASTER_IDS } from './masterIds';

// Quais exercícios a biblioteca de `coachId` enxerga.
//  - master (Paulo/Adri): os próprios + os globais (sem dono), tudo, escondido ou não.
//  - parceiro: os próprios + os do Paulo + os globais, EXCETO os marcados "só o Paulo vê" (os do próprio parceiro nunca são escondidos dele).
export function visibleLibraryWhere(coachId: string): any {
  if (MASTER_IDS.includes(coachId)) {
    return { OR: [{ coachId }, { coachId: null }] };
  }
  return {
    OR: [
      { coachId },
      { coachId: PAULO_ID, hiddenFromCoaches: false },
      { coachId: null, hiddenFromCoaches: false },
    ],
  };
}

// O que mais de um exercício pode ser usado: filtro "não escondido" que só vale para quem NÃO é master.
export function notHiddenForCoach(coachId: string | null | undefined): any {
  return coachId && MASTER_IDS.includes(coachId) ? {} : { hiddenFromCoaches: false };
}

// Lê o campo do corpo da requisição. Só o time master pode ligar/desligar; de qualquer outro coach, ou se vier algo que não seja true/false,
// devolve undefined (= não mexe no valor que já está).
export function hiddenFlagFromBody(body: any, actorId: string | null | undefined): boolean | undefined {
  if (!actorId || !MASTER_IDS.includes(actorId)) return undefined;
  return typeof body?.hiddenFromCoaches === 'boolean' ? body.hiddenFromCoaches : undefined;
}
