// app/api/produtos/treino/[token]/progresso/route.ts
// 🌐 ROTA PÚBLICA — sem login. Registra uma sessão de treino concluída (data +
// cargas opcionais por exercício). Sempre ANEXA uma nova sessão ao
// histórico — nunca sobrescreve — porque a mesma ficha é repetida toda
// semana ao longo das 8 semanas do protocolo, e o histórico de cargas é o
// que permite acompanhar a progressão.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Trava de segurança bem acima do uso real (7 treinos x algumas repetições
// ao longo de semanas) — só evita que o campo cresça sem limite.
const MAX_SESSOES = 200;

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
    try {
        const { token } = params;
        const body = await request.json();
        const { treinoIndex, cargas } = body;

        if (treinoIndex === undefined || treinoIndex === null) {
            return NextResponse.json({ error: 'treinoIndex é obrigatório' }, { status: 400 });
        }

        const acesso = await prisma.produtoTreinoAcesso.findUnique({ where: { token } });
        if (!acesso) {
            return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });
        }

        let progresso: { sessoes: any[] } = { sessoes: [] };
        try {
            progresso = acesso.progresso ? JSON.parse(acesso.progresso) : { sessoes: [] };
        } catch {
            progresso = { sessoes: [] };
        }

        progresso.sessoes.push({
            treinoIndex,
            data: new Date().toISOString(),
            cargas: cargas && typeof cargas === 'object' ? cargas : {},
        });

        if (progresso.sessoes.length > MAX_SESSOES) {
            progresso.sessoes = progresso.sessoes.slice(-MAX_SESSOES);
        }

        await prisma.produtoTreinoAcesso.update({
            where: { token },
            data: { progresso: JSON.stringify(progresso), ultimoAcesso: new Date() },
        });

        return NextResponse.json({ progresso });
    } catch (error) {
        console.error('[produtos/treino/[token]/progresso][POST]', error);
        return NextResponse.json({ error: 'Erro ao salvar progresso' }, { status: 500 });
    }
}
