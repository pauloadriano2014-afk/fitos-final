// app/api/membros/treino/[produtoId]/route.ts
// 🏋️ ÁREA DE MEMBROS — o treino interativo de um produto (a página /treino/ do site de membros). Exige `Authorization: Bearer <sessão>` e uma compra paga do produto.
// Devolve o programa (treinos, exercícios, vídeos no mesmo formato da página pública /t, técnicas explicadas), a semana em que a pessoa está e tudo que ela já marcou.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { MASTER_TEAM_ID } from '@/lib/workoutShare';
import { tokenDoCabecalho, sessaoValida, vendaPagaComProduto } from '@/lib/membros';
import { lerPrograma, semanaAtual, tecnicasDoPrograma } from '@/lib/membrosTreino';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function GET(request: Request, { params }: { params: { produtoId: string } }) {
  try {
    const sessao = await sessaoValida(prisma, tokenDoCabecalho(request.headers.get('authorization')));
    if (!sessao) return reply({ error: 'Sessão expirada. Entre de novo.' }, 401);

    const produtoId = String(params?.produtoId ?? '');
    if (!produtoId || produtoId.length > 64) return reply({ error: 'Treino não encontrado.' }, 404);

    const venda = await vendaPagaComProduto(prisma, sessao.membro.email, produtoId);
    if (!venda) return reply({ error: 'Treino não encontrado.' }, 404);

    const produto = await prisma.produtoDigital.findUnique({ where: { id: produtoId }, select: { id: true, nome: true, treinoPrograma: true, coachId: true } });
    const programa = produto ? lerPrograma(produto.treinoPrograma) : null;
    if (!produto || !programa) return reply({ error: 'Treino não encontrado.' }, 404);

    // vídeos das técnicas (drop-set etc.): os do time do coach valem sobre os do time master, como no app
    const teamId = produto.coachId && !MASTER_IDS.includes(produto.coachId) ? produto.coachId : MASTER_TEAM_ID;
    const linhas: any[] = await prisma.systemTechniqueVideo.findMany({ where: { teamId: { in: [MASTER_TEAM_ID, teamId] } } });
    const videos: Record<string, string> = {};
    linhas.filter((r) => r.teamId === MASTER_TEAM_ID).forEach((r) => { videos[r.key] = r.videoUrl; });
    linhas.filter((r) => r.teamId !== MASTER_TEAM_ID).forEach((r) => { videos[r.key] = r.videoUrl; });

    const registros: any[] = await prisma.membroRegistro.findMany({ where: { membroId: sessao.membro.id, produtoId } });
    const comprouEm = new Date(venda.paymentDate || venda.createdAt);

    return reply({
      produto: { id: produto.id, nome: produto.nome },
      comprouEm: comprouEm.toISOString(),
      semanas: programa.semanas,
      semanaAtual: semanaAtual(comprouEm, programa.semanas),
      treinos: programa.treinos,
      tecnicas: tecnicasDoPrograma(programa, videos),
      registros: registros.map((r) => ({ s: r.semana, t: r.treino, e: r.exercicio, f: !!r.feito, c: r.carga ?? null })),
    });
  } catch (error) {
    console.error('[membros/treino][GET]', error);
    return reply({ error: 'Erro ao carregar o treino.' }, 500);
  }
}
