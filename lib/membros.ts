// lib/membros.ts
// 🔐 (5 out 2026) ÁREA DE MEMBROS (PA ELITE TEAM): login sem senha para quem compra produtos digitais (ver prisma/schema/membros.prisma).
//
// Fluxo:
//   1) Compra paga  -> o webhook cria o membro e manda no e-mail um LINK de acesso (vale 14 dias, uso único)
//   2) Quem perdeu o e-mail pede um CÓDIGO de 6 dígitos pelo site (vale 10 minutos, 5 tentativas)
//   3) Link ou código viram uma SESSÃO (90 dias) que o site guarda no aparelho e manda em `Authorization: Bearer`
// O que o membro tem liberado vem das vendas pagas (ProdutoVenda) pelo e-mail. Tudo aqui recebe o `db` por parâmetro (testável sem banco).
import crypto from 'crypto';
import { lerAbas } from './membrosConteudo';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

// ─── e-mail e segredos ───────────────────────────────────────────────────────
export const normalizeEmail = (v: unknown): string => String(v ?? '').trim().toLowerCase();
export const isValidEmail = (email: string): boolean => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

const secret = () => process.env.MEMBROS_SECRET || process.env.JWT_SECRET || 'membros-sem-segredo';
const mac = (value: string) => crypto.createHmac('sha256', secret()).update(value).digest('hex');
export const hashCodigo = (email: string, codigo: string) => mac(`CODIGO:${email}:${codigo}`);   // com o e-mail: o mesmo código de duas pessoas nunca colide
export const hashLink = (token: string) => mac(`LINK:${token}`);
export const hashSessao = (token: string) => mac(`SESSAO:${token}`);
export const hashRetirada = (token: string) => mac(`RETIRADA:${token}`);
export const gerarCodigo = (): string => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const gerarToken = (): string => crypto.randomBytes(32).toString('hex');
export const iguais = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Endereço do site de membros (sem barra no fim). Vazio = recurso desligado (o e-mail de compra sai como sempre saiu). */
export const membrosBaseUrl = (): string => String(process.env.MEMBROS_URL || '').trim().replace(/\/+$/, '');

// ─── membro ──────────────────────────────────────────────────────────────────
export async function garantirMembro(db: any, p: { email: string; nome?: string | null; telefone?: string | null; origem?: string }) {
  const email = normalizeEmail(p.email);
  const nome = p.nome?.trim() || null;
  const telefone = p.telefone?.trim() || null;
  const existente = await db.membro.findUnique({ where: { email } });
  if (existente) {
    const patch: Record<string, string> = {};
    if (!existente.nome && nome) patch.nome = nome;
    if (!existente.telefone && telefone) patch.telefone = telefone;
    return Object.keys(patch).length ? db.membro.update({ where: { id: existente.id }, data: patch }) : existente;
  }
  try {
    return await db.membro.create({ data: { email, nome, telefone, origem: p.origem || 'COMPRA' } });
  } catch (e) {
    const outro = await db.membro.findUnique({ where: { email } });   // duas compras ao mesmo tempo criaram o mesmo e-mail
    if (outro) return outro;
    throw e;
  }
}

/** Compra paga com este e-mail (sem diferenciar maiúsculas): é o que autoriza criar a conta quando a pessoa pede um código. */
export async function vendaPagaDoEmail(db: any, email: string) {
  return db.produtoVenda.findFirst({ where: { emailCliente: { equals: email, mode: 'insensitive' }, status: 'PAGO' }, orderBy: { createdAt: 'desc' } });
}

/** Primeira compra paga deste e-mail que inclui o produto (principal ou extra): é dela que vem a data para contar as semanas. */
export async function vendaPagaComProduto(db: any, email: string, produtoId: string) {
  const vendas: any[] = await db.produtoVenda.findMany({ where: { emailCliente: { equals: email, mode: 'insensitive' }, status: 'PAGO' }, orderBy: { createdAt: 'asc' } });
  for (const v of vendas) {
    let extras: string[] = [];
    try { const p = v.itensBumpIds ? JSON.parse(v.itensBumpIds) : []; if (Array.isArray(p)) extras = p.map(String); } catch { /* sem extras */ }
    if ([String(v.produtoId), ...extras].includes(produtoId)) return v;
  }
  return null;
}

