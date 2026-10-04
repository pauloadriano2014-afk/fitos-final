// app/api/membros/produto/[produtoId]/fotos/[fotoId]/route.ts
// 📸 ÁREA DE MEMBROS — GET devolve a foto (só a dona, com a sessão dela; na prévia não há fotos). DELETE apaga.
import { comAcesso, reply, HEADERS } from '@/lib/membrosRota';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const FOTO_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

async function dona(a: { membro: { id: string } | null; produto: { id: string } }, fotoId: unknown) {
  const id = String(fotoId ?? '');
  if (!a.membro || !FOTO_ID_RE.test(id)) return null;
  const f: any = await prisma.membroFoto.findUnique({ where: { id } });
  return f && f.membroId === a.membro.id && f.produtoId === a.produto.id ? f : null;
}

export async function GET(request: Request, { params }: { params: { produtoId: string; fotoId: string } }) {
  return comAcesso(request, params?.produtoId, 'leitura', 'foto GET', async (a) => {
    const f = await dona(a, params?.fotoId);
    if (!f) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    return new Response(new Uint8Array(f.bytes), { status: 200, headers: { ...HEADERS, 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  });
}

export async function DELETE(request: Request, { params }: { params: { produtoId: string; fotoId: string } }) {
  return comAcesso(request, params?.produtoId, 'escrita', 'foto DELETE', async (a) => {
    const f = await dona(a, params?.fotoId);
    if (!f) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    await prisma.membroFoto.delete({ where: { id: f.id } });
    return reply({ ok: true });
  });
}
