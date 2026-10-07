// lib/cupom.ts
// 🎟️ (7 out 2026) CUPOM DE DESCONTO do checkout dos produtos digitais (página de compra do site de membros e página /Produto do app).
//
// Como funciona (o servidor decide tudo; o navegador só mostra o que o servidor devolve):
//   • O comprador digita o código (ou chega por um link com ?cupom=CODIGO). POST /api/produtos/cupom confere e devolve o total novo.
//   • Na compra (POST /api/produtos/comprar) o servidor confere de novo, recalcula o valor e cobra o valor COM desconto na Asaas.
//   • O desconto vale para o pedido inteiro (produto + extras escolhidos). A cobrança nunca fica abaixo de R$ 5,00 (mínimo da Asaas): se o desconto
//     passaria disso, ele é limitado. Percentual vai de 1% a 90%.
//   • Um pedido PENDENTE segura 1 uso por 2 horas; PAGO conta sempre; ESTORNADO devolve o uso para o limite geral (mas continua valendo para o
//     "uma vez por cliente", para não dar para comprar, pedir reembolso e usar de novo).
//   • Todas as funções de conta e de regra são puras (testadas em separado); só contarUsos/carregarCupom falam com o banco.
import { MASTER_IDS } from '@/lib/masterIds';

export const VALOR_MINIMO_COBRANCA = 5;                 // R$ — menor cobrança que a Asaas aceita
export const PERCENTUAL_MAXIMO = 90;
export const VALOR_MAXIMO_FIXO = 5000;                  // R$ — trava de segurança contra erro de digitação no cupom em reais
export const RESERVA_PENDENTE_MS = 2 * 60 * 60 * 1000;  // um pedido pendente segura o uso por 2 horas (o mesmo tempo que o checkout acompanha o pagamento)
export const CODIGO_RE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;
export const MAX_PRODUTOS_POR_CUPOM = 50;
export const MAX_DESCRICAO = 80;

export type CupomTipo = 'PERCENTUAL' | 'VALOR';
export type MotivoCupom = 'NAO_ENCONTRADO' | 'INATIVO' | 'AINDA_NAO' | 'EXPIRADO' | 'OUTRO_PRODUTO' | 'ESGOTADO' | 'JA_USOU' | 'SEM_EFEITO';

export interface CupomRow {
  id: string;
  codigo: string;
  tipo: string;
  valor: number;
  coachId: string;
  produtoIds?: string | null;
  validoDe?: Date | null;
  validoAte?: Date | null;
  usoMaximo?: number | null;
  umaVezPorCliente?: boolean;
  ativo?: boolean;
  descricao?: string | null;
}

export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const brl = (n: number): string => round2(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "verão 10" -> "VERAO10". Só letras (sem acento), números, "-" e "_"; no máximo 30 caracteres. */
export function normalizarCodigo(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
}
export const codigoValido = (c: string): boolean => CODIGO_RE.test(c);

/** Ids de produto do cupom (JSON em texto). Vazio/ruim = [] (todos os produtos do dono). */
export function parseProdutoIds(raw: unknown): string[] {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return Array.from(new Set(arr.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim())));
  } catch { return []; }
}

/**
 * A conta: quanto sai do total e quanto fica para cobrar. `limitado` = o desconto foi cortado para a cobrança não passar a ficar abaixo do mínimo.
 */
export function descontoDe(tipo: string, valor: number, total: number): { desconto: number; final: number; limitado: boolean } {
  const t = round2(total);
  const bruto = tipo === 'PERCENTUAL' ? (t * Number(valor)) / 100 : Number(valor);
  let desconto = Number.isFinite(bruto) ? round2(Math.max(0, bruto)) : 0;
  const maximo = Math.max(0, round2(t - VALOR_MINIMO_COBRANCA));
  const limitado = desconto > maximo;
  if (limitado) desconto = maximo;
  return { desconto, final: round2(t - desconto), limitado };
}

/** "10% de desconto" / "R$ 15,00 de desconto" */
export function descreverCupom(c: { tipo: string; valor: number }): string {
  return c.tipo === 'PERCENTUAL' ? `${String(round2(c.valor)).replace('.', ',')}% de desconto` : `R$ ${brl(c.valor)} de desconto`;
}

/** O cupom vale para este produto? Lista explícita manda; sem lista = produtos do mesmo dono (o time master divide os produtos entre si). */
export function cupomServeProduto(cupom: Pick<CupomRow, 'coachId' | 'produtoIds'>, produto: { id: string; coachId: string }): boolean {
  const ids = parseProdutoIds(cupom.produtoIds);
  if (ids.length > 0) return ids.includes(produto.id);
  if (produto.coachId === cupom.coachId) return true;
  return MASTER_IDS.includes(cupom.coachId) && MASTER_IDS.includes(produto.coachId);
}

