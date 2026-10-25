// lib/exams.ts
// 🩺 (25 out 2026) EXAMES DO ALUNO (ver prisma/schema/exams.prisma): regras puras e consultas com `db` injetável (para teste).
//
// QUEM VÊ (a regra que o Paulo pediu): o próprio aluno e o profissional (personal/nutri) que ele escolheu ao enviar E que ainda é dele hoje.
// Não há passe livre para o time master: um master só vê exames de aluno que é DELE (coachId/nutritionistId = o próprio master).
// Por isso este arquivo NÃO usa canAccessStudent/canActAsCoach (os dois dão passe livre ao master).
import jwt from 'jsonwebtoken';
import { coachHasFeature } from '@/lib/coachFeatures';
import { MASTER_IDS } from '@/lib/masterIds';

const isMasterId = (id: any) => !!id && MASTER_IDS.includes(String(id));
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';

export const EXAM_TYPES = ['BLOOD', 'BODY', 'PHYSICAL', 'REPORT', 'OTHER'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
export const EXAM_TYPE_LABELS: Record<ExamType, string> = { BLOOD: 'Exame de sangue', BODY: 'Bioimpedância / composição corporal', PHYSICAL: 'Avaliação física', REPORT: 'Laudo ou receita', OTHER: 'Outro documento' };
export const MAX_FILES = 8;                    // páginas (fotos) por envio
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
export const MAX_NOTE = 500;
export const MAX_REPLY = 3000;
export const MAX_PER_DAY = 10;                 // envios por aluno em 24 h (freia abuso)
export const LINK_TTL_SEC = 600;               // o link assinado do arquivo vale 10 minutos
export const STATUS = ['NEW', 'READ', 'ANSWERED'] as const;

const text = (v: any, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
export const isExamType = (v: any): v is ExamType => (EXAM_TYPES as readonly string[]).includes(String(v));

/** Descobre o tipo REAL do arquivo pelos primeiros bytes (não confia no nome nem no tipo que o app diz). */
export function sniffMime(buf: Uint8Array | Buffer | null | undefined): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (!buf || buf.length < 12) return null;
  const b = buf;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';                       // %PDF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';   // RIFF....WEBP
  return null;
}
export const extOf = (mime: string) => (mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg');

/** Os arquivos de um envio: 1 PDF sozinho, OU de 1 a 8 fotos. Tamanhos dentro do limite. Devolve a mensagem para o aluno quando não vale. */
export function validateFiles(files: { mime: string | null; size: number }[]): { ok: true } | { ok: false; error: string } {
  if (!files.length) return { ok: false, error: 'Escolha o PDF ou tire as fotos do exame.' };
  if (files.some((f) => !f.mime)) return { ok: false, error: 'Arquivo não reconhecido. Envie um PDF ou fotos (JPG, PNG).' };
  const pdfs = files.filter((f) => f.mime === 'application/pdf').length;
  if (pdfs && files.length > 1) return { ok: false, error: 'Envie um PDF sozinho, ou várias fotos. Não misture os dois.' };
  if (files.length > MAX_FILES) return { ok: false, error: `No máximo ${MAX_FILES} fotos por envio.` };
  for (const f of files) {
    if (f.size <= 0) return { ok: false, error: 'Um dos arquivos veio vazio.' };
    if (f.mime === 'application/pdf' ? f.size > MAX_PDF_BYTES : f.size > MAX_IMAGE_BYTES) return { ok: false, error: f.mime === 'application/pdf' ? 'O PDF passa de 12 MB. Envie um arquivo menor.' : 'Uma das fotos passa de 8 MB. Tire de novo com menos qualidade.' };
  }
  if (files.reduce((a, f) => a + f.size, 0) > MAX_TOTAL_BYTES) return { ok: false, error: 'O envio passa de 24 MB no total.' };
  return { ok: true };
}

export type RecipientChoice = 'COACH' | 'NUTRI' | 'BOTH';
export interface SubmissionInput { type: ExamType; examDate: Date | null; note: string | null; to: RecipientChoice }

/** Limpa o que o app mandou. `examDate` = dia (AAAA-MM-DD), não pode ser futuro nem de mais de 30 anos atrás. */
export function cleanSubmissionInput(b: any, now: Date = new Date()): { ok: true; value: SubmissionInput } | { ok: false; error: string } {
  const type = String(b?.type || '').toUpperCase();
  if (!isExamType(type)) return { ok: false, error: 'Escolha o tipo do documento.' };
  let examDate: Date | null = null;
  const raw = text(b?.examDate, 10);
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: 'Data do exame inválida.' };
    const d = new Date(`${raw}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'Data do exame inválida.' };
    if (d.getTime() > now.getTime() + 36 * 3600000) return { ok: false, error: 'A data do exame não pode ser no futuro.' };
    if (d.getTime() < now.getTime() - 30 * 365 * 86400000) return { ok: false, error: 'Data do exame muito antiga.' };
    examDate = d;
  }
  const to = String(b?.to || b?.recipients || 'BOTH').toUpperCase();
  return { ok: true, value: { type, examDate, note: text(b?.note, MAX_NOTE) || null, to: to === 'COACH' || to === 'NUTRI' ? to : 'BOTH' } };
}

export interface Pro { id: string; name: string | null; kind: 'COACH' | 'NUTRI' }

/** Os profissionais do aluno que podem receber exame: ligados a ele e COM o recurso `exames` ligado (chave por coach, chave geral ou conta master). */
export async function availableRecipients(db: any, student: { coachId?: string | null; nutritionistId?: string | null }): Promise<Pro[]> {
  const out: Pro[] = [];
  const add = async (id: string | null | undefined, kind: 'COACH' | 'NUTRI') => {
    if (!id || out.some((p) => p.id === id)) return;
    if (!(await coachHasFeature(db, id, 'exames', { isMaster: isMasterId(id) }))) return;
    const u: any = await db.user.findUnique({ where: { id }, select: { id: true, name: true } }).catch(() => null);
    if (u) out.push({ id, name: u.name || null, kind });
  };
  await add(student.coachId, 'COACH');
  await add(student.nutritionistId, 'NUTRI');
  return out;
}

/** Aplica a escolha do aluno (personal / nutri / os dois) sobre os profissionais disponíveis. Vazio = nenhum possível. */
export function pickRecipients(avail: Pro[], to: RecipientChoice): { coachId: string | null; nutritionistId: string | null } {
  const coach = avail.find((p) => p.kind === 'COACH') || null;
  const nutri = avail.find((p) => p.kind === 'NUTRI') || null;
  return { coachId: to === 'NUTRI' ? null : coach?.id || null, nutritionistId: to === 'COACH' ? null : nutri?.id || null };
}

export type Role = 'STUDENT' | 'PRO';
/**
 * Quem é quem diante de UM envio.
 *  - STUDENT: o próprio aluno (ou, no ALUNO TESTE, o coach/master dono dele usando a conta de teste).
 *  - PRO: está entre os escolhidos no envio E ainda é o personal/nutri do aluno hoje (se o aluno trocou de profissional, o antigo perde o acesso).
 *  - null: ninguém mais. Master sem vínculo NÃO entra.
 */
export function examRole(user: { id: string } | null | undefined, sub: { userId: string; coachId?: string | null; nutritionistId?: string | null } | null | undefined, student: { id: string; coachId?: string | null; nutritionistId?: string | null; isTestAccount?: boolean } | null | undefined): Role | null {
  if (!user || !sub || !student) return null;
  if (user.id === sub.userId) return 'STUDENT';
  if (student.isTestAccount === true && (user.id === student.coachId || user.id === student.nutritionistId)) return 'STUDENT';
  const chosen = [sub.coachId, sub.nutritionistId].filter(Boolean);
  const current = [student.coachId, student.nutritionistId].filter(Boolean);
  if (chosen.includes(user.id) && current.includes(user.id)) return 'PRO';
  return null;
}

/** Aluno atuando como ele mesmo (para enviar/listar): ele, ou o dono do ALUNO TESTE. */
export function actsAsExamStudent(user: { id: string } | null | undefined, student: any): boolean {
  if (!user || !student) return false;
  if (user.id === student.id) return true;
  return student.isTestAccount === true && (user.id === student.coachId || user.id === student.nutritionistId);
}

// ───────────────────────── link assinado do arquivo ─────────────────────────
/** Link curto (10 min) para abrir UM arquivo: o app pede ao servidor (já logado) e abre o endereço no leitor de PDF/imagem, que não manda cabeçalho de login. */
export function signFileToken(fileId: string, viewerId: string): string {
  return jwt.sign({ f: fileId, v: viewerId, k: 'exam-file' }, JWT_SECRET, { expiresIn: LINK_TTL_SEC });
}
export function verifyFileToken(token: string | null | undefined, fileId: string): { viewerId: string } | null {
  try {
    if (!token) return null;
    const d: any = jwt.verify(token, JWT_SECRET);
    if (d?.k !== 'exam-file' || d?.f !== fileId || !d?.v) return null;
    return { viewerId: String(d.v) };
  } catch { return null; }
}

// ───────────────────────── apresentação ─────────────────────────
export function summarizeSubmission(s: any, files: any[] = [], replies: { total: number; unread: number } = { total: 0, unread: 0 }) {
  return {
    id: s.id, userId: s.userId, type: s.type, typeLabel: EXAM_TYPE_LABELS[s.type as ExamType] || 'Documento', examDate: s.examDate, note: s.note, status: s.status,
    createdAt: s.createdAt, viewedByPro: !!s.coachViewedAt, pages: files.length, isPdf: files.some((f) => f.mime === 'application/pdf'),
    toCoach: !!s.coachId, toNutri: !!s.nutritionistId, replies: replies.total, unreadReplies: replies.unread,
  };
}

export const FIRST_NAME = (n: any) => String(n || '').trim().split(/\s+/)[0] || '';
export const cleanReply = (b: any): { ok: true; body: string } | { ok: false; error: string } => {
  const body = text(b?.body, MAX_REPLY);
  return body ? { ok: true, body } : { ok: false, error: 'Escreva a resposta.' };
};
