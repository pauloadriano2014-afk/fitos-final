// app/api/coach-notes/transcrever/route.ts
// 🎙️ NOTAS POR VOZ -- passo 1: áudio -> texto (Whisper). O áudio NÃO é gravado em lugar nenhum. O Whisper recebe os PRIMEIROS NOMES dos alunos do coach como dica (erra muito menos nome próprio).
//   POST multipart { file } -> { ok, text }
import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { firstName } from '@/lib/agenda';
import { loadCoachStudents, requireNotesCoach } from '@/lib/coachNotesStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['m4a', 'mp4', 'mp3', 'wav', 'webm', 'ogg', 'aac', 'mpeg', 'mpga'];
const BASE_HINT = 'Anotação de um coach sobre um aluno. Dor nas costas, no joelho, no ombro, na lombar. Agachamento no Smith, leg press 45, supino, remada, rosca, stiff, elevação pélvica. Treino, dieta, aparelho, check-in, Roacutan, whey, creatina. Alunos: ';

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
    const auth = await requireNotesCoach(req);
    if ('response' in auth) return auth.response;
    const rl = checkRateLimit(`nota-transcrever:${auth.user.id}`, { max: 60, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitas gravações seguidas. Aguarde um pouco.' }, { status: 429 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Transcrição indisponível (chave não configurada no servidor).' }, { status: 503 });

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file || typeof (file as any).arrayBuffer !== 'function') return NextResponse.json({ error: 'Nenhum áudio recebido.' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: 'O áudio veio vazio. Tente gravar de novo.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Áudio muito grande. Grave até 1 minuto por vez.' }, { status: 413 });
    const ext = extFrom(file.name || '', file.type || '');
    if (!ext) return NextResponse.json({ error: 'Formato de áudio não suportado.' }, { status: 415 });

    let names = '';
    try {
      const students = await loadCoachStudents(prisma, auth.user.id);
      names = [...new Set(students.map((s) => firstName(s.name)).filter(Boolean))].slice(0, 120).join(', ');
    } catch { /* sem a lista: segue só com o vocabulário */ }

    const openai = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
    const upload = await toFile(Buffer.from(await file.arrayBuffer()), `nota.${ext}`, { type: file.type || undefined });
    const t0 = Date.now();
    const r = await openai.audio.transcriptions.create({ file: upload, model: 'whisper-1', language: 'pt', prompt: (BASE_HINT + names).slice(0, 900), temperature: 0 });
    console.info(`[nota-voz] transcricao bytes=${file.size} ms=${Date.now() - t0}`);
    const text = String(r.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return NextResponse.json({ error: 'Não consegui entender o áudio. Fale mais perto do microfone e tente de novo.' }, { status: 422 });
    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    console.error('[nota-voz/transcrever]', e?.message || e);
    return NextResponse.json({ error: 'Falha ao transcrever o áudio. Tente de novo.' }, { status: 502 });
  }
}
