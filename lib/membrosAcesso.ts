// lib/membrosAcesso.ts
// 🔑 (out 2026) QUEM PODE ABRIR UM PRODUTO NA ÁREA DE MEMBROS. Duas formas de entrar, sempre por `Authorization: Bearer`:
//   1) sessão da pessoa (login sem senha) + compra PAGA que inclui o produto  -> acesso normal, com os dados dela;
//   2) token de PRÉVIA (gerado pelo painel de produtos, vale 2 h, só daquele produto) -> o conteúdo do produto como a cliente vê, sem dados de ninguém e sem gravar nada.
// Recebe o `db` por parâmetro (testável sem banco).
import { tokenDoCabecalho, sessaoValida, vendaPagaComProduto, lerTokenPrevia } from './membros';
import { lerAbas, semanasDasAbas, type Aba } from './membrosConteudo';
import { semanaAtual } from './membrosTreino';
import { checkRateLimit } from './rateLimit';

export interface Acesso {
  previa: boolean;
  membro: { id: string; email: string } | null;      // null na prévia
  produto: { id: string; nome: string; coachId: string | null; treinoAvulsoId: string | null };
  abas: Aba[];
  semanas: number;
  comprouEm: Date;
  semanaAtual: number;
}
export type ResultadoAcesso = { ok: true; acesso: Acesso } | { ok: false; status: 401 | 404; error: string };

export const ERRO_SESSAO = 'Sessão expirada. Entre de novo.';
export const ERRO_NAO_ENCONTRADO = 'Conteúdo não encontrado.';

export async function acessoAoProduto(db: any, authorization: string | null | undefined, produtoIdBruto: unknown, agora: Date = new Date()): Promise<ResultadoAcesso> {
  const previa = lerTokenPrevia(authorization, agora);
  const sessao = previa ? null : await sessaoValida(db, tokenDoCabecalho(authorization), agora);
  if (!previa && !sessao) return { ok: false, status: 401, error: ERRO_SESSAO };

  const produtoId = String(produtoIdBruto ?? '');
  if (!produtoId || produtoId.length > 64) return { ok: false, status: 404, error: ERRO_NAO_ENCONTRADO };
  if (previa && previa.produtoId !== produtoId) return { ok: false, status: 404, error: ERRO_NAO_ENCONTRADO };

  const venda = previa ? null : await vendaPagaComProduto(db, sessao!.membro.email, produtoId);
  if (!previa && !venda) return { ok: false, status: 404, error: ERRO_NAO_ENCONTRADO };

  const p = await db.produtoDigital.findUnique({ where: { id: produtoId }, select: { id: true, nome: true, coachId: true, treinoAvulsoId: true, membrosAbas: true } });
  if (!p) return { ok: false, status: 404, error: ERRO_NAO_ENCONTRADO };
  const abas = lerAbas(p.membrosAbas, !!p.treinoAvulsoId);
  if (!abas.length) return { ok: false, status: 404, error: ERRO_NAO_ENCONTRADO };

  const semanas = semanasDasAbas(abas);
  const comprouEm = venda ? new Date(venda.paymentDate || venda.createdAt) : agora;
  return {
    ok: true,
    acesso: {
      previa: !!previa,
      membro: sessao ? { id: sessao.membro.id, email: sessao.membro.email } : null,
      produto: { id: p.id, nome: p.nome, coachId: p.coachId ?? null, treinoAvulsoId: p.treinoAvulsoId ?? null },
      abas, semanas, comprouEm, semanaAtual: semanaAtual(comprouEm, semanas, agora),
    },
  };
}

/** Limite de pedidos por minuto: leitura 180, gravação 240; separado por pessoa (e por produto, na prévia). */
export function dentroDoLimite(acesso: Acesso, tipo: 'leitura' | 'escrita'): boolean {
  const quem = acesso.membro ? acesso.membro.id : `previa:${acesso.produto.id}`;
  return checkRateLimit(`membros-${tipo}:${quem}`, { max: tipo === 'leitura' ? 180 : 240, windowMs: 60 * 1000 }).allowed;
}
