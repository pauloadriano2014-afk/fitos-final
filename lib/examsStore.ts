// lib/examsStore.ts
// 🩺 (25 out 2026) Onde ficam os arquivos dos exames: um bucket PRIVADO do Cloudflare R2 (variável R2_EXAMS_BUCKET). Nunca o bucket público das fotos (`fitos-fotos`):
// exame é dado de saúde e só abre por link assinado de 10 minutos, depois de conferir quem pede (rota /api/exams/file/[fileId]).
// Sem R2_EXAMS_BUCKET configurado o recurso fica indisponível (recusa o envio em vez de cair no bucket público).
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { extOf } from '@/lib/exams';

export interface ExamStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<boolean>;
}

let override: ExamStore | null | undefined;
/** Só para teste: troca o armazenamento por um falso (ou `null` = "não configurado"). `undefined` volta ao real. */
export function __setExamStore(s: ExamStore | null | undefined) { override = s; }

export const examsBucket = () => (process.env.R2_EXAMS_BUCKET || '').trim();
export const examsStoreConfigured = () => override !== undefined ? override !== null : !!examsBucket() && !!(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID);

export function getExamStore(): ExamStore | null {
  if (override !== undefined) return override;
  const bucket = examsBucket();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  if (!bucket || !account) return null;
  let client: any = null;
  const sdk = async () => {
    const mod = await import('@aws-sdk/client-s3');
    if (!client) client = new mod.S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID || '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' } });
    return { mod, client };
  };
  return {
    async put(key, body, contentType) { const { mod, client: c } = await sdk(); await c.send(new mod.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'private, no-store' })); },
    async get(key) {
      const { mod, client: c } = await sdk();
      try { const r: any = await c.send(new mod.GetObjectCommand({ Bucket: bucket, Key: key })); return r?.Body ? Buffer.from(await r.Body.transformToByteArray()) : null; }
      catch (e: any) { if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null; throw e; }
    },
    async remove(key) { const { mod, client: c } = await sdk(); try { await c.send(new mod.DeleteObjectCommand({ Bucket: bucket, Key: key })); return true; } catch (e: any) { console.error('[exams] apagar arquivo:', e?.message || e); return false; } },
  };
}

/** Caminho no bucket: separado por aluno e por envio, com nome sorteado (nada do nome original do arquivo). */
export const examKey = (userId: string, submissionId: string, mime: string) => `exams/${userId}/${submissionId}/${randomUUID()}.${extOf(mime)}`;

/** Apaga TODOS os exames de um aluno (arquivos + linhas). Usado na exclusão da conta e quando o aluno apaga um envio (um só: `onlySubmissionId`). Devolve quantos envios sumiram. */
export async function purgeExams(db: any, userId: string, o: { onlySubmissionId?: string; store?: ExamStore | null } = {}): Promise<number> {
  const store = o.store === undefined ? getExamStore() : o.store;
  const subs: any[] = await db.examSubmission.findMany({ where: { userId, ...(o.onlySubmissionId ? { id: o.onlySubmissionId } : {}) }, select: { id: true } });
  for (const s of subs) {
    const files: any[] = await db.examFile.findMany({ where: { submissionId: s.id }, select: { id: true, key: true } });
    if (store) for (const f of files) await store.remove(f.key);
    await db.examFile.deleteMany({ where: { submissionId: s.id } });
    await db.examReply.deleteMany({ where: { submissionId: s.id } });
    await db.examSubmission.deleteMany({ where: { id: s.id } });
  }
  return subs.length;
}
export { prisma };