const MENSAGEM: Record<MotivoCupom, string> = {
  NAO_ENCONTRADO: 'Cupom inválido. Confira o código.',
  INATIVO: 'Cupom inválido. Confira o código.',
  AINDA_NAO: 'Este cupom ainda não está valendo.',
  EXPIRADO: 'Este cupom expirou.',
  OUTRO_PRODUTO: 'Este cupom não vale para este produto.',
  ESGOTADO: 'Este cupom já atingiu o limite de usos.',
  JA_USOU: 'Você já usou este cupom.',
  SEM_EFEITO: 'Este cupom não reduz o valor deste pedido.',
};
export const mensagemDoMotivo = (m: MotivoCupom): string => MENSAGEM[m];

export type AvaliacaoCupom =
  | { ok: true; desconto: number; final: number; original: number; limitado: boolean }
  | { ok: false; motivo: MotivoCupom; mensagem: string };

const nao = (motivo: MotivoCupom): AvaliacaoCupom => ({ ok: false, motivo, mensagem: MENSAGEM[motivo] });

/**
 * Decide se o cupom vale agora para este pedido e quanto desconta.
 * `usosTotal`: compras que já seguram o cupom (PAGO + pendentes recentes). `usosCliente`: o mesmo, só deste CPF/e-mail (ver contarUsos).
 */
export function avaliarCupom(
  cupom: CupomRow | null | undefined,
  ctx: { now: Date; produto: { id: string; coachId: string }; total: number; usosTotal: number; usosCliente: number },
): AvaliacaoCupom {
  if (!cupom) return nao('NAO_ENCONTRADO');
  if (cupom.ativo === false) return nao('INATIVO');
  const agora = ctx.now.getTime();
  if (cupom.validoDe && agora < new Date(cupom.validoDe).getTime()) return nao('AINDA_NAO');
  if (cupom.validoAte && agora > new Date(cupom.validoAte).getTime()) return nao('EXPIRADO');
  if (!cupomServeProduto(cupom, ctx.produto)) return nao('OUTRO_PRODUTO');
  if (cupom.usoMaximo !== null && cupom.usoMaximo !== undefined && ctx.usosTotal >= cupom.usoMaximo) return nao('ESGOTADO');
  if (cupom.umaVezPorCliente !== false && ctx.usosCliente > 0) return nao('JA_USOU');
  const { desconto, final, limitado } = descontoDe(cupom.tipo, cupom.valor, ctx.total);
  if (desconto <= 0) return nao('SEM_EFEITO');
  return { ok: true, desconto, final, original: round2(ctx.total), limitado };
}

/** Situação para mostrar ao coach na lista de cupons. `usosPagos`: compras já pagas com o cupom. */
export function situacaoDoCupom(c: Pick<CupomRow, 'ativo' | 'validoDe' | 'validoAte' | 'usoMaximo'>, usosPagos: number, now: Date): 'PAUSADO' | 'AGENDADO' | 'EXPIRADO' | 'ESGOTADO' | 'ATIVO' {
  if (c.ativo === false) return 'PAUSADO';
  if (c.validoDe && now.getTime() < new Date(c.validoDe).getTime()) return 'AGENDADO';
  if (c.validoAte && now.getTime() > new Date(c.validoAte).getTime()) return 'EXPIRADO';
  if (c.usoMaximo !== null && c.usoMaximo !== undefined && usosPagos >= c.usoMaximo) return 'ESGOTADO';
  return 'ATIVO';
}

// ───────────── entrada do coach (criar / editar) ─────────────
const BRT = '-03:00';

