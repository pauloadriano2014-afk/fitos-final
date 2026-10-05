// lib/workoutShareProgress.ts
// 📈 (5 out 2026) PROGRESSO DO TESTE GRÁTIS. A página pública /t (só nos links `trial`) manda ao servidor o que a pessoa fez: cargas por série, as do treino anterior ("Ant"),
// exercícios marcados e trocas. Fica guardado NO PRÓPRIO LINK (coluna WorkoutShare.progress, JSON por aparelho), e o coach lê um RELATÓRIO montado aqui com os nomes e o plano
// de séries do treino (os mesmos que a pessoa viu). Rota pública = nada de texto livre: só números, códigos de 12 letras/dígitos e horários, tudo validado e com tetos.
import { VID_RE } from '@/lib/workoutShare';

export const MAX_PROGRESS_BODY = 100_000;          // caracteres do corpo
export const MAX_PROGRESS_EXERCISES = 60;
export const MAX_PROGRESS_ENTRIES = 1500;          // valores de carga (atuais + anteriores) por envio
export const MAX_PROGRESS_DEVICES = 3;             // aparelhos/navegadores guardados por link
const KEY_RE = /^[0-9a-f]{12}$/;                   // código do exercício / da troca (hash do servidor)
const FIELD_RE = /^\d{1,2}_\d$/;                   // "<série>_<caixa>", contadas a partir de 0
const VAL_RE = /^\d{1,4}(?:\.\d{1,2})?$/;          // carga em kg: até 4 dígitos e 2 decimais
const MIN_DONE_MS = Date.UTC(2020, 0, 1);

export type LoadMap = Record<string, Record<string, string>>;
export type Snapshot = { loads: LoadMap; prev: LoadMap; done: Record<string, number>; swaps: Record<string, string> };
export type StoredDevice = Snapshot & { at: string };

const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

function cleanLoads(raw: any, budget: { left: number }): LoadMap {
  const out: LoadMap = {};
  if (!isObj(raw)) return out;
  for (const k of Object.keys(raw)) {
    if (Object.keys(out).length >= MAX_PROGRESS_EXERCISES) break;
    if (!KEY_RE.test(k) || !isObj(raw[k])) continue;
    const m: Record<string, string> = {};
    for (const f of Object.keys(raw[k])) {
      if (budget.left <= 0) break;
      const v = raw[k][f];
      if (FIELD_RE.test(f) && typeof v === 'string' && VAL_RE.test(v)) { m[f] = v; budget.left -= 1; }
    }
    if (Object.keys(m).length) out[k] = m;
  }
  return out;
}

function cleanDone(raw: any, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(raw)) return out;
  for (const k of Object.keys(raw)) {
    if (Object.keys(out).length >= MAX_PROGRESS_EXERCISES) break;
    const v = raw[k];
    if (KEY_RE.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= MIN_DONE_MS && v <= now + 24 * 3600 * 1000) out[k] = Math.floor(v);
  }
  return out;
}

function cleanSwaps(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(raw)) return out;
  for (const k of Object.keys(raw)) {
    if (Object.keys(out).length >= MAX_PROGRESS_EXERCISES) break;
    if (KEY_RE.test(k) && typeof raw[k] === 'string' && KEY_RE.test(raw[k])) out[k] = raw[k];
  }
  return out;
}

/** Corpo do envio da página: { vid, loads, prev, done, swaps }. Só o `vid` é obrigatório; o resto que vier torto é descartado (a página só manda o que ela mesma validou). */
export function parseProgressBody(body: any, now: number = Date.now()): { ok: true; vid: string; value: Snapshot } | { ok: false; error: string } {
  if (!isObj(body)) return { ok: false, error: 'Corpo inválido.' };
  if (typeof body.vid !== 'string' || !VID_RE.test(body.vid)) return { ok: false, error: 'vid inválido.' };
  const budget = { left: MAX_PROGRESS_ENTRIES };
  const loads = cleanLoads(body.loads, budget);
  const prev = cleanLoads(body.prev, budget);
  return { ok: true, vid: body.vid, value: { loads, prev, done: cleanDone(body.done, now), swaps: cleanSwaps(body.swaps) } };
}

