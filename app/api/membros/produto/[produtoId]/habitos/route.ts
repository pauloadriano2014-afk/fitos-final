// app/api/membros/produto/[produtoId]/habitos/route.ts
// ✅ ÁREA DE MEMBROS — checklist de hábitos. GET: a lista de hábitos, os quadradinhos marcados e os que marcaram sozinhos a partir do treino.
// PUT { semana, dia, habito, feito }: marca ou desmarca um quadradinho (hábito automático e dia que ainda não chegou são recusados). Na prévia nada é gravado.
import { comAcesso, reply } from '@/lib/membrosRota';
import prisma from '@/lib/prisma';
import { conteudoDaAba } from '@/lib/membrosConteudo';
import { dataBrasil, diasAutomaticos, validarHabito } from '@/lib/membrosHabitos';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'leitura', 'habitos GET', async (a) => {
    const aba = a.abas.find((x) => x.tipo === 'habitos');
    const conteudo = aba ? conteudoDaAba(aba) : null;
    if (!aba || !conteudo) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    let marcados: [number, number, string][] = [];
    let auto = { treino: [] as [number, number][], carga: [] as [number, number][] };
    if (a.membro) {
      const linhas: any[] = await prisma.membroHabito.findMany({ where: { membroId: a.membro.id, produtoId: a.produto.id } });
      marcados = linhas.map((l) => [l.semana, l.dia, l.habito]);
      if (a.abas.some((x) => x.tipo === 'treino')) {
        const regs: any[] = await prisma.membroRegistro.findMany({ where: { membroId: a.membro.id, produtoId: a.produto.id } });
        auto = diasAutomaticos(regs, a.comprouEm, a.semanas);
      }
    }
    return reply({
      aba: { id: aba.id, tipo: aba.tipo, titulo: aba.titulo }, conteudo,
      semanas: a.semanas, semanaAtual: a.semanaAtual, inicio: dataBrasil(a.comprouEm), hoje: dataBrasil(new Date()),
      marcados, auto,
      ...(a.previa ? { previa: true } : {}),
    });
  });
}

export async function PUT(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'escrita', 'habitos PUT', async (a) => {
    const aba = a.abas.find((x) => x.tipo === 'habitos');
    const conteudo = aba ? conteudoDaAba(aba) : null;
    if (!aba || !conteudo) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    const body = await request.json().catch(() => null);
    const r = validarHabito(body, conteudo, a.semanas, a.comprouEm);
    if (!r.ok) return reply({ error: r.motivo === 'futuro' ? 'Esse dia ainda não chegou.' : r.motivo === 'automatico' ? 'Esse hábito marca sozinho.' : 'Anotação inválida.' }, 400);
    if (a.previa || !a.membro) return reply({ ok: true, previa: true });
    const where = { membroId: a.membro.id, produtoId: a.produto.id, semana: r.semana, dia: r.dia, habito: r.habito };
    if (r.feito) await prisma.membroHabito.upsert({ where: { membroId_produtoId_semana_dia_habito: where }, update: {}, create: where });
    else await prisma.membroHabito.deleteMany({ where });
    return reply({ ok: true });
  });
}