/** "2026-10-31" (só a data) -> começo ou fim do dia em Brasília; data completa (ISO) vale como veio. */
export function lerData(v: unknown, fim: boolean): Date | null | undefined {
  if (v === null || v === '') return null;
  if (v === undefined) return undefined;
  const s = String(v).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${fim ? '23:59:59.999' : '00:00:00.000'}${BRT}`) : new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface CupomEntrada {
  codigo?: string; tipo?: CupomTipo; valor?: number; descricao?: string | null; produtoIds?: string | null;
  validoDe?: Date | null; validoAte?: Date | null; usoMaximo?: number | null; umaVezPorCliente?: boolean; ativo?: boolean;
}

/**
 * Confere e limpa o que o coach mandou. `parcial` (editar): só valida os campos que vieram. Nunca confia no corpo todo: devolve só campos conhecidos.
 */
export function limparEntradaCupom(body: any, { parcial = false }: { parcial?: boolean } = {}): { ok: true; data: CupomEntrada } | { ok: false; error: string } {
  const b = body && typeof body === 'object' ? body : {};
  const data: CupomEntrada = {};
  const tem = (k: string) => b[k] !== undefined;

  if (!parcial || tem('codigo')) {
    const codigo = normalizarCodigo(b.codigo);
    if (!codigoValido(codigo)) return { ok: false, error: 'Código inválido: use de 3 a 30 letras ou números (pode ter - ou _), sem espaços.' };
    data.codigo = codigo;
  }

  const tipoMudou = !parcial || tem('tipo');
  const valorMudou = !parcial || tem('valor');
  if (tipoMudou) {
    if (b.tipo !== 'PERCENTUAL' && b.tipo !== 'VALOR') return { ok: false, error: 'Escolha o tipo do desconto: porcentagem (%) ou valor em reais (R$).' };
    data.tipo = b.tipo;
  }
  if (valorMudou) {
    const bruto = b.valor;
    const n = typeof bruto === 'number' ? bruto : (bruto === null || bruto === undefined || String(bruto).trim() === '') ? NaN : Number(String(bruto).replace(',', '.'));
    if (!Number.isFinite(n)) return { ok: false, error: 'Informe o valor do desconto.' };
    data.valor = round2(n);
  }
  if (parcial && (tipoMudou !== valorMudou)) return { ok: false, error: 'Para mudar o desconto, envie o tipo e o valor juntos.' };
  if (data.tipo && data.valor !== undefined) {
    if (data.tipo === 'PERCENTUAL' && (data.valor < 1 || data.valor > PERCENTUAL_MAXIMO)) return { ok: false, error: `A porcentagem deve ficar entre 1% e ${PERCENTUAL_MAXIMO}%.` };
    if (data.tipo === 'VALOR' && (data.valor < 0.01 || data.valor > VALOR_MAXIMO_FIXO)) return { ok: false, error: `O desconto em reais deve ficar entre R$ 0,01 e R$ ${brl(VALOR_MAXIMO_FIXO)}.` };
  }

  if (tem('descricao')) {
    const d = b.descricao === null ? '' : String(b.descricao).trim().replace(/\s+/g, ' ');
    if (d.length > MAX_DESCRICAO) return { ok: false, error: `A anotação pode ter até ${MAX_DESCRICAO} caracteres.` };
    data.descricao = d || null;
  }

  if (tem('produtoIds')) {
    const ids = parseProdutoIds(b.produtoIds);
    if (ids.length > MAX_PRODUTOS_POR_CUPOM) return { ok: false, error: `Escolha no máximo ${MAX_PRODUTOS_POR_CUPOM} produtos.` };
    data.produtoIds = ids.length ? JSON.stringify(ids) : null;
  }

  if (tem('validoDe')) { const d = lerData(b.validoDe, false); if (d === undefined) return { ok: false, error: 'Data de início inválida.' }; data.validoDe = d; }
  if (tem('validoAte')) { const d = lerData(b.validoAte, true); if (d === undefined) return { ok: false, error: 'Data de término inválida.' }; data.validoAte = d; }
  if (data.validoDe && data.validoAte && data.validoAte.getTime() <= data.validoDe.getTime()) return { ok: false, error: 'O término precisa ser depois do início.' };

  if (tem('usoMaximo')) {
    if (b.usoMaximo === null || b.usoMaximo === '') data.usoMaximo = null;
    else {
      const n = Number(b.usoMaximo);
      if (!Number.isInteger(n) || n < 1 || n > 1000000) return { ok: false, error: 'O limite de usos deve ser um número inteiro de 1 em diante (ou vazio para sem limite).' };
      data.usoMaximo = n;
    }
  }
  if (tem('umaVezPorCliente')) data.umaVezPorCliente = b.umaVezPorCliente === true;
  if (tem('ativo')) data.ativo = b.ativo === true;
  return { ok: true, data };
}

// ───────────── banco ─────────────
/** Acha o cupom pelo código digitado (qualquer capitalização/espaços). */
export async function carregarCupom(db: any, codigo: unknown): Promise<any | null> {
  const c = normalizarCodigo(codigo);
  if (!codigoValido(c)) return null;
  return db.cupomDesconto.findUnique({ where: { codigo: c } });
}

/**
 * Quantas compras já seguram o cupom. `total`: PAGO + pendentes das últimas 2 horas. `cliente` (só se vier CPF ou e-mail): do mesmo cliente, incluindo
 * ESTORNADO (reembolsou, não ganha de novo).
 */
export async function contarUsos(db: any, cupomId: string, quem: { cpf?: string | null; email?: string | null; now?: Date } = {}): Promise<{ total: number; cliente: number }> {
  const now = quem.now || new Date();
  const desde = new Date(now.getTime() - RESERVA_PENDENTE_MS);
  const pendenteRecente = { status: 'PENDENTE', createdAt: { gte: desde } };
  const total = await db.produtoVenda.count({ where: { cupomId, OR: [{ status: 'PAGO' }, pendenteRecente] } });
  let cliente = 0;
  const quemQuer: any[] = [];
  if (quem.cpf) quemQuer.push({ cpfCliente: String(quem.cpf) });
  if (quem.email) quemQuer.push({ emailCliente: { equals: String(quem.email).trim(), mode: 'insensitive' } });
  if (quemQuer.length) {
    cliente = await db.produtoVenda.count({
      where: { cupomId, AND: [{ OR: [{ status: { in: ['PAGO', 'ESTORNADO'] } }, pendenteRecente] }, { OR: quemQuer }] },
    });
  }
  return { total, cliente };
}
