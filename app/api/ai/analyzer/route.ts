// app/api/ai/analyzer/route.ts
// Endpoint simples de análise — recebe prompt pronto e retorna resultado da IA
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
    try {
        const { prompt } = await req.json();
        if (!prompt) return NextResponse.json({ error: 'Prompt ausente.' }, { status: 400 });

        const res = await anthropic.messages.create({
            model:      'claude-sonnet-4-6',
            max_tokens: 2000,
            temperature: 0.2,
            messages: [{ role: 'user', content: `${prompt}\n\nRetorne APENAS o JSON pedido, sem markdown.` }],
        });

        const text = (res.content.find(b => b.type === 'text') as any)?.text ?? '{}';
        const clean = text.replace(/```json\n?|\n?```/g, '').trim();

        return NextResponse.json({ result: clean }, { status: 200 });

    } catch (err: any) {
        console.error('[analyzer]', err?.message ?? err);
        return NextResponse.json({ error: 'Erro ao analisar.' }, { status: 500 });
    }
}