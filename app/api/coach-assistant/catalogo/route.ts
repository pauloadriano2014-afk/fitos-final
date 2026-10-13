// app/api/coach-assistant/catalogo/route.ts
// 🧭 GET ?ios=1 -> { ok, master, voice, categories: [{ id, label, icon, buttons: [{ key, label, intent, params?, icon }] }] }
// Os botões das PERGUNTAS RÁPIDAS por categoria (lib/assistantCatalog.ts). Quem decide o que aparece é o servidor: "Coaches" só para o time master; `ios=1` tira as finanças (Apple 3.1.1).
// Qualquer coach ativo. Não consulta o banco (só a conta de quem chama).
import { NextResponse } from 'next/server';
import { requireActiveCoach } from '@/lib/coachNotesStore';
import { catalogFor } from '@/lib/assistantCatalog';
import { isMasterCoachId } from '@/lib/coachAssistant';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireActiveCoach(req);
  if ('response' in auth) return auth.response;
  const url = new URL(req.url);
  const ios = url.searchParams.get('ios') === '1';
  const master = isMasterCoachId(auth.user.id);
  return NextResponse.json({ ok: true, master, voice: master, categories: catalogFor({ master, ios }) });   // voice: voz natural liberada (só o time master)
}
