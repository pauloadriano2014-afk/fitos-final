// app/api/admin/produtos/[id]/membros/route.ts
// 📚 (out 2026) PAINEL DE PRODUTOS — configuração da Área de Membros de um produto: qual Treino Avulso é o treino dele e quais abas a pessoa vê.
//   GET   -> { treinoAvulsoId, abas, modelos, treinos }   (abas = a lista salva; modelos = conteúdos prontos; treinos = os Treinos Avulsos do dono do produto)
//   PUT   { treinoAvulsoId: string | null, abas: [...] | null }   valida e salva (conteúdo malformado é recusado com o motivo)
// Só o coach dono do produto (ou o time master).
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { validarAbas, TIPOS_ABA, TITULO_PADRAO } from '@/lib/membrosConteudo';
import { MODELOS } from '@/lib/membrosModelos';
import { parseQuickData, quickAvailableDays } from '@/lib/workoutShare';

export const dynamic = 'force-dynamic';

const NOMES_MODELOS: Record<string, string> = {
  aquecimento: 'Guia de aquecimento', cardio: 'Guia de cardio', progressao: 'Guia de progressão de carga', receitas: '30 receitas fitness',
  habitos: 'Checklist de hábitos', medidas: 'Ficha de medidas e fotos', diario: 'Diário de cargas',
};
const TIPO_DO_MODELO: Record<string, string> = { aquecimento: 'guia', cardio: 'guia', progressao: 'guia', receitas: 'receitas', habitos: 'habitos', medidas: 'medidas', diario: 'diario' };

async function autorizar(request: NextRequest, id: string) {
  const produto = await prisma.produtoDigital.findUnique({ where: { id }, select: { id: true, coachId: true, treinoAvulsoId: true, membrosAbas: true } });
  if (!produto) return { response: NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 }) };
  const auth = requireAuth(request);
  if ('response' in auth) return { response: auth.response };
  if (!canActAsCoach(auth.user, produto.coachId)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { produto };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const r = await autorizar(request, params.id);
    if ('response' in r) return r.response;
    const { produto } = r;
    let abas: any[] = [];
    try { const p = produto.membrosAbas ? JSON.parse(produto.membrosAbas) : []; if (Array.isArray(p)) abas = p; } catch { abas = []; }
    const quicks: any[] = await prisma.quickWorkout.findMany({ where: { coachId: produto.coachId }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, name: true, data: true } });
    const treinos = quicks.map((q) => {
      const parsed = parseQuickData(q.data);
      return { id: q.id, nome: q.name, dias: parsed.ok ? quickAvailableDays(parsed.days).length : 0, exercicios: parsed.ok ? Object.values(parsed.days).reduce((n: number, l: any) => n + l.length, 0) : 0 };
    });
    const modelos = Object.keys(MODELOS).map((nome) => ({ nome, titulo: NOMES_MODELOS[nome] || nome, tipo: TIPO_DO_MODELO[nome] || 'guia' }));
    return NextResponse.json({ treinoAvulsoId: produto.treinoAvulsoId ?? null, abas, modelos, treinos, tipos: TIPOS_ABA.map((t) => ({ tipo: t, titulo: TITULO_PADRAO[t] })) });
  } catch (error) {
    console.error('[admin/produtos/[id]/membros][GET]', error);
    return NextResponse.json({ error: 'Erro ao carregar a Área de Membros do produto' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const r = await autorizar(request, params.id);
    if ('response' in r) return r.response;
    const { produto } = r;
    const body = await request.json().catch(() => ({}));

    let treinoAvulsoId: string | null = null;
    if (body?.treinoAvulsoId !== null && body?.treinoAvulsoId !== undefined && body?.treinoAvulsoId !== '') {
      if (typeof body.treinoAvulsoId !== 'string' || body.treinoAvulsoId.length > 64) return NextResponse.json({ error: 'Treino avulso inválido.' }, { status: 400 });
      const q = await prisma.quickWorkout.findUnique({ where: { id: body.treinoAvulsoId }, select: { id: true, coachId: true, data: true } });
      if (!q || q.coachId !== produto.coachId) return NextResponse.json({ error: 'Treino avulso não encontrado.' }, { status: 404 });
      if (!parseQuickData(q.data).ok) return NextResponse.json({ error: 'Esse treino avulso está vazio ou ilegível. Abra e salve de novo.' }, { status: 400 });
      treinoAvulsoId = q.id;
    }

    const v = validarAbas(body?.abas);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    // a aba Treino precisa de um treino ligado
    if (v.json && !treinoAvulsoId && /"tipo":"(treino|diario)"/.test(v.json)) return NextResponse.json({ error: 'Escolha o Treino Avulso do produto para usar as abas Treino e Diário de cargas.' }, { status: 400 });

    await prisma.produtoDigital.update({ where: { id: produto.id }, data: { treinoAvulsoId, membrosAbas: v.json } });
    return NextResponse.json({ ok: true, treinoAvulsoId });
  } catch (error) {
    console.error('[admin/produtos/[id]/membros][PUT]', error);
    return NextResponse.json({ error: 'Erro ao salvar a Área de Membros do produto' }, { status: 500 });
  }
}
