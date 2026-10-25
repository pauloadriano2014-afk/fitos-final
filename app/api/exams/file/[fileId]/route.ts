// app/api/exams/file/[fileId]/route.ts
// 🩺 (25 out 2026) GET ?t=<link assinado> -> entrega UM arquivo do exame. O link vale 10 minutos e foi pedido por quem estava logado (rota /api/exams/[id]).
// Aqui o acesso é conferido DE NOVO (se o aluno trocou de profissional nesse meio tempo, o antigo perde o arquivo). Nunca vira endereço público: sem cache, sem indexação.
import prisma from '@/lib/prisma';
import { verifyFileToken } from '@/lib/exams';
import { getExamStore } from '@/lib/examsStore';
import { loadForUser, missing } from '@/lib/examsService';

export const dynamic = 'force-dynamic';
const deny = (status: number, msg: string) => new Response(JSON.stringify({ error: msg }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

export async function GET(req: Request, { params }: { params: { fileId: string } }) {
  try {
    const t = new URL(req.url).searchParams.get('t');
    const v = verifyFileToken(t, params.fileId);
    if (!v) return deny(401, 'Link expirado. Abra o documento de novo.');
    const store = getExamStore();
    if (!store) return deny(503, 'Armazenamento indisponível.');
    const file: any = await prisma.examFile.findUnique({ where: { id: params.fileId } });
    if (!file) return deny(404, 'Arquivo não encontrado.');
    const { sub, role } = await loadForUser(prisma, { id: v.viewerId }, file.submissionId);
    if (!sub || !role) return deny(404, 'Arquivo não encontrado.');
    const buf = await store.get(file.key);
    if (!buf) return deny(404, 'Arquivo não encontrado.');
    return new Response(buf as any, { status: 200, headers: { 'content-type': file.mime, 'content-length': String(buf.length), 'content-disposition': 'inline', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' } });
  } catch (e: any) {
    if (missing(e)) return deny(503, 'Exames ainda não habilitados.');
    console.error('[GET /api/exams/file]', e);
    return deny(500, 'Erro ao abrir o arquivo.');
  }
}