/** Lê a coluna `progress` (JSON) com tolerância: qualquer coisa fora do formato é ignorada. */
export function parseStored(raw: unknown): Record<string, StoredDevice> {
  const out: Record<string, StoredDevice> = {};
  let o: any = null;
  try { o = typeof raw === 'string' && raw ? JSON.parse(raw) : null; } catch { o = null; }
  if (!isObj(o)) return out;
  const now = Date.now();
  Object.keys(o).forEach((vid) => {
    const d = o[vid];
    if (!VID_RE.test(vid) || !isObj(d) || typeof d.at !== 'string' || Number.isNaN(new Date(d.at).getTime())) return;
    const budget = { left: MAX_PROGRESS_ENTRIES };
    out[vid] = { at: new Date(d.at).toISOString(), loads: cleanLoads(d.loads, budget), prev: cleanLoads(d.prev, budget), done: cleanDone(d.done, now), swaps: cleanSwaps(d.swaps) };
  });
  return out;
}

/** Guarda o envio deste aparelho (substitui o anterior do mesmo `vid`) e mantém só os MAX_PROGRESS_DEVICES mais recentes. Devolve o JSON para a coluna. */
export function mergeProgress(raw: unknown, vid: string, value: Snapshot, now: Date = new Date()): { json: string; devices: number } {
  const map = parseStored(raw);
  map[vid] = { at: now.toISOString(), ...value };
  const keep = Object.keys(map).sort((a, b) => new Date(map[b].at).getTime() - new Date(map[a].at).getTime()).slice(0, MAX_PROGRESS_DEVICES);
  const out: Record<string, StoredDevice> = {};
  keep.forEach((k) => { out[k] = map[k]; });
  return { json: JSON.stringify(out), devices: keep.length };
}

// ─────────────────────────── relatório do coach ───────────────────────────
const LETTER_KEY = /^(?:treino\s*)?[A-Za-z]$/i;
/** Nome do treino como na página: "TREINO 1 - Peito" (o nome do dia, se o coach deu um; senão os grupos musculares). */
export function dayTitle(day: { day?: any; focus?: any }, index: number): string {
  const key = String(day && day.day != null ? day.day : '').trim();
  const name = key && !LETTER_KEY.test(key) ? key.slice(0, 60) : (day && typeof day.focus === 'string' ? day.focus.trim().slice(0, 60) : '');
  return `TREINO ${index + 1}${name ? ` - ${name}` : ''}`;
}

/** Repetições numéricas do texto do plano ("10 reps" / "8-10 reps" -> 10 / 8). Texto livre ("30s", "Falha") não tem como virar volume: null. */
export function repsNumber(reps: unknown): number | null {
  const m = String(reps == null ? '' : reps).trim().match(/^(\d{1,3})(?:\s*[-–/]\s*\d{1,3})*\s*reps$/i);
  return m ? parseInt(m[1], 10) : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string | null | undefined) => (v ? parseFloat(v) : NaN);

export type ReportInput = {
  payload: any;                                                    // saída de loadSharePayload (buildPublicWorkout)
  stored: Record<string, StoredDevice>;
  dones: { day: string; createdAt: Date | string }[];
  share: { code: string; trial?: boolean | null; displayName?: string | null; showName?: boolean | null; expiresAt?: Date | string | null; revokedAt?: Date | string | null; status?: string; viewCount?: number | null; lastViewedAt?: Date | string | null; doneCount?: number | null; lastDoneAt?: Date | string | null; createdAt?: Date | string | null };
};
const iso = (d: any) => (d ? new Date(d).toISOString() : null);

