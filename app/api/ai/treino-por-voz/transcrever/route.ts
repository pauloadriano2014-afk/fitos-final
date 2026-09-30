// app/api/ai/treino-por-voz/transcrever/route.ts
// 🎙️ (30 set 2026) Montar treino por voz -- passo 1: áudio -> texto.
//
// O app grava o áudio (expo-av) e manda pra cá; devolvemos só o TEXTO. O app
// mostra esse texto EDITÁVEL antes de interpretar -- gíria de academia
// ("leg press 45", "Smith") é onde qualquer transcrição erra, então o coach
// corrige na hora em vez de descobrir o erro depois no treino.
//
// Só masters. O áudio não é gravado em lugar nenhum: vai pra transcrição e é
// descartado.
import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { requireAuth, isMasterId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // ~10 min de áudio em m4a; o app limita a 3 min
const ALLOWED_EXT = ['m4a', 'mp4', 'mp3', 'wav', 'webm', 'ogg', 'aac', 'mpeg', 'mpga'];

// Dica de vocabulário: o Whisper erra bem menos "leg press" e "drop set"
// quando o assunto e as palavras esperadas vêm no prompt.
const WHISPER_HINT =
  'Treino de musculação. Agachamento livre, leg press 45, cadeira extensora, mesa flexora, búlgaro no Smith, ' +
  'stiff, supino reto, rosca direta, elevação pélvica, panturrilha. Séries, repetições, descanso de 60 segundos, ' +
  'drop set, rest pause, bi-set, tri-set, GVT, método 21, cluster, TUT, na última série.';

function extFrom(name: string, mime: string): string {
  const fromName = (name.split('.').pop() || '').toLowerCase();
  if (ALLOWED_EXT.includes(fromName)) return fromName;
  const m = (mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  return '';
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isMasterId(auth.user.id)) {
      return NextResponse.json({ error: 'Recurso disponível apenas para o time master.' }, { status: 403 });
    }

    const rl = checkRateLimit(`voz-transcrever:${auth.user.id}`, { max: 40, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Muitas gravações seguidas. Aguarde um pouco.' }, { status: 429 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Transcrição indisponível (chave não configurada no servidor).' }, { status: 503 });
    }

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file || typeof (file as any).arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Nenhum áudio recebido.' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'O áudio veio vazio. Tente gravar de novo.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Áudio muito grande. Grave até 3 minutos por vez.' }, { status: 413 });
    }

    const ext = extFrom(file.name || '', file.type || '');
    if (!ext) {
      return NextResponse.json({ error: 'Formato de áudio não suportado.' }, { status: 415 });
    }

    // O SDK da OpenAI lança erro no construtor se faltar a chave, por isso o
    // cliente é criado aqui (com a chave já validada) e não no topo do arquivo.
    const openai = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await toFile(bytes, `treino.${ext}`, { type: file.type || undefined });

    const t0 = Date.now();
    const r = await openai.audio.transcriptions.create({
      file: upload,
      model: 'whisper-1',
      language: 'pt',
      prompt: WHISPER_HINT,
      temperature: 0,
    });
    console.info(`[treino-por-voz] transcricao bytes=${file.size} ms=${Date.now() - t0}`);

    const text = String(r.text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return NextResponse.json({ error: 'Não consegui entender o áudio. Fale mais perto do microfone e tente de novo.' }, { status: 422 });
    }

    return NextResponse.json({ ok: true, text });
  } catch (error: any) {
    console.error('[treino-por-voz/transcrever]', error?.message || error);
    return NextResponse.json({ error: 'Falha ao transcrever o áudio. Tente de novo.' }, { status: 502 });
  }
}
