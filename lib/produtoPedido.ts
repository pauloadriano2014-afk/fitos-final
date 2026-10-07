// lib/produtoPedido.ts
// 🛒 O que entra no pedido de um Produto Digital e quanto vale (produto + extras escolhidos). Usado pela compra (/api/produtos/comprar) e pela conferência do
// cupom (/api/produtos/cupom): as duas rotas precisam chegar no MESMO total.
//
// 🔒 Nunca confia nos ids/valores mandados pelo cliente: `itensBumpIds` é filtrado contra os extras que o admin realmente configurou para ESTE produto, e o
// valor de cada um vem direto do banco (impede cobrar menos ou "adicionar" um produto que não é extra deste checkout).
import { round2 } from '@/lib/cupom';

export async function montarPedido(db: any, produto: { valor: number; orderBumpProdutoIds?: string | null }, itensBumpIds: unknown): Promise<{ bumpProdutos: { id: string; valor: number }[]; valorBumps: number; valorTotal: number }> {
  const permitidos: string[] = (() => {
    try { const j = produto.orderBumpProdutoIds ? JSON.parse(produto.orderBumpProdutoIds) : []; return Array.isArray(j) ? j : []; }
    catch { return []; }
  })();
  const escolhidos: string[] = Array.isArray(itensBumpIds) ? itensBumpIds.filter((id: any) => typeof id === 'string' && permitidos.includes(id)) : [];

  let bumpProdutos: { id: string; valor: number }[] = [];
  if (escolhidos.length > 0) {
    bumpProdutos = await db.produtoDigital.findMany({ where: { id: { in: escolhidos }, ativo: true }, select: { id: true, valor: true } });
  }
  const valorBumps = bumpProdutos.reduce((soma, p) => soma + p.valor, 0);
  return { bumpProdutos, valorBumps, valorTotal: round2(produto.valor + valorBumps) };
}
