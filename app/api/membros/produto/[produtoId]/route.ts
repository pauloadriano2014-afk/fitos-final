// app/api/membros/produto/[produtoId]/route.ts
// 📚 ÁREA DE MEMBROS — o "índice" de um produto: nome, semana em que a pessoa está e as abas (treino, guias, hábitos...). Exige sessão com compra PAGA do produto,
// ou o token de prévia do painel de produtos (ver lib/membrosAcesso.ts).
import { comAcesso, reply } from '@/lib/membrosRota';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'leitura', 'GET', async (a) => reply({
    produto: { id: a.produto.id, nome: a.produto.nome },
    comprouEm: a.comprouEm.toISOString(),
    semanas: a.semanas,
    semanaAtual: a.semanaAtual,
    abas: a.abas.map((x) => ({ id: x.id, tipo: x.tipo, titulo: x.titulo })),
    ...(a.previa ? { previa: true } : {}),
  }));
}
