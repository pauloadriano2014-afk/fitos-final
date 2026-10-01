// lib/weeklyWhatsApp.ts
// 💬 (1 out 2026) "Reforço" pelo WhatsApp: quando o aluno não responde o feedback no app, o coach toca num botão e abre o WhatsApp dele já com
// uma mensagem pronta -- saudação + o MESMO questionário da semana (com as perguntas personalizadas) -- pro aluno responder por lá.
// Mesmo formato do mini-questionário que a equipe já mandava ("💜 FEEDBACK DA SEMANA — PA ELITE"). Funções puras.
import type { Question } from '@/lib/weeklyFeedback';

const squash = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const firstName = (full?: string | null) => {
  const t = squash(full).split(' ')[0] || '';
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'tudo bem';
};

/**
 * Celular do cadastro -> só dígitos com o 55 do Brasil (ou null se não parece um celular).
 * Atenção: "55" também é DDD (RS); por isso só considera que já tem país quando passa de 11 dígitos.
 */
export function normalizeBrPhone(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length < 10 || d.length > 13) return null;
  if (d.length <= 11) return `55${d}`;
  return d.startsWith('55') ? d : null;
}

export function buildWhatsAppText(o: { name?: string | null; weekLabel: string; intro?: string | null; questions: Question[] }): string {
  const lines: string[] = [];
  lines.push(`Oi, ${firstName(o.name)}! Tudo bem? 💜`, '');
  lines.push(`Passando para saber como foi a sua semana (${o.weekLabel}). Como ainda não vi o seu feedback no app, deixo aqui para você responder por aqui mesmo, rapidinho:`, '');
  lines.push('💜 FEEDBACK DA SEMANA — PA ELITE');
  if (o.intro) lines.push('', squash(o.intro));
  lines.push('');
  o.questions.forEach((q, i) => {
    lines.push(`${i + 1}) ${squash(q.label)}`);
    if (q.hint) lines.push(`   ${cut(squash(q.hint), 160)}`);
    if (q.kind === 'choice' && q.options?.length) lines.push(`   ➜ ${q.options.map((x) => x.label).join(' / ')}`);
    else if (q.kind === 'scale') lines.push(`   ➜ nota de ${q.min ?? 0} a ${q.max ?? 10}`);
    lines.push('');
  });
  lines.push('Pode responder com o número de cada pergunta, tá? 😉', 'E não esquece de registrar suas cargas no app. 📲');
  return lines.join('\n');
}
