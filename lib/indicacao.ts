// lib/indicacao.ts
// 🤝 (7 out 2026) INDICAÇÃO "indique um amigo": o aluno tem um código pessoal; quem compra um produto com ele ganha desconto, e o aluno ganha um prêmio
// (um cupom de desconto de 1 uso) quando a compra do amigo é PAGA. Tudo é feito em cima do CUPOM DE DESCONTO (lib/cupom.ts): o código do aluno é um cupom
// com origem "INDICACAO" e o prêmio é um cupom com origem "PREMIO". Assim a conta, os limites, o "uma vez por cliente" e a conferência na compra são os mesmos.
//   • Código do aluno: criado na primeira vez que ele abre "Indique e ganhe" (um por aluno), vale para os produtos do coach dele.
//   • Prêmio: criado pelo webhook de pagamento (uma vez por venda, mesmo se o aviso chegar repetido), válido por 180 dias, 1 uso.
//   • Estorno da compra do amigo: o prêmio ainda não usado é pausado (e volta se a Asaas confirmar que o dinheiro voltou a ser nosso).
//   • Ninguém usa o próprio código: mesmo e-mail ou CPF do dono é recusado (ver AUTO_INDICACAO em lib/cupom.ts).
import crypto from 'crypto';
import { MASTER_IDS } from '@/lib/masterIds';
import { normalizarCodigo } from '@/lib/cupom';

export const PERCENTUAL_AMIGO = 10;          // % de desconto de quem compra com o código
export const PERCENTUAL_PREMIO = 10;         // % de desconto do prêmio de quem indicou
export const VALIDADE_PREMIO_DIAS = 180;
export const ORIGEM_CODIGO = 'INDICACAO';
export const ORIGEM_PREMIO = 'PREMIO';
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O/1/I: ninguém erra ao digitar

/** Sorteia um número de 0 a n-1 (injetável nos testes). */
export type Sorteio = (n: number) => number;
const sorteioPadrao: Sorteio = (n) => crypto.randomInt(0, n);
const sufixo = (tam: number, sorteio: Sorteio) => Array.from({ length: tam }, () => LETRAS[sorteio(LETRAS.length)]).join('');

/** "Ana Souza" -> "ANA" + 4 letras/números sorteados (ex.: ANAK7X2). Sem nome: "AMIGO". */
export function gerarCodigoDoAluno(nome: unknown, sorteio: Sorteio = sorteioPadrao): string {
  const primeiro = normalizarCodigo(String(nome ?? '').trim().split(/\s+/)[0]).replace(/[^A-Z]/g, '').slice(0, 8);
  return `${primeiro || 'AMIGO'}${sufixo(4, sorteio)}`;
}
/** "PREMIO" + 6 sorteados (ex.: PREMIOK7X2QF). */
export const gerarCodigoDoPremio = (sorteio: Sorteio = sorteioPadrao): string => `PREMIO${sufixo(6, sorteio)}`;

/** Donos dos produtos em que o código do aluno vale: o coach dele (o time master divide os produtos entre si). */
export const donosDosProdutos = (coachId: string): string[] => (MASTER_IDS.includes(coachId) ? MASTER_IDS : [coachId]);

const addDias = (d: Date, dias: number) => new Date(d.getTime() + dias * 24 * 3600 * 1000);

/** O código pessoal do aluno (cria na primeira vez). Dois pedidos ao mesmo tempo devolvem o mesmo código. */
export async function obterCodigoDoAluno(db: any, aluno: { id: string; name?: string | null; coachId: string }, sorteio: Sorteio = sorteioPadrao): Promise<any> {
  const achar = () => db.cupomDesconto.findFirst({ where: { origem: ORIGEM_CODIGO, codigoDeId: aluno.id } });
  const existente = await achar();
  if (existente) return existente;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    try {
      return await db.cupomDesconto.create({
        data: {
          codigo: gerarCodigoDoAluno(aluno.name, sorteio), descricao: 'Indicação de aluno', tipo: 'PERCENTUAL', valor: PERCENTUAL_AMIGO, coachId: aluno.coachId,
          origem: ORIGEM_CODIGO, indicadorId: aluno.id, codigoDeId: aluno.id, umaVezPorCliente: true, ativo: true,
        },
      });
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e;
      const jaCriado = await achar();           // o outro pedido ganhou a corrida: usa o dele
      if (jaCriado) return jaCriado;            // senão foi só o sorteio repetido: tenta outro
    }
  }
  throw new Error('Não foi possível gerar o seu código agora. Tente de novo.');
}