// ─── código e link ───────────────────────────────────────────────────────────
export async function emitirCodigo(db: any, membro: { id: string; email: string }, now = new Date()): Promise<string> {
  await db.membroCodigo.deleteMany({ where: { membroId: membro.id, tipo: 'CODIGO' } });   // só vale o último pedido
  await db.membroCodigo.deleteMany({ where: { expiraEm: { lt: now } } });                  // limpeza oportunista
  const codigo = gerarCodigo();
  await db.membroCodigo.create({ data: { membroId: membro.id, tipo: 'CODIGO', hash: hashCodigo(membro.email, codigo), expiraEm: new Date(now.getTime() + CODE_TTL_MS) } });
  return codigo;
}

export async function emitirLink(db: any, membro: { id: string }, now = new Date()): Promise<string> {
  const token = gerarToken();
  await db.membroCodigo.create({ data: { membroId: membro.id, tipo: 'LINK', hash: hashLink(token), expiraEm: new Date(now.getTime() + LINK_TTL_MS) } });
  return token;
}

export type Validacao = { ok: true; membro: any } | { ok: false };

export async function validarCodigo(db: any, emailBruto: string, codigoBruto: string, now = new Date()): Promise<Validacao> {
  const email = normalizeEmail(emailBruto);
  const codigo = String(codigoBruto ?? '').replace(/\s+/g, '');
  if (!isValidEmail(email) || !/^\d{6}$/.test(codigo)) return { ok: false };
  const membro = await db.membro.findUnique({ where: { email } });
  if (!membro) return { ok: false };
  const reg = await db.membroCodigo.findFirst({ where: { membroId: membro.id, tipo: 'CODIGO', usadoEm: null, expiraEm: { gt: now } }, orderBy: { createdAt: 'desc' } });
  if (!reg || reg.tentativas >= MAX_CODE_ATTEMPTS) return { ok: false };
  if (!iguais(reg.hash, hashCodigo(email, codigo))) {
    await db.membroCodigo.update({ where: { id: reg.id }, data: { tentativas: { increment: 1 } } });
    return { ok: false };
  }
  const usou = await db.membroCodigo.updateMany({ where: { id: reg.id, usadoEm: null }, data: { usadoEm: now } });   // uso único mesmo com dois toques ao mesmo tempo
  return usou.count === 1 ? { ok: true, membro } : { ok: false };
}

export async function validarLink(db: any, tokenBruto: string, now = new Date()): Promise<Validacao> {
  const token = String(tokenBruto ?? '').trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false };
  const reg = await db.membroCodigo.findUnique({ where: { hash: hashLink(token) } });
  if (!reg || reg.tipo !== 'LINK' || reg.usadoEm || new Date(reg.expiraEm).getTime() <= now.getTime()) return { ok: false };
  const usou = await db.membroCodigo.updateMany({ where: { id: reg.id, usadoEm: null }, data: { usadoEm: now } });
  if (usou.count !== 1) return { ok: false };
  const membro = await db.membro.findUnique({ where: { id: reg.membroId } });
  return membro ? { ok: true, membro } : { ok: false };
}

// ─── sessão ──────────────────────────────────────────────────────────────────
export async function criarSessao(db: any, membro: { id: string }, userAgent?: string | null, now = new Date()) {
  const token = gerarToken();
  const expiraEm = new Date(now.getTime() + SESSION_TTL_MS);
  await db.membroSessao.create({ data: { membroId: membro.id, tokenHash: hashSessao(token), userAgent: userAgent ? String(userAgent).slice(0, 300) : null, expiraEm, ultimoUso: now } });
  await db.membro.update({ where: { id: membro.id }, data: { ultimoAcesso: now } });
  await db.membroSessao.deleteMany({ where: { membroId: membro.id, expiraEm: { lt: now } } });
  return { token, expiraEm };
}

