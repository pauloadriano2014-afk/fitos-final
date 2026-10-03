// app/api/admin/generate-diet/route.ts — VERSÃO 7.3 (TRAVA DE MACROS E FAVORITOS OBRIGATÓRIOS)
// Melhorias vs v7.2:
//   - FIX MACROS INVERTIDOS: Trava rigorosa para impedir que dias de descanso ultrapassem as calorias de dias de treino.
//   - FIX FAVORITOS: A IA é agora OBRIGADA a usar a lista de favoritos do aluno como base e substitutos primários.
//   - FIX REASONING: Exige que a IA explique como bateu as calorias naquele dia específico.
// (3 out 2026) O motor de geração (agenda, prompt, catálogo, correção de macros, provedores) mora em lib/ai/dietGen.ts, compartilhado com o plano
// automático do aluno. Esta rota ficou só com a autenticação e as travas de acesso.

import { NextResponse } from 'next/server';
import { requireAuth, isMasterId } from '@/lib/auth';
import { canUseAiBuilder, aiBuilderLocked } from '@/lib/aiAccess';
import { generateDietDay } from '@/lib/ai/dietGen';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        // 🔒 Montagem por IA só pro time master (a criação por voz continua liberada pros parceiros).
        if (!canUseAiBuilder(auth.user)) return aiBuilderLocked();

        const { anamnese, dayType = 'TREINO', provider = 'anthropic', birthDate, gender, macrosOverride, customInstruction = '' } = await req.json();

        if (!anamnese) return NextResponse.json({ error:'Anamnese não encontrada.' }, { status:400 });

        // 🔒 Claude Haiku é modelo exclusivo de master (Paulo/Adri) -- a UI já
        // esconde essa opção pra coach parceiro, isso aqui é a trava real.
        if (provider === 'anthropic-haiku' && !isMasterId(auth.user.id)) {
            return NextResponse.json({ error: 'Este modelo de IA está disponível apenas para os administradores master.' }, { status: 403 });
        }

        const result = await generateDietDay({ anamnese, dayType, provider, birthDate, gender, macrosOverride, customInstruction });
        return NextResponse.json(result, { status: 200 });

    } catch (err: any) {
        console.error('[generate-diet]', err?.message ?? err);
        return NextResponse.json({ error:'Erro ao gerar dieta.' }, { status:500 });
    }
}
