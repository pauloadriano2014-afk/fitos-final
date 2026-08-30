// app/api/finance/fiscal-config/municipal-services/route.ts
// 🧾 Proxy pra lista de serviços municipais da conta Asaas (usado pelo
// seletor de "serviço padrão" na tela de configuração fiscal). Query opcional
// ?search= filtra pela descrição do serviço.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { getMunicipalServices } from '@/lib/asaas';

export const dynamic = 'force-dynamic';

const PLATFORM_COACH_ID = 'paulo';

export async function GET(req: NextRequest) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const gatewayAccount = await prisma.paymentGatewayAccount.findUnique({
      where: { coachId: PLATFORM_COACH_ID },
    });
    if (!gatewayAccount) {
      return NextResponse.json({ error: 'Nenhuma conta Asaas configurada ainda.' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;

    const result = await getMunicipalServices(search, gatewayAccount.asaasApiKey);

    return NextResponse.json({
      services: Array.isArray(result?.data) ? result.data : [],
    });
  } catch (error: any) {
    console.error('[finance/fiscal-config/municipal-services] Erro:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Erro ao buscar serviços municipais' }, { status: 500 });
  }
}
