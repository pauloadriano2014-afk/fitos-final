// app/api/produtos/curso/[token]/progresso/route.ts
// 🌐 ROTA PÚBLICA — sem login. Duas ações possíveis no corpo da requisição:
//   1) { moduloIdx, aulaIdx } — alterna (toggle) a aula entre concluída/não
//      concluída. É um "conjunto" (marca uma vez), diferente do progresso de
//      treino que é um log de sessões repetidas.
//   2) { emitirCertificado: true } — marca a data de emissão do certificado
//      (idempotente — só grava na primeira vez). A geração do PDF em si
//      acontece no app (mesmo padrão do PDF de treino); esta rota só registra
//      que o certificado já foi emitido, pra fins de acompanhamento.
// Em ambos os casos, valida no servidor que o módulo já está desbloqueado
// antes de aceitar a conclusão de uma aula — o cliente nunca decide sozinho
// se pode marcar algo como concluído.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
    try {
        const { token } = params;
        const body = await request.json();
        const { moduloIdx, aulaIdx, emitirCertificado } = body;

        const acesso = await prisma.produtoCursoAcesso.findUnique({
            where: { token },
            include: { produto: { select: { cursoPrograma: true } } },
        });
        if (!acesso) {
            return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });
        }

        if (emitirCertificado) {
            const data = acesso.certificadoEmitidoEm
                ? acesso
                : await prisma.produtoCursoAcesso.update({
                      where: { token },
                      data: { certificadoEmitidoEm: new Date(), ultimoAcesso: new Date() },
                  });
            return NextResponse.json({ certificadoEmitidoEm: data.certificadoEmitidoEm });
        }

        if (moduloIdx === undefined || moduloIdx === null || aulaIdx === undefined || aulaIdx === null) {
            return NextResponse.json({ error: 'moduloIdx e aulaIdx são obrigatórios' }, { status: 400 });
        }

        let modulos: any[] = [];
        try {
            const parsed = acesso.produto.cursoPrograma ? JSON.parse(acesso.produto.cursoPrograma) : null;
            modulos = Array.isArray(parsed?.modulos) ? parsed.modulos : [];
        } catch {
            modulos = [];
        }

        const modulo = modulos[moduloIdx];
        if (!modulo) {
            return NextResponse.json({ error: 'Módulo não encontrado' }, { status: 404 });
        }

        // 🔒 Nunca confia no cliente pra saber se o módulo já liberou — recalcula
        // aqui, igual à rota GET.
        const liberacaoDias = Number(modulo?.liberacaoDias) || 0;
        const diasDesdeCompra = Math.floor((Date.now() - new Date(acesso.createdAt).getTime()) / MS_POR_DIA);
        if (diasDesdeCompra < liberacaoDias) {
            return NextResponse.json({ error: 'Este módulo ainda não foi liberado' }, { status: 403 });
        }

        let progresso: { aulasConcluidas: string[] } = { aulasConcluidas: [] };
        try {
            progresso = acesso.progresso ? JSON.parse(acesso.progresso) : { aulasConcluidas: [] };
        } catch {
            progresso = { aulasConcluidas: [] };
        }
        if (!Array.isArray(progresso.aulasConcluidas)) progresso.aulasConcluidas = [];

        const chave = `${moduloIdx}-${aulaIdx}`;
        const jaConcluida = progresso.aulasConcluidas.includes(chave);
        progresso.aulasConcluidas = jaConcluida
            ? progresso.aulasConcluidas.filter((c) => c !== chave)
            : [...progresso.aulasConcluidas, chave];

        await prisma.produtoCursoAcesso.update({
            where: { token },
            data: { progresso: JSON.stringify(progresso), ultimoAcesso: new Date() },
        });

        return NextResponse.json({ progresso, concluida: !jaConcluida });
    } catch (error) {
        console.error('[produtos/curso/[token]/progresso][POST]', error);
        return NextResponse.json({ error: 'Erro ao salvar progresso' }, { status: 500 });
    }
}