export function buildProgressReport(input: ReportInput) {
  const { payload, stored, dones, share } = input;
  const vids = Object.keys(stored).sort((a, b) => new Date(stored[b].at).getTime() - new Date(stored[a].at).getTime());
  const snap: StoredDevice | null = vids.length ? stored[vids[0]] : null;      // o aparelho que enviou por último
  const days = (Array.isArray(payload?.days) ? payload.days : []).map((day: any, di: number) => {
    const label = dayTitle(day, di);
    const exercises: any[] = [];
    (day.sections || []).forEach((sec: any) => (sec.items || []).forEach((it: any) => {
      const key: string = it.key;
      const swapKey = snap ? snap.swaps[key] : undefined;
      const sw = swapKey ? (Array.isArray(it.swaps) ? it.swaps : []).find((x: any) => x.key === swapKey) : null;
      const cur = (snap && snap.loads[key]) || {};
      const prv = (snap && snap.prev[key]) || {};
      const plan: any[] = Array.isArray(it.setPlan) ? it.setPlan : [];
      let topCur: number | null = null; let topPrev: number | null = null; let volCur = 0; let volPrev = 0; let setsLogged = 0;
      const sets = plan.map((p: any, si: number) => {
        const labels: string[] = Array.isArray(p.loads) ? p.loads : ['CARGA'];
        const c = labels.map((_, fi) => cur[`${si}_${fi}`] || null);
        const pv = labels.map((_, fi) => prv[`${si}_${fi}`] || null);
        const reps = repsNumber(p.reps);
        if (c[0]) { const n = num(c[0]); topCur = topCur == null ? n : Math.max(topCur, n); if (reps) volCur += reps * n; }
        if (pv[0]) { const n = num(pv[0]); topPrev = topPrev == null ? n : Math.max(topPrev, n); if (reps) volPrev += reps * n; }
        if (c.some(Boolean)) setsLogged += 1;
        return { n: si + 1, reps: p.reps || '', tech: p.tech || null, labels, cur: c, prev: pv };
      });
      exercises.push({
        key, name: sw ? sw.name : it.name, swapped: !!sw, section: sec.key, done: !!(snap && snap.done[key]), doneAt: snap && snap.done[key] ? new Date(snap.done[key]).toISOString() : null,
        sets, setsLogged,
        topCur, topPrev, delta: topCur != null && topPrev != null ? round2(topCur - topPrev) : null,
        volumeCur: round2(volCur), volumePrev: round2(volPrev),
      });
    }));
    const dayDones = dones.filter((d) => String(d.day) === String(day.day)).map((d) => iso(d.createdAt) as string);
    const loaded = exercises.filter((e) => e.sets.length);
    return {
      day: String(day.day), label, focus: day.focus || null,
      doneAt: dayDones.length ? dayDones[0] : null,
      exercisesDone: exercises.filter((e) => e.done).length, exercisesTotal: exercises.length,
      setsLogged: loaded.reduce((n, e) => n + e.setsLogged, 0),
      volumeCur: round2(loaded.reduce((n, e) => n + e.volumeCur, 0)), volumePrev: round2(loaded.reduce((n, e) => n + e.volumePrev, 0)),
      exercises,
    };
  });
  const totals = {
    daysDone: days.filter((d: any) => d.doneAt).length, daysTotal: days.length,
    exercisesDone: days.reduce((n: number, d: any) => n + d.exercisesDone, 0), exercisesTotal: days.reduce((n: number, d: any) => n + d.exercisesTotal, 0),
    setsLogged: days.reduce((n: number, d: any) => n + d.setsLogged, 0),
  };
  return {
    workout: payload?.workout?.name || 'Treino',
    access: {
      code: share.code, trial: !!share.trial, name: share.showName ? (share.displayName || null) : null, status: share.status || null,
      createdAt: iso(share.createdAt), expiresAt: iso(share.expiresAt), viewCount: share.viewCount || 0, lastViewedAt: iso(share.lastViewedAt),
      doneCount: share.doneCount || 0, lastDoneAt: iso(share.lastDoneAt),
    },
    progress: snap ? { updatedAt: snap.at, devices: vids.length } : null,
    dones: dones.map((d) => ({ day: String(d.day), at: iso(d.createdAt) as string })),
    totals,
    days,
  };
}
