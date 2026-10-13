// app/api/ai/elite-assistant/route.ts
// Chat de suporte para coaches (IA de "como fazer") — Claude Haiku 5.5
// Responde apenas sobre funcionalidades da plataforma ELITE FIT
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isActiveCoach, coachOnly } from '@/lib/aiAccess';
import { checkRateLimit } from '@/lib/rateLimit';
import { isMasterCoachId } from '@/lib/coachAssistant';
import { supportSystemPrompt } from '@/lib/assistantGuides';

export const dynamic    = 'force-dynamic';
export const maxDuration = 30;


// ─── BASE DE CONHECIMENTO ─────────────────────────────────────────────────────
// (13 out 2026) A base agora vem de lib/assistantGuides.ts (a MESMA lista dos guias "Como fazer" do assistente): uma fonte só, sempre em dia, e já filtrada pelo que
// ESTE coach pode usar (Personal não vê dieta, Nutricionista não vê treino, "Time master" só para Paulo e Adri).
const MAX_MESSAGE = 600;
const MAX_HISTORY_CHARS = 2000;

// ─── HANDLER ─────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        // 🔒 só coach ativo (antes qualquer pessoa logada, inclusive aluno, gastava IA aqui) e com limite por hora
        if (!(await isActiveCoach(prisma, auth.user))) return coachOnly();
        const rl = checkRateLimit(`elite-assistant:${auth.user.id}`, { max: 60, windowMs: 60 * 60 * 1000 });
        if (!rl.allowed) return NextResponse.json({ error: 'Muitas perguntas seguidas. Aguarde um pouco.' }, { status: 429 });

        const body = await req.json().catch(() => ({}));
        const message = typeof body?.message === 'string' ? body.message.trim() : '';
        if (!message) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
        if (message.length > MAX_MESSAGE) return NextResponse.json({ error: `Pergunta muito longa (máx. ${MAX_MESSAGE} letras).` }, { status: 400 });

        // o plano vem do BANCO (antes vinha do app e qualquer um podia dizer que era ELITE)
        const master = isMasterCoachId(auth.user.id);
        let plan: string | null = null;
        if (!master) { try { const u: any = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { coachPlan: true } }); plan = u?.coachPlan || null; } catch { plan = null; } }
        const system = supportSystemPrompt({ master, plan });

        const history = (Array.isArray(body?.history) ? body.history : []).slice(-10)
            .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
            .map((h: any) => ({ role: h.role as 'user' | 'assistant', content: String(h.content).slice(0, MAX_HISTORY_CHARS) }));
        // a conversa tem de começar e alternar como a API exige: descarta o que vier antes da 1ª fala do usuário
        while (history.length && history[0].role !== 'user') history.shift();
        const messages: { role: 'user' | 'assistant'; content: string }[] = [];
        for (const h of history) { if (messages.length && messages[messages.length - 1].role === h.role) messages[messages.length - 1] = h; else messages.push(h); }
        if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();   // a pergunta atual entra logo abaixo
        messages.push({ role: 'user', content: message });

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 });
        const response: any = await client.messages.create({ model: 'claude-haiku-5-5', max_tokens: 700, system, messages });
        const reply = (response.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        return NextResponse.json({ reply });

    } catch (error: any) {
        console.error('[elite-assistant]', error.message);
        return NextResponse.json({ error: 'Assistente indisponível no momento.' }, { status: 500 });
    }
}
