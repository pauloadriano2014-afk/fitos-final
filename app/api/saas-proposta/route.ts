// app/api/saas-proposta/route.ts
// 🌐 PÚBLICO: dados da PÁGINA DE VENDAS do coach parceiro (elitefitapp.com.br/invite/<id>), o que o lead enxerga antes de ter conta.
// Por que existe: a página pública chamava /api/admin/saas-meta, que exige login do coach (devolve a config inteira), então quem abria o link
// recebia 401 e via "Proposta Indisponível". Aqui só sai o que a própria página mostra, com lista fechada de campos:
//   • textos/fotos/vídeo/cor/funcionalidades da página; chave PIX e favorecido (a página exibe para o lead pagar);
//   • planos ATIVOS (nome, valor, meses, desconto, link de pagamento);
//   • logo da marca e o código de convite do coach (o cadastro do aluno é por código, não por id).
// Nunca devolve id interno de configuração, datas, e-mail, telefone, CPF, nem planos inativos.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const coachId = (new URL(req.url).searchParams.get('coachId') || '').trim();
        if (!coachId || coachId.length > 64) return NextResponse.json({ error: 'coachId obrigatório' }, { status: 400 });

        const coach = await prisma.user.findUnique({
            where: { id: coachId },
            select: { accountStatus: true, inviteCode: true, brandLogoUrl: true, brandLogoSize: true },
        });
        // coach que não existe ou conta não ativa: a página mostra "indisponível" (404), igual a quem ainda não configurou
        if (!coach || (coach.accountStatus && coach.accountStatus !== 'ACTIVE')) {
            return NextResponse.json({ error: 'Página não encontrada.' }, { status: 404 });
        }

        const [config, plans] = await Promise.all([
            prisma.salesPageConfig.findUnique({
                where: { coachId },
                select: {
                    pageTitle: true, aboutText: true, videoUrl: true, coachPhotoUrl: true, themeColor: true, appFeatures: true,
                    galleryPhotos: true, galleryTexts: true, testimonialNames: true, testimonialTexts: true, pixKey: true, pixName: true,
                },
            }),
            prisma.coachPlan.findMany({
                where: { coachId, isActive: true },
                orderBy: { value: 'asc' },
                select: { id: true, name: true, value: true, durationInMonths: true, discountPerc: true, paymentUrl: true },
            }),
        ]);

        return NextResponse.json({
            config, plans,
            brandLogoUrl: coach.brandLogoUrl ?? null, brandLogoSize: coach.brandLogoSize ?? null,
            inviteCode: coach.inviteCode ?? null,
        });
    } catch (error) {
        console.error('Erro ao buscar a página de vendas pública:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