// ─── prévia do treino (sem compra e sem e-mail) ──────────────────────────────
// O painel de produtos gera um link temporário para quem administra o produto ver a página /treino/ exatamente como a cliente vê.
// O token é assinado (não fica no banco): "p1.<produto>.<validade em segundos>.<assinatura>". Vale só para aquele produto, só para ler o programa
// e só por PREVIA_TTL_MS; as marcações feitas na prévia não são gravadas.
export const PREVIA_TTL_MS = 2 * 60 * 60 * 1000;
export const hashPrevia = (value: string) => mac(`PREVIA:${value}`);
export function gerarTokenPrevia(produtoId: string, now = new Date()): string {
  const validade = Math.floor((now.getTime() + PREVIA_TTL_MS) / 1000);
  return `p1.${produtoId}.${validade}.${hashPrevia(`${produtoId}:${validade}`)}`;
}
/** Confere o cabeçalho `Authorization: Bearer p1.…`: devolve o produto da prévia, ou null se não for um token de prévia válido e dentro do prazo. */
export function lerTokenPrevia(authorization: string | null | undefined, now = new Date()): { produtoId: string } | null {
  const m = /^Bearer\s+p1\.([A-Za-z0-9_-]{1,64})\.(\d{9,13})\.([0-9a-f]{64})$/.exec(String(authorization || '').trim());
  if (!m) return null;
  if (!(Number(m[2]) * 1000 > now.getTime())) return null;
  if (!iguais(m[3], hashPrevia(`${m[1]}:${m[2]}`))) return null;
  return { produtoId: m[1] };
}

export const tokenDoCabecalho = (authorization: string | null | undefined): string | null => {
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(String(authorization || '').trim());
  return m ? m[1].toLowerCase() : null;
};

export async function sessaoValida(db: any, token: string | null, now = new Date()) {
  if (!token) return null;
  const sessao = await db.membroSessao.findUnique({ where: { tokenHash: hashSessao(token) } });
  if (!sessao || new Date(sessao.expiraEm).getTime() <= now.getTime()) return null;
  const membro = await db.membro.findUnique({ where: { id: sessao.membroId } });
  if (!membro) return null;
  if (now.getTime() - new Date(sessao.ultimoUso).getTime() > TOUCH_EVERY_MS) {
    await db.membroSessao.update({ where: { id: sessao.id }, data: { ultimoUso: now } }).catch(() => {});
    await db.membro.update({ where: { id: membro.id }, data: { ultimoAcesso: now } }).catch(() => {});
  }
  return { sessao, membro };
}

export async function encerrarSessao(db: any, token: string) {
  await db.membroSessao.deleteMany({ where: { tokenHash: hashSessao(token) } });
}

// ─── o que o membro tem liberado ─────────────────────────────────────────────
export interface ProdutoDoMembro {
  produtoId: string;
  vendaId: string;
  nome: string;
  descricao: string | null;
  capaUrl: string | null;
  comprouEm: string;
  noSite: boolean;              // o produto tem conteúdo aqui no site (abas: treino, guias, hábitos...): abre em /p/?p=<produtoId>
  treinoUrl: string | null;     // link antigo do treino interativo (página de treino do app); fica como reserva
  cursoUrl: string | null;      // curso / módulos
  materialUrl: string | null;   // PDF ou link de entrega que o produto já tinha
}

