// app/api/membros/produto/[produtoId]/treino/route.ts
// 🏋️ ÁREA DE MEMBROS — o treino do produto (o Treino Avulso ligado a ele, no mesmo formato da página pública /t: dias, seções, exercícios com vídeo, blocos,
// técnicas explicadas) mais a semana em que a pessoa está e tudo que ela já marcou e anotou.
import { comAcesso, reply } from '@/lib/membrosRota';
import prisma from '@/lib/prisma';
import { carregarTreino } from '@/lib/membrosTreino';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'leitura', 'treino GET', async (a) => {
    if (!a.abas.some((x) => x.tipo === 'treino')) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    const treino = await carregarTreino(prisma, a.produto);
    if (!treino) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    const registros: any[] = a.membro ? await prisma.membroRegistro.findMany({ where: { membroId: a.membro.id, produtoId: a.produto.id } }) : [];
    return reply({
      produto: { id: a.produto.id, nome: a.produto.nome },
      comprouEm: a.comprouEm.toISOString(),
      semanas: a.semanas,
      semanaAtual: a.semanaAtual,
      treino: { nome: treino.nome, days: treino.days, techniques: treino.techniques },
      registros: registros.map((r) => ({ s: r.semana, k: r.chave, f: !!r.feito, c: r.carga ?? null })),
      ...(a.previa ? { previa: true } : {}),
    });
  });
}
