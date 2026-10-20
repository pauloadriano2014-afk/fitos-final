// app/api/admin/generate-diet/route.ts — VERSÃO 7.3 (TRAVA DE MACROS E FAVORITOS OBRIGATÓRIOS)
// Melhorias vs v7.2:
//   - FIX MACROS INVERTIDOS: Trava rigorosa para impedir que dias de descanso ultrapassem as calorias de dias de treino.
//   - FIX FAVORITOS: A IA é agora OBRIGADA a usar a lista de favoritos do aluno como base e substitutos primários.
//   - FIX REASONING: Exige que a IA explique como bateu as calorias naquele dia específico.
// (3 out 2026) O motor de geração (agenda, prompt, catálogo, correção de macros, provedores) mora em lib/ai/dietGen.ts, compartilhado com o plano
// automático do aluno. Esta rota ficou só com a autenticação e as travas de acesso.

import { NextResponse } from 'next/server';
import { requireAuth, isMasterId } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkCoachAi, gateResponse, dietReadiness } from '@/lib/coachAi';
import { generateDietDay } from '@/lib/ai/dietGen';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        // 🔒 Montagem por IA: time master sempre; coach parceiro só com a chave `iaDieta` ligada pelo master, dentro do limite do mês (lib/coachAi.ts).
        const gate = await checkCoachAi(prisma, auth.user, 'dieta');
        if (!gate.ok) return gateResponse(gate);

        const { anamnese, dayType = 'TREINO', provider: providerAsked = 'anthropic', birthDate, gender, macrosOverride, customInstruction = '' } = await req.json();

        if (!anamnese) return NextResponse.json({ error:'Anamnese não encontrada.' }, { status:400 });

        // 💸 Coach parceiro usa só o motor mais barato (Google); os outros são do master. 🧭 E só gera com a anamnese em ordem.
        const provider = gate.master ? providerAsked : 'google';
        if (!gate.master) {
            const ready = dietReadiness(anamnese);
            if (!ready.ok) return NextResponse.json({ error: ready.blockers[0], code: 'NAO_PRONTO', blockers: ready.blockers, warnings: ready.warnings }, { status: 422 });
        }

        // 🔒 Claude Haiku é modelo exclusivo de master (Paulo/Adri) -- a UI já
        // esconde essa opção pra coach parceiro, isso aqui é a trava real.
        if (providerAsked === 'anthropic-haiku' && !isMasterId(auth.user.id)) {
            return NextResponse.json({ error: 'Este modelo de IA está disponível apenas para os administradores master.' }, { status: 403 });
        }

        const result = await generateDietDay({ anamnese, dayType, provider, birthDate, gender, macrosOverride, customInstruction });
        // 📊 Cada aba de dieta gerada fica no registro de IA: é o que conta o limite do mês do coach e mostra o custo real (antes a dieta não deixava rastro).
        try { await (prisma as any).aiLog.create({ data: { userId: auth.user.id, question: `gerar-dieta:${provider}`, answer: JSON.stringify({ dayType, provider, modelUsed: (result as any)?.meta?.modelUsed, usageAndCost: (result as any)?.usageAndCost || null }).slice(0, 4000) } }); } catch (e: any) { console.error('[generate-diet] log:', e?.message || e); }
        return NextResponse.json(result, { status: 200 });

    } catch (err: any) {
        console.error('[generate-diet]', err?.message ?? err);
        return NextResponse.json({ error:'Erro ao gerar dieta.' }, { status:500 });
    }
}