/** Vendas pagas do e-mail -> produtos (principal + bumps), do mais novo para o mais antigo, sem repetir produto. `appUrl` é onde as páginas atuais de treino e curso abrem. */
export async function produtosDoMembro(db: any, email: string, appUrl: string): Promise<ProdutoDoMembro[]> {
  const vendas: any[] = await db.produtoVenda.findMany({ where: { emailCliente: { equals: email, mode: 'insensitive' }, status: 'PAGO' }, orderBy: { createdAt: 'desc' } });
  if (!vendas.length) return [];

  const idsPorVenda = new Map<string, string[]>();
  const todosIds = new Set<string>();
  for (const v of vendas) {
    let bumps: string[] = [];
    try { const parsed = v.itensBumpIds ? JSON.parse(v.itensBumpIds) : []; if (Array.isArray(parsed)) bumps = parsed.map(String); } catch { /* sem bumps */ }
    const ids = [String(v.produtoId), ...bumps.filter((b) => b !== String(v.produtoId))];
    idsPorVenda.set(v.id, ids);
    ids.forEach((i) => todosIds.add(i));
  }

  const [produtos, treinos, cursos]: any[][] = await Promise.all([
    db.produtoDigital.findMany({ where: { id: { in: [...todosIds] } }, select: { id: true, nome: true, descricao: true, capaUrl: true, linkEntrega: true, treinoAvulsoId: true, membrosAbas: true } }),
    db.produtoTreinoAcesso.findMany({ where: { vendaId: { in: vendas.map((v) => v.id) } }, select: { vendaId: true, produtoId: true, token: true } }),
    db.produtoCursoAcesso.findMany({ where: { vendaId: { in: vendas.map((v) => v.id) } }, select: { vendaId: true, produtoId: true, token: true } }),
  ]);
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const base = String(appUrl || '').replace(/\/+$/, '');

  const out: ProdutoDoMembro[] = [];
  const vistos = new Set<string>();
  for (const v of vendas) {
    for (const pid of idsPorVenda.get(v.id) || []) {
      const p = porId.get(pid);
      if (!p || vistos.has(pid)) continue;
      vistos.add(pid);
      const t = treinos.find((x) => x.vendaId === v.id && x.produtoId === pid);
      const c = cursos.find((x) => x.vendaId === v.id && x.produtoId === pid);
      out.push({
        produtoId: pid, vendaId: v.id, nome: p.nome, descricao: p.descricao ?? null, capaUrl: p.capaUrl ?? null,
        comprouEm: new Date(v.paymentDate || v.createdAt).toISOString(),
        noSite: lerAbas(p.membrosAbas, !!p.treinoAvulsoId).length > 0,
        treinoUrl: t ? `${base}/ProdutoTreino?token=${t.token}` : null,
        cursoUrl: c ? `${base}/ProdutoCurso?token=${c.token}` : null,
        materialUrl: p.linkEntrega || null,
      });
    }
  }
  return out;
}

// ─── e-mails ─────────────────────────────────────────────────────────────────
const fromEmail = () => process.env.MEMBROS_FROM || process.env.RESEND_FROM || 'PA ELITE TEAM <onboarding@resend.dev>';

export async function enviarEmail(p: { to: string; subject: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('[membros][email] RESEND_API_KEY não configurada: e-mail não enviado'); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail(), to: [p.to], subject: p.subject, html: p.html }),
    });
    if (!res.ok) { console.error('[membros][email] Erro do Resend:', res.status, await res.json().catch(() => ({}))); return false; }
    return true;
  } catch (e) {
    console.error('[membros][email] Falha de rede ao enviar:', e);
    return false;
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function emailCodigoHtml(nome: string | null | undefined, codigo: string): string {
  const primeiro = escapeHtml((nome || '').trim().split(/\s+/)[0] || 'Atleta');
  return `
  <div style="background-color:#0a0a0a;padding:40px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background-color:#1E1E1E;border-radius:16px;padding:35px 30px;border:1px solid #333;text-align:center;">
      <h1 style="color:#8B5CF6;font-size:18px;letter-spacing:1px;margin:0 0 6px 0;">PA ELITE TEAM</h1>
      <p style="color:#AAAAAA;font-size:13px;margin:0 0 24px 0;">Área de Membros</p>
      <p style="color:#FFFFFF;font-size:15px;line-height:24px;margin:0 0 18px 0;">Fala, <strong>${primeiro}</strong>! Seu código para entrar:</p>
      <div style="font-size:38px;font-weight:bold;letter-spacing:10px;color:#4DE38F;background:#111;border-radius:12px;padding:18px 0;margin:0 0 18px 0;">${codigo}</div>
      <p style="color:#AAAAAA;font-size:13px;line-height:20px;margin:0;">O código vale por 10 minutos. Se não foi você que pediu, é só ignorar este e-mail.</p>
    </div>
  </div>`;
}

export async function enviarCodigoPorEmail(membro: { email: string; nome?: string | null }, codigo: string): Promise<boolean> {
  return enviarEmail({ to: membro.email, subject: `${codigo} é o seu código de acesso`, html: emailCodigoHtml(membro.nome, codigo) });
}

/** Link de acesso para o e-mail da compra. Sem MEMBROS_URL configurada devolve null e tudo segue como antes. */
export async function criarLinkDeAcesso(db: any, p: { email: string; nome?: string | null; telefone?: string | null }): Promise<string | null> {
  const base = membrosBaseUrl();
  if (!base) return null;
  const membro = await garantirMembro(db, { email: p.email, nome: p.nome, telefone: p.telefone, origem: 'COMPRA' });
  const token = await emitirLink(db, membro);
  return `${base}/?t=${token}`;
}
