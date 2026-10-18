// lib/masterNotify.ts
// 🔔 (18 out 2026) Avisos para o time master (Paulo e Adri) por notificação no celular/navegador, num lugar só:
//   - coach novo pediu para entrar (rota de cadastro): Paulo E Adri;
//   - coach PAGOU pela 1ª vez, e a vaga de Fundador que ele ocupou (com quantas restam): Paulo E Adri;
//   - e-mail novo no teste fechado do Android (só o Paulo, que é quem vê o relatório): no máximo 1 aviso por dia, e um aviso especial ao bater a meta de 12.
// Nada aqui derruba a rota que chamou: falha de envio só vai para o log. Recebe o `db` (Prisma) e o `send` por parâmetro para testar sem banco nem push de verdade.
import { sendPushToUser } from '@/app/utils/sendNotification';
import { MASTER_EMAILS, MASTER_IDS, PAULO_EMAIL } from '@/lib/masterIds';
import { getPromoState } from '@/lib/launchPromo';
import { testerSummary, TESTER_GOAL } from '@/lib/androidTester';

type Send = (user: any, title: string, body: string, data?: any) => Promise<any>;

/** Manda o aviso aos masters pedidos (por e-mail). Devolve para quantos foi enviado. */
export async function notifyMasters(db: any, title: string, body: string, data: any = {}, emails: string[] = MASTER_EMAILS, send: Send = sendPushToUser as any): Promise<number> {
    let sent = 0;
    for (const email of emails) {
        try {
            const m = await db.user.findUnique({ where: { email }, select: { id: true, pushToken: true, webPushSubscription: true } });
            if (m) { await send(m, title, body, data); sent += 1; }
        } catch (e: any) { console.error('[notifyMasters]', email, e?.message || e); }
    }
    return sent;
}

const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/** Texto do aviso de pagamento do coach. Puro. `founder`: 'FUNDADOR' (vaga que conta nas N), 'EXTRA' (vaga extra de parceiro) ou null. */
export function coachPaidAlert(o: { name?: string | null; planLabel?: string | null; value?: number | null; founder?: 'FUNDADOR' | 'EXTRA' | null; promo?: { max: number; available: number } | null }): { title: string; body: string } {
    const who = (o.name || 'Um coach').trim() || 'Um coach';
    const plan = o.planLabel ? ` o plano ${o.planLabel}` : ' a mensalidade';
    const v = Number(o.value);
    const val = Number.isFinite(v) && v > 0 ? ` (${money(v)})` : '';
    if (o.founder === 'FUNDADOR') {
        const left = o.promo ? (o.promo.available <= 0 ? ' As vagas de Fundador acabaram.' : ` Restam ${o.promo.available} de ${o.promo.max} vagas de Fundador.`) : '';
        return { title: '🏅 Vaga de Fundador ocupada!', body: `${who} pagou${plan}${val}.${left}` };
    }
    if (o.founder === 'EXTRA') return { title: '🤝 Parceiro pagou!', body: `${who} pagou${plan}${val}. Vaga extra de parceiro: não conta nas vagas de Fundador.` };
    return { title: '💰 Coach pagou!', body: `${who} pagou${plan}${val}.` };
}

/**
 * Chamado quando um pagamento de coach é confirmado. Só avisa no 1º pagamento (renovação automática não gera aviso) e nunca para o próprio time master.
 * Devolve true se avisou.
 */
export async function notifyMastersCoachPaid(db: any, coachId: string, o: { firstPayment: boolean; planLabel?: string | null; value?: number | null }, send?: Send): Promise<boolean> {
    try {
        if (!o.firstPayment || MASTER_IDS.includes(coachId)) return false;
        const c = await db.user.findUnique({ where: { id: coachId }, select: { name: true, isLaunchPromo: true, launchPromoExtra: true } });
        const founder: 'FUNDADOR' | 'EXTRA' | null = c?.isLaunchPromo ? (c.launchPromoExtra ? 'EXTRA' : 'FUNDADOR') : null;
        const promo = founder === 'FUNDADOR' ? await getPromoState(db).then((s: any) => ({ max: s.max, available: s.available })).catch(() => null) : null;
        const a = coachPaidAlert({ name: c?.name, planLabel: o.planLabel, value: o.value, founder, promo });
        return (await notifyMasters(db, a.title, a.body, { type: 'coach_paid', coachId }, MASTER_EMAILS, send)) > 0;
    } catch (e: any) { console.error('[notifyMastersCoachPaid]', e?.message || e); return false; }
}

const DAY_MS = 86400000;

/** Texto do aviso do teste do Android. Puro. `goal` = bateu a meta agora. */
export function androidTesterAlert(unique: number, goal: boolean): { title: string; body: string } {
    if (goal) return { title: '🎉 Meta do teste Android batida!', body: `Já são ${unique} e-mails diferentes (meta: ${TESTER_GOAL}). Copie a lista em Ferramentas → TESTADORES ANDROID e cole na Play Console.` };
    const missing = Math.max(0, TESTER_GOAL - unique);
    return { title: '🤖 Novo testador no Android', body: `Chegou e-mail novo no teste. Agora são ${unique} de ${TESTER_GOAL}${missing ? ` (faltam ${missing})` : ''}. (Só aviso 1 vez por dia: veja a lista em Ferramentas → TESTADORES ANDROID.)` };
}

/**
 * Chamado depois que o aluno deixa um e-mail NOVO (ou trocado) no teste do Android. `rows` = todos os cadastros do teste, já com este incluído.
 * Avisa o Paulo: (a) quando a contagem de e-mails diferentes BATE a meta (sempre); (b) senão, só se ninguém mais deixou e-mail nas últimas 24 h (1 aviso por dia).
 * Devolve 'GOAL' | 'DAILY' | null.
 */
export async function notifyAndroidTester(db: any, userId: string, rows: any[], now: Date = new Date(), send?: Send): Promise<'GOAL' | 'DAILY' | null> {
    try {
        const s = testerSummary(rows);
        const before = testerSummary(rows.filter((r) => r.id !== userId));
        const goalNow = s.unique >= TESTER_GOAL && before.unique < TESTER_GOAL;
        const othersToday = rows.some((r) => r.id !== userId && r.androidTesterAt && now.getTime() - new Date(r.androidTesterAt).getTime() < DAY_MS);
        if (!goalNow && othersToday) return null;
        const a = androidTesterAlert(s.unique, goalNow);
        const n = await notifyMasters(db, a.title, a.body, { type: 'android_tester' }, [PAULO_EMAIL], send);
        return n > 0 ? (goalNow ? 'GOAL' : 'DAILY') : null;
    } catch (e: any) { console.error('[notifyAndroidTester]', e?.message || e); return null; }
}
