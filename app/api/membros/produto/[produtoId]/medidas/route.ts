// app/api/membros/produto/[produtoId]/medidas/route.ts
// 📏 ÁREA DE MEMBROS — ficha de medidas. GET: os campos, os momentos e o que a pessoa já anotou (e a lista das fotos dela, sem as imagens).
// PUT { momento, data?, valores? }: anota as medidas de um momento (valor nulo apaga). Na prévia a anotação é conferida e NÃO gravada.
import { comAcesso, reply } from '@/lib/membrosRota';
import prisma from '@/lib/prisma';
import { conteudoDaAba } from '@/lib/membrosConteudo';
import { mesclarValores, validarMedida } from '@/lib/membrosMedidas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'leitura', 'medidas GET', async (a) => {
    const aba = a.abas.find((x) => x.tipo === 'medidas');
    const conteudo = aba ? conteudoDaAba(aba) : null;
    if (!aba || !conteudo) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    let medidas: any[] = [], fotos: any[] = [];
    if (a.membro) {
      const m: any[] = await prisma.membroMedida.findMany({ where: { membroId: a.membro.id, produtoId: a.produto.id } });
      medidas = m.map((x) => ({ momento: x.momento, data: x.data ?? null, valores: x.valores && typeof x.valores === 'object' ? x.valores : {} }));
      const f: any[] = await prisma.membroFoto.findMany({ where: { membroId: a.membro.id, produtoId: a.produto.id }, select: { id: true, momento: true, pose: true, createdAt: true } });
      fotos = f.map((x) => ({ id: x.id, momento: x.momento, pose: x.pose, criadoEm: new Date(x.createdAt).toISOString() }));
    }
    return reply({ aba: { id: aba.id, tipo: aba.tipo, titulo: aba.titulo }, conteudo, semanas: a.semanas, semanaAtual: a.semanaAtual, medidas, fotos, ...(a.previa ? { previa: true } : {}) });
  });
}

export async function PUT(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'escrita', 'medidas PUT', async (a) => {
    const aba = a.abas.find((x) => x.tipo === 'medidas');
    const conteudo = aba ? conteudoDaAba(aba) : null;
    if (!aba || !conteudo) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    const body = await request.json().catch(() => null);
    const r = validarMedida(body, conteudo);
    if (!r.ok) return reply({ error: 'Anotação inválida.' }, 400);
    if (a.previa || !a.membro) return reply({ ok: true, previa: true });

    const where = { membroId_produtoId_momento: { membroId: a.membro.id, produtoId: a.produto.id, momento: r.momento } };
    const atual: any = await prisma.membroMedida.findUnique({ where });
    const valores = mesclarValores(atual?.valores, r.valores);
    const data = r.data !== undefined ? r.data : (atual?.data ?? null);
    const linha: any = await prisma.membroMedida.upsert({ where, update: { valores, data }, create: { membroId: a.membro.id, produtoId: a.produto.id, momento: r.momento, valores, data } });
    return reply({ ok: true, medida: { momento: linha.momento, data: linha.data ?? null, valores } });
  });
}
