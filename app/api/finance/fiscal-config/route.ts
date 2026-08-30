// app/api/finance/fiscal-config/route.ts
// 🧾 STATUS + CONFIGURAÇÃO PADRÃO DE NOTA FISCAL (NFS-e via Asaas)
//
// GET  -- checa AO VIVO na Asaas se a conta já tem os dados fiscais
//         cadastrados (prefeitura, inscrição municipal, certificado/usuário
//         etc.) e devolve também o "serviço padrão" já salvo, se houver.
//         Cadastrar os dados fiscais em si (inscrição municipal, certificado
//         digital, usuário da prefeitura...) varia demais de município pra
//         município (a Asaas tem um formulário próprio pra isso na conta
//         dela) -- aqui a gente só LÊ o status e deixa o coach escolher o
//         serviço/alíquota padrão usado toda vez que ele emitir uma nota.
// POST -- salva o serviço padrão (serviceDescription, municipalServiceId/
//         Code/Name, issRate) usado em toda emissão futura.
//
// Fase 1: só a conta do 'paulo' (PA ELITE TEAM LTDA) é suportada -- ver
// discussão sobre DEFAULT_COACH_ID hardcoded nas rotas de cobrança de aluno
// (create-charge/checkout/recurrence), que hoje fazem todo pagamento de
// aluno (inclusive de coach parceiro) cair na conta Asaas do Paulo. Emitir
// nota fiscal por coach parceiro, pelo CNPJ de cada um, exige resolver
// aquilo antes -- não dá pra fazer aqui sem repetir o mesmo problema.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { getFiscalInfo } from '@/lib/asaas';

export const dynamic = 'force-dynamic';

const PLATFORM_COACH_ID = 'paulo'; // mesma constante usada nas rotas de cobrança (fase 1: coach único)

export async function GET(req: NextRequest) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const gatewayAccount = await prisma.paymentGatewayAccount.findUnique({
      where: { coachId: PLATFORM_COACH_ID },
    });

    if (!gatewayAccount) {
      return NextResponse.json({
        configured: false,
        reason: 'Nenhuma conta Asaas configurada ainda.',
        defaultService: null,
      });
    }

    let fiscalInfo: any = null;
    let fiscalCheckError: string | null = null;
    try {
      fiscalInfo = await getFiscalInfo(gatewayAccount.asaasApiKey);
    } catch (err: any) {
      fiscalCheckError = err?.message || 'Erro ao consultar a Asaas.';
    }

    const defaultService = gatewayAccount.defaultServiceDescription
      ? {
          municipalServiceId: gatewayAccount.defaultMunicipalServiceId,
          municipalServiceCode: gatewayAccount.defaultMunicipalServiceCode,
          municipalServiceName: gatewayAccount.defaultMunicipalServiceName,
          serviceDescription: gatewayAccount.defaultServiceDescription,
          issRate: gatewayAccount.defaultIssRate,
        }
      : null;

    if (fiscalCheckError) {
      return NextResponse.json({
        configured: null, // não deu pra confirmar (erro de rede/credencial), diferente de "não configurado"
        error: fiscalCheckError,
        defaultService,
      });
    }

    return NextResponse.json({
      configured: !!fiscalInfo,
      fiscalInfo: fiscalInfo
        ? {
            email: fiscalInfo.email,
            municipalInscription: fiscalInfo.municipalInscription,
            simplesNacional: fiscalInfo.simplesNacional,
            cnae: fiscalInfo.cnae,
            status: fiscalInfo.status,
          }
        : null,
      defaultService,
    });
  } catch (error: any) {
    console.error('[finance/fiscal-config] Erro (GET):', error?.message || error);
    return NextResponse.json({ error: 'Erro ao consultar configuração fiscal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const {
      municipalServiceId,
      municipalServiceCode,
      municipalServiceName,
      serviceDescription,
      issRate,
    } = body;

    if (!serviceDescription || typeof serviceDescription !== 'string' || !serviceDescription.trim()) {
      return NextResponse.json({ error: 'Descrição do serviço é obrigatória.' }, { status: 400 });
    }
    if (!municipalServiceName) {
      return NextResponse.json({ error: 'Selecione um serviço municipal.' }, { status: 400 });
    }
    const parsedIssRate = issRate !== undefined && issRate !== null ? parseFloat(issRate) : null;
    if (parsedIssRate !== null && (isNaN(parsedIssRate) || parsedIssRate < 0)) {
      return NextResponse.json({ error: 'Alíquota de ISS inválida.' }, { status: 400 });
    }

    const gatewayAccount = await prisma.paymentGatewayAccount.findUnique({
      where: { coachId: PLATFORM_COACH_ID },
    });
    if (!gatewayAccount) {
      return NextResponse.json({ error: 'Nenhuma conta Asaas configurada ainda.' }, { status: 400 });
    }

    const updated = await prisma.paymentGatewayAccount.update({
      where: { id: gatewayAccount.id },
      data: {
        defaultMunicipalServiceId: municipalServiceId || null,
        defaultMunicipalServiceCode: municipalServiceCode || null,
        defaultMunicipalServiceName: municipalServiceName,
        defaultServiceDescription: serviceDescription.trim(),
        defaultIssRate: parsedIssRate,
      },
    });

    return NextResponse.json({
      success: true,
      defaultService: {
        municipalServiceId: updated.defaultMunicipalServiceId,
        municipalServiceCode: updated.defaultMunicipalServiceCode,
        municipalServiceName: updated.defaultMunicipalServiceName,
        serviceDescription: updated.defaultServiceDescription,
        issRate: updated.defaultIssRate,
      },
    });
  } catch (error: any) {
    console.error('[finance/fiscal-config] Erro (POST):', error?.message || error);
    return NextResponse.json({ error: 'Erro ao salvar configuração fiscal' }, { status: 500 });
  }
}