/**
 * A compra do amigo foi PAGA: se foi feita com o código de um aluno, cria o prêmio dele (uma vez por venda).
 * `reativado`: o prêmio desta venda já existia e estava pausado por um estorno, e voltou a valer.
 */
export async function criarPremio(db: any, venda: { id: string; cupomId?: string | null }, agora: Date = new Date(), sorteio: Sorteio = sorteioPadrao): Promise<{ criado: boolean; reativado?: boolean; premio?: any; indicadorId?: string }> {
  if (!venda.cupomId) return { criado: false };
  const codigo = await db.cupomDesconto.findUnique({ where: { id: venda.cupomId } });
  if (!codigo || codigo.origem !== ORIGEM_CODIGO || !codigo.indicadorId) return { criado: false };
  const doPremio = () => db.cupomDesconto.findFirst({ where: { origem: ORIGEM_PREMIO, vendaOrigemId: venda.id } });
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    try {
      const premio = await db.cupomDesconto.create({
        data: {
          codigo: gerarCodigoDoPremio(sorteio), descricao: 'Prêmio por indicar um amigo', tipo: 'PERCENTUAL', valor: PERCENTUAL_PREMIO, coachId: codigo.coachId,
          origem: ORIGEM_PREMIO, indicadorId: codigo.indicadorId, vendaOrigemId: venda.id, usoMaximo: 1, umaVezPorCliente: false, ativo: true, validoAte: addDias(agora, VALIDADE_PREMIO_DIAS),
        },
      });
      return { criado: true, premio, indicadorId: codigo.indicadorId };
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e;
      const jaTem = await doPremio();
      if (jaTem) {
        if (jaTem.ativo === false) { await db.cupomDesconto.update({ where: { id: jaTem.id }, data: { ativo: true } }); return { criado: false, reativado: true, premio: jaTem, indicadorId: codigo.indicadorId }; }
        return { criado: false, premio: jaTem, indicadorId: codigo.indicadorId };
      }
    }
  }
  throw new Error('Não foi possível gerar o prêmio da indicação.');
}

/** A compra do amigo foi estornada: o prêmio dela fica pausado (se já foi usado, nada muda). */
export async function pausarPremioDaVenda(db: any, vendaId: string): Promise<number> {
  const r = await db.cupomDesconto.updateMany({ where: { origem: ORIGEM_PREMIO, vendaOrigemId: vendaId }, data: { ativo: false } });
  return r?.count ?? 0;
}

/** Situação do prêmio para mostrar ao aluno. */
export type SituacaoPremio = 'DISPONIVEL' | 'USADO' | 'EXPIRADO' | 'PAUSADO';
export function situacaoDoPremio(p: { ativo?: boolean; validoAte?: Date | string | null; usoMaximo?: number | null }, usosPagos: number, agora: Date): SituacaoPremio {
  if (p.usoMaximo != null && usosPagos >= p.usoMaximo) return 'USADO';
  if (p.ativo === false) return 'PAUSADO';
  if (p.validoAte && agora.getTime() > new Date(p.validoAte).getTime()) return 'EXPIRADO';
  return 'DISPONIVEL';
}

/** Quem é o dono de um código de indicação (e-mail e CPF dele), para recusar o uso do próprio código. Cupom comum: null. */
export async function carregarIndicador(db: any, cupom: { origem?: string | null; indicadorId?: string | null } | null | undefined): Promise<{ email: string | null; cpf: string | null } | null> {
  if (!cupom || cupom.origem !== ORIGEM_CODIGO || !cupom.indicadorId) return null;
  const u = await db.user.findUnique({ where: { id: cupom.indicadorId }, select: { email: true, cpf: true } });
  return u ? { email: u.email ?? null, cpf: u.cpf ?? null } : null;
}
