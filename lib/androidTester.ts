// lib/androidTester.ts
// 🤖 Teste fechado do app Android (Google Play): o aluno deixa o e-mail da conta Google dele e o master copia a lista para a Play Console (precisa de 12 testadores).
// Regras puras (sem banco): validar/normalizar o e-mail e montar o resumo do relatório. O app tem a mesma validação em src/utils/androidTester.js (os dois são testados).

export const TESTER_GOAL = 12;

const GOOGLE_DOMAINS = ['gmail.com', 'googlemail.com'];
const EMAIL_RE = /^[a-z0-9][a-z0-9._%+'-]*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export type TesterEmail = { ok: true; email: string; google: boolean } | { ok: false; error: string };

/** Limpa (espaços, maiúsculas) e confere o e-mail. `google` = é Gmail (o jeito normal de ter conta Google); outros domínios são aceitos, o app só avisa. */
export function normalizeTesterEmail(raw: unknown): TesterEmail {
    if (typeof raw !== 'string') return { ok: false, error: 'Informe o seu e-mail.' };
    const email = raw.trim().toLowerCase();
    if (!email) return { ok: false, error: 'Informe o seu e-mail.' };
    if (email.length > 254 || email.split('@')[0].length > 64) return { ok: false, error: 'Esse e-mail é grande demais.' };
    if (/\s/.test(email) || email.includes('..') || !EMAIL_RE.test(email)) return { ok: false, error: 'Esse e-mail não parece válido. Confira e tente de novo.' };
    return { ok: true, email, google: GOOGLE_DOMAINS.includes(email.split('@')[1]) };
}

export type TesterRow = { androidTesterEmail: string | null; androidTesterAddedAt: Date | string | null };

/** Resumo do relatório: total de pessoas, e-mails diferentes (o Google só conta cada e-mail uma vez), quantos já estão na Play e quantos faltam para a meta. */
export function testerSummary(rows: TesterRow[], goal = TESTER_GOAL) {
    const list = (rows || []).filter((r) => r && r.androidTesterEmail);
    const uniq = new Set(list.map((r) => String(r.androidTesterEmail).toLowerCase()));
    const added = new Set(list.filter((r) => r.androidTesterAddedAt).map((r) => String(r.androidTesterEmail).toLowerCase()));
    return { goal, people: list.length, unique: uniq.size, added: added.size, pending: uniq.size - [...uniq].filter((e) => added.has(e)).length, missing: Math.max(0, goal - uniq.size) };
}
