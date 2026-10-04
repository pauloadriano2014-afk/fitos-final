// app/api/membros/produto/[produtoId]/treino/registro/route.ts
// 🏋️ ÁREA DE MEMBROS — grava o que a pessoa marcou ou anotou num exercício: { semana, chave, feito?, carga? }, ou { semana, dia, desmarcarTudo: true }.
// Semana e exercício são conferidos contra o treino do produto; carga só em exercício de musculação e só um peso razoável (kg). Na prévia a anotação é conferida e NÃO gravada.
import { comAcesso, reply } from '@/lib/membrosRota';
import prisma from '@/lib/prisma';
import { carregarTreino, validarRegistro } from '@/lib/membrosTreino';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'escrita', 'treino registro PUT', async (a) => {
    if (!a.abas.some((x) => x.tipo === 'treino')) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    const treino = await carregarTreino(prisma, a.produto);
    if (!treino) return reply({ error: 'Conteúdo não encontrado.' }, 404);

    const body = await request.json().catch(() => null);
    const r = validarRegistro(body, treino, a.semanas);
    if (!r.ok) return reply({ error: 'Anotação inválida.' }, 400);
    if (a.previa || !a.membro) return reply({ ok: true, previa: true });

    const membroId = a.membro.id, produtoId = a.produto.id, agora = new Date();
    if (r.desmarcarTudo) {
      const chaves = treino.dias[r.dia as string];
      await prisma.membroRegistro.updateMany({ where: { membroId, produtoId, semana: r.semana, chave: { in: chaves } }, data: { feito: false, feitoEm: null } });
      return reply({ ok: true });
    }

    const dados: { feito?: boolean; feitoEm?: Date | null; carga?: number | null; cargaEm?: Date | null } = {};
    if (r.feito !== undefined) { dados.feito = r.feito; dados.feitoEm = r.feito ? agora : null; }
    if (r.carga !== undefined) { dados.carga = r.carga; dados.cargaEm = r.carga === null ? null : agora; }
    const linha = await prisma.membroRegistro.upsert({
      where: { membroId_produtoId_semana_chave: { membroId, produtoId, semana: r.semana, chave: r.chave as string } },
      update: dados,
      create: { membroId, produtoId, semana: r.semana, chave: r.chave as string, feito: dados.feito ?? false, feitoEm: dados.feitoEm ?? null, carga: dados.carga ?? null, cargaEm: dados.cargaEm ?? null },
    });
    return reply({ ok: true, registro: { s: linha.semana, k: linha.chave, f: !!linha.feito, c: linha.carga ?? null } });
  });
}
