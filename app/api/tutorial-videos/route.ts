// app/api/tutorial-videos/route.ts
// 🎓 (10 out 2026) Vídeos do tutorial do app do aluno (um por aba), editados na tela "Vídeos do tutorial" (só Paulo e Adri).
//   GET            (qualquer usuário logado) -> { videos: { [aba]: { url, title, partnerTitle, subtitle, chapters, durationSec } } }  — só o que foi cadastrado; o resto o app preenche com o padrão
//   PUT { tab, url?, guid?, title?, partnerTitle?, subtitle?, chapters?, durationSec? } (master) -> grava só os campos enviados ("" ou null limpa o campo)
//   DELETE ?tab=   (master) -> volta aquela aba ao padrão do app (o arquivo na Cloudflare NÃO é apagado: ele pode estar em uso por algum aluno com o app aberto)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireMaster } from '@/lib/auth';
import { buildUpdate, isTab, toPublic } from '@/lib/tutorialVideos';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const rows: any[] = await prisma.tutorialVideo.findMany();
    const videos: Record<string, any> = {};
    rows.filter((r) => isTab(r.tab)).forEach((r) => { videos[r.tab] = toPublic(r); });
    return NextResponse.json({ success: true, videos }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e: any) {
    // tabela ainda não criada (falta o `prisma db push`): o app só usa o padrão
    if (missing(e)) return NextResponse.json({ success: true, videos: {} });
    console.error('ERRO tutorial-videos GET:', e);
    return NextResponse.json({ error: 'Erro ao carregar os vídeos do tutorial.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    if (!isTab(body?.tab)) return NextResponse.json({ error: 'Aba inválida.' }, { status: 400 });
    let data: Record<string, any>;
    try { data = buildUpdate(body); } catch (e: any) { return NextResponse.json({ error: e?.message || 'Dados inválidos.' }, { status: 400 }); }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nada para salvar.' }, { status: 400 });
    // trocar o link sem mandar o id do vídeo limpa o id antigo (ele já não vale para o link novo)
    if (data.url !== undefined && data.guid === undefined) data.guid = null;
    const row = await prisma.tutorialVideo.upsert({ where: { tab: body.tab }, create: { tab: body.tab, ...data, updatedBy: auth.user.id }, update: { ...data, updatedBy: auth.user.id } });
    return NextResponse.json({ success: true, video: toPublic(row) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'A tabela dos vídeos do tutorial ainda não foi criada no banco (rode o prisma db push).' }, { status: 503 });
    console.error('ERRO tutorial-videos PUT:', e);
    return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    const tab = new URL(req.url).searchParams.get('tab') || '';
    if (!isTab(tab)) return NextResponse.json({ error: 'Aba inválida.' }, { status: 400 });
    await prisma.tutorialVideo.deleteMany({ where: { tab } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ success: true });
    console.error('ERRO tutorial-videos DELETE:', e);
    return NextResponse.json({ error: 'Erro ao remover.' }, { status: 500 });
  }
}
