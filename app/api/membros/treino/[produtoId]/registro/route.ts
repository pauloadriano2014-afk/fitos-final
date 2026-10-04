// app/api/membros/treino/[produtoId]/registro/route.ts
// 🏋️ ÁREA DE MEMBROS — grava o que a pessoa marcou ou anotou num exercício: { semana, treino, exercicio, feito?, carga? }, ou { semana, treino, desmarcarTudo: true }.
// Semana, treino e exercício são conferidos contra o programa do produto; a carga precisa ser um peso razoável (kg). Uma linha por exercício de cada semana.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { tokenDoCabecalho, sessaoValida, vendaPagaComProduto } from '@/lib/membros';
import { lerPrograma, validarRegistro } from '@/lib/membrosTreino';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function PUT(request: Request, { params }: { params: { produtoId: string } }) {
  try {
    const sessao = await sessaoValida(prisma, tokenDoCabecalho(request.headers.get('authorization')));
    if (!sessao) return reply({ error: 'Sessão expirada. Entre de novo.' }, 401);
    if (!checkRateLimit(`membros-registro:${sessao.membro.id}`, { max: 240, windowMs: 60 * 1000 }).allowed) return reply({ error: 'Muitas anotações seguidas. Aguarde um instante.' }, 429);

    const produtoId = String(params?.produtoId ?? '');
    if (!produtoId || produtoId.length > 64) return reply({ error: 'Treino não encontrado.' }, 404);
    if (!(await vendaPagaComProduto(prisma, sessao.membro.email, produtoId))) return reply({ error: 'Treino não encontrado.' }, 404);

    const produto = await prisma.produtoDigital.findUnique({ where: { id: produtoId }, select: { treinoPrograma: true } });
    const programa = produto ? lerPrograma(produto.treinoPrograma) : null;
    if (!programa) return reply({ error: 'Treino não encontrado.' }, 404);

    const body = await request.json().catch(() => null);
    const r = validarRegistro(body, programa);
    if (!r.ok) return reply({ error: 'Anotação inválida.' }, 400);

    const membroId = sessao.membro.id;
    if (r.desmarcarTudo) {
      await prisma.membroRegistro.updateMany({ where: { membroId, produtoId, semana: r.semana, treino: r.treino }, data: { feito: false } });
      return reply({ ok: true });
    }

    const dados: { feito?: boolean; carga?: number | null } = {};
    if (r.feito !== undefined) dados.feito = r.feito;
    if (r.carga !== undefined) dados.carga = r.carga;
    const linha = await prisma.membroRegistro.upsert({
      where: { membroId_produtoId_semana_treino_exercicio: { membroId, produtoId, semana: r.semana, treino: r.treino, exercicio: r.exercicio } },
      update: dados,
      create: { membroId, produtoId, semana: r.semana, treino: r.treino, exercicio: r.exercicio, feito: dados.feito ?? false, carga: dados.carga ?? null },
    });
    return reply({ ok: true, registro: { s: linha.semana, t: linha.treino, e: linha.exercicio, f: !!linha.feito, c: linha.carga ?? null } });
  } catch (error) {
    console.error('[membros/treino/registro][PUT]', error);
    return reply({ error: 'Não foi possível salvar agora.' }, 500);
  }
}
