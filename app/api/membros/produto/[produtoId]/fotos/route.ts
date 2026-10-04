// app/api/membros/produto/[produtoId]/fotos/route.ts
// 📸 ÁREA DE MEMBROS — fotos de evolução (PRIVADAS). PUT { momento, pose, imagem: "data:image/jpeg;base64,..." }: guarda a foto (uma por momento e pose; enviar de novo troca).
// A imagem só volta pela rota .../fotos/[fotoId], com a sessão da própria pessoa. Na prévia a foto é conferida e NÃO gravada.
import { comAcesso, reply } from '@/lib/membrosRota';
import prisma from '@/lib/prisma';
import { conteudoDaAba } from '@/lib/membrosConteudo';
import { validarFoto } from '@/lib/membrosMedidas';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: { produtoId: string } }) {
  return comAcesso(request, params?.produtoId, 'escrita', 'fotos PUT', async (a) => {
    const aba = a.abas.find((x) => x.tipo === 'medidas');
    const conteudo = aba ? conteudoDaAba(aba) : null;
    if (!aba || !conteudo || !conteudo.poses?.length) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    const body = await request.json().catch(() => null);
    const r = validarFoto(body, conteudo);
    if (!r.ok) return reply({ error: r.motivo === 'grande' ? 'A foto é grande demais. Tente de novo.' : 'Foto inválida.' }, r.motivo === 'grande' ? 413 : 400);
    if (a.previa || !a.membro) return reply({ ok: true, previa: true });

    const chave = { membroId: a.membro.id, produtoId: a.produto.id, momento: r.momento, pose: r.pose };
    const f: any = await prisma.membroFoto.upsert({
      where: { membroId_produtoId_momento_pose: chave },
      update: { bytes: r.bytes, tamanho: r.bytes.length, createdAt: new Date() },
      create: { ...chave, bytes: r.bytes, tamanho: r.bytes.length },
    });
    return reply({ ok: true, foto: { id: f.id, momento: f.momento, pose: f.pose, criadoEm: new Date(f.createdAt).toISOString() } });
  });
}
