// lib/membrosConteudo.ts
// 📚 (out 2026) ABAS DO PRODUTO NA ÁREA DE MEMBROS. Cada produto digital decide o que a pessoa vê depois de comprar, em abas:
//   treino    o Treino Avulso do produto (montado na tela "Montar treino"), com semanas, vídeos, cargas e cronômetro
//   guia      texto explicativo em seções (aquecimento, cardio, progressão de carga...)
//   habitos   checklist de hábitos por dia, em todas as semanas (alguns marcam sozinhos a partir do treino)
//   diario    diário de cargas: as cargas anotadas no treino, exercício por exercício e semana por semana
//   medidas   ficha de medidas e fotos de evolução (privadas)
//   receitas  livro de receitas com filtros e lista de compras
// ProdutoDigital.membrosAbas guarda a lista (JSON): [{ id, tipo, titulo, modelo?, conteudo?, ativo?, semanas? }]. O conteúdo vem do próprio `conteudo` da aba ou
// de um modelo pronto (lib/membrosModelos.ts, pelo nome em `modelo` ou, na falta dele, pelo `id`). Tudo aqui é tolerante: conteúdo malformado nunca derruba a tela,
// só é ignorado. Nada aqui fala com o banco.
import { MODELOS } from './membrosModelos';
import { linha, paragrafo, lista, numero, minutosDe } from './membrosTexto';

export const TIPOS_ABA = ['treino', 'guia', 'habitos', 'diario', 'medidas', 'receitas'] as const;
export type TipoAba = (typeof TIPOS_ABA)[number];
/** Tipos que só podem aparecer uma vez por produto (os dados da pessoa são guardados por produto, não por aba). */
const UNICOS: TipoAba[] = ['treino', 'habitos', 'diario', 'medidas'];
export const TITULO_PADRAO: Record<TipoAba, string> = { treino: 'Treino', guia: 'Guia', habitos: 'Hábitos', diario: 'Diário de cargas', medidas: 'Medidas e fotos', receitas: 'Receitas' };

export const MAX_ABAS = 12;
export const MAX_CONTEUDO_CHARS = 250_000;
export const SEMANAS_PADRAO = 8;
export const SEMANAS_MAX = 52;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

export interface Aba { id: string; tipo: TipoAba; titulo: string; modelo: string | null; conteudo: any | null; semanas: number | null }

const modeloDe = (nome: unknown): any | null => (typeof nome === 'string' && Object.prototype.hasOwnProperty.call(MODELOS, nome) ? MODELOS[nome] : null);
const inteiro = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : null));

/** Lê o JSON das abas. Sem lista (ou lista vazia) o produto tem só a aba Treino, quando tem treino. `temTreino` = o produto tem um Treino Avulso ligado. */
export function lerAbas(raw: unknown, temTreino: boolean): Aba[] {
  let arr: any = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string' && raw.trim()) { try { arr = JSON.parse(raw); } catch { arr = null; } }
  if (!Array.isArray(arr) || arr.length === 0) return temTreino ? [{ id: 'treino', tipo: 'treino', titulo: TITULO_PADRAO.treino, modelo: null, conteudo: null, semanas: SEMANAS_PADRAO }] : [];

  const out: Aba[] = [];
  const ids = new Set<string>();
  const tiposUnicos = new Set<string>();
  for (const a of arr.slice(0, MAX_ABAS * 2)) {
    if (!a || typeof a !== 'object' || a.ativo === false) continue;
    const tipo = TIPOS_ABA.find((t) => t === a.tipo);
    if (!tipo) continue;
    if ((tipo === 'treino' || tipo === 'diario') && !temTreino) continue;            // sem treino ligado, essas abas não teriam o que mostrar
    if (UNICOS.includes(tipo)) { if (tiposUnicos.has(tipo)) continue; }
    const id = typeof a.id === 'string' && ID_RE.test(a.id) ? a.id : null;
    if (!id || ids.has(id)) continue;
    let conteudo: any = null;
    if (a.conteudo && typeof a.conteudo === 'object' && !Array.isArray(a.conteudo)) { try { if (JSON.stringify(a.conteudo).length <= MAX_CONTEUDO_CHARS) conteudo = a.conteudo; } catch { conteudo = null; } }
    const modelo = typeof a.modelo === 'string' && ID_RE.test(a.modelo) ? a.modelo : null;
    const s = inteiro(a.semanas);
    out.push({ id, tipo, titulo: linha(a.titulo, 30) || TITULO_PADRAO[tipo], modelo, conteudo, semanas: tipo === 'treino' ? (s !== null && s >= 1 && s <= SEMANAS_MAX ? s : SEMANAS_PADRAO) : null });
    ids.add(id);
    if (UNICOS.includes(tipo)) tiposUnicos.add(tipo);
    if (out.length >= MAX_ABAS) break;
  }
  return out;
}

/** Quantas semanas o programa tem (campo `semanas` da aba Treino; 8 se não houver). */
export const semanasDasAbas = (abas: Aba[]): number => abas.find((a) => a.tipo === 'treino')?.semanas || SEMANAS_PADRAO;

/** Valida o que o painel quer gravar em `membrosAbas`: devolve o JSON limpo ou o motivo da recusa. */
export function validarAbas(raw: unknown): { ok: true; json: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0)) return { ok: true, json: null };
  if (!Array.isArray(raw)) return { ok: false, error: 'A lista de abas está em um formato inválido.' };
  if (raw.length > MAX_ABAS) return { ok: false, error: `No máximo ${MAX_ABAS} abas.` };
  const ids = new Set<string>();
  const unicos = new Set<string>();
  for (const a of raw) {
    if (!a || typeof a !== 'object') return { ok: false, error: 'Há uma aba em formato inválido.' };
    const tipo = TIPOS_ABA.find((t) => t === (a as any).tipo);
    if (!tipo) return { ok: false, error: `Tipo de aba desconhecido: ${linha((a as any).tipo, 20)}.` };
    const id = (a as any).id;
    if (typeof id !== 'string' || !ID_RE.test(id)) return { ok: false, error: 'O código da aba deve ter letras minúsculas, números, - ou _ (até 31 caracteres).' };
    if (ids.has(id)) return { ok: false, error: `Código de aba repetido: ${id}.` };
    ids.add(id);
    if (UNICOS.includes(tipo)) { if (unicos.has(tipo)) return { ok: false, error: `A aba "${TITULO_PADRAO[tipo]}" só pode aparecer uma vez.` }; unicos.add(tipo); }
    const modelo = (a as any).modelo;
    if (modelo != null && !modeloDe(modelo)) return { ok: false, error: `Modelo desconhecido: ${linha(modelo, 30)}.` };
    const conteudo = (a as any).conteudo;
    if (conteudo != null) {
      if (typeof conteudo !== 'object' || Array.isArray(conteudo)) return { ok: false, error: `O conteúdo da aba ${id} está em um formato inválido.` };
      if (JSON.stringify(conteudo).length > MAX_CONTEUDO_CHARS) return { ok: false, error: `O conteúdo da aba ${id} é grande demais.` };
      if (tipo !== 'treino' && !limparConteudo(tipo, conteudo)) return { ok: false, error: `O conteúdo da aba ${id} não tem o formato de uma aba "${tipo}".` };
    }
  }
  const json = JSON.stringify(raw.map((a: any) => {
    const o: any = { id: a.id, tipo: a.tipo, titulo: linha(a.titulo, 30) || TITULO_PADRAO[a.tipo as TipoAba] };
    if (a.modelo) o.modelo = a.modelo;
    if (a.conteudo) o.conteudo = a.conteudo;
    if (a.tipo === 'treino') { const s = inteiro(a.semanas); if (s !== null && s >= 1 && s <= SEMANAS_MAX) o.semanas = s; }
    return o;
  }));
  return { ok: true, json };
}

/** Conteúdo da aba, já limpo: o `conteudo` dela ou o modelo (nome em `modelo`, ou o próprio id). null = a aba não tem o que mostrar. */
export function conteudoDaAba(aba: Aba): any | null {
  if (aba.tipo === 'treino') return null;
  // guia e receitas nunca recebem um modelo "por tabela" (um produto novo não herda as receitas de outro); habitos, diario e medidas têm um padrão genérico
  const padrao = aba.tipo === 'habitos' || aba.tipo === 'diario' || aba.tipo === 'medidas' ? modeloDe(aba.tipo) : null;
  const bruto = aba.conteudo ?? modeloDe(aba.modelo ?? aba.id) ?? padrao;
  return bruto ? limparConteudo(aba.tipo, bruto) : null;
}

export function limparConteudo(tipo: TipoAba, c: any): any | null {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  if (tipo === 'guia') return limparGuia(c);
  if (tipo === 'receitas') return limparReceitas(c);
  if (tipo === 'habitos') return limparHabitos(c);
  if (tipo === 'medidas') return limparMedidas(c);
  if (tipo === 'diario') return limparDiario(c);
  return null;
}

// ─── guia ────────────────────────────────────────────────────────────────────
const BLOCOS_TIPOS = ['p', 'ul', 'cards', 'steps', 'destaque', 'tabela'];

function limparBloco(b: any): any | null {
  if (!b || typeof b !== 'object' || !BLOCOS_TIPOS.includes(b.t)) return null;
  const titulo = linha(b.titulo, 100);
  const comTitulo = (o: any) => (titulo ? { ...o, titulo } : o);
  if (b.t === 'p') { const texto = paragrafo(b.texto, 1500); return texto ? { t: 'p', texto } : null; }
  if (b.t === 'destaque') { const texto = paragrafo(b.texto, 800); return texto ? { t: 'destaque', texto } : null; }
  if (b.t === 'ul') { const itens = lista(b.itens, 40, 400); return itens.length ? comTitulo({ t: 'ul', itens }) : null; }
  if (b.t === 'cards') {
    const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 24).map((i: any) => {
      const t = linha(i?.titulo, 100); const texto = paragrafo(i?.texto, 800); const itensLista = lista(i?.lista, 12, 300); const destaque = paragrafo(i?.destaque, 400);
      if (!t && !texto && !itensLista.length) return null;
      const o: any = { titulo: t };
      if (texto) o.texto = texto;
      if (itensLista.length) o.lista = itensLista;
      if (destaque) o.destaque = destaque;
      return o;
    }).filter(Boolean);
    return itens.length ? comTitulo({ t: 'cards', itens }) : null;
  }
  if (b.t === 'steps') {
    const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 12).map((i: any) => {
      const t = linha(i?.titulo, 100); const texto = paragrafo(i?.texto, 800); const foco = lista(i?.foco, 8, 200);
      if (!t && !texto) return null;
      const o: any = { titulo: t };
      if (texto) o.texto = texto;
      if (foco.length) o.foco = foco;
      return o;
    }).filter(Boolean);
    return itens.length ? comTitulo({ t: 'steps', itens }) : null;
  }
  // tabela
  const colunas = lista(b.colunas, 8, 60);
  if (!colunas.length) return null;
  const linhas = (Array.isArray(b.linhas) ? b.linhas : []).slice(0, 40).map((l: any) => (Array.isArray(l) ? l : []).slice(0, colunas.length).map((x: any) => linha(x, 200))).filter((l: string[]) => l.some(Boolean));
  return linhas.length ? comTitulo({ t: 'tabela', colunas, linhas: linhas.map((l: string[]) => colunas.map((_, i) => l[i] || '')) }) : null;
}

export function limparGuia(c: any): any | null {
  const secoes = (Array.isArray(c?.secoes) ? c.secoes : []).slice(0, 30).map((s: any) => {
    const blocos = (Array.isArray(s?.blocos) ? s.blocos : []).slice(0, 40).map(limparBloco).filter(Boolean);
    const titulo = linha(s?.titulo, 120);
    return blocos.length ? { titulo, blocos } : null;
  }).filter(Boolean);
  if (!secoes.length) return null;
  return { titulo: linha(c.titulo, 120), subtitulo: linha(c.subtitulo, 200), secoes };
}

// ─── receitas ────────────────────────────────────────────────────────────────
export const MAX_RECEITAS = 200;

export function limparReceitas(c: any): any | null {
  const brutas = Array.isArray(c?.receitas) ? c.receitas : [];
  const receitas: any[] = [];
  const ids = new Set<string>();
  for (const r of brutas.slice(0, MAX_RECEITAS)) {
    const nome = linha(r?.nome, 120);
    const ingredientes = lista(r?.ingredientes, 40, 200);
    const preparo = lista(r?.preparo, 30, 500);
    if (!nome || (!ingredientes.length && !preparo.length)) continue;
    let id = typeof r?.id === 'string' && ID_RE.test(r.id) ? r.id : `r${receitas.length + 1}`;
    if (ids.has(id)) id = `r${receitas.length + 1}`;
    if (ids.has(id)) continue;
    ids.add(id);
    const tempo = linha(r?.tempo, 40);
    const o: any = {
      id, n: receitas.length + 1, nome, descricao: paragrafo(r?.descricao, 300), categoria: linha(r?.categoria, 40) || 'Receitas', porcao: linha(r?.porcao, 60), tempo,
      tempoMin: minutosDe(tempo), kcal: numero(r?.kcal, 0, 5000), prot: numero(r?.prot, 0, 500), carbo: numero(r?.carbo, 0, 800), gord: numero(r?.gord, 0, 500), ingredientes, preparo,
    };
    const dica = paragrafo(r?.dica, 300);
    if (dica) o.dica = dica;
    receitas.push(o);
  }
  if (!receitas.length) return null;
  const categorias: string[] = [];
  const declaradas = lista(c?.categorias, 12, 40);
  [...declaradas, ...receitas.map((r) => r.categoria)].forEach((cat) => { if (!categorias.includes(cat) && receitas.some((r) => r.categoria === cat)) categorias.push(cat); });
  return { titulo: linha(c.titulo, 120), subtitulo: linha(c.subtitulo, 200), instrucoes: lista(c.instrucoes, 10, 400), categorias, receitas };
}

// ─── hábitos ─────────────────────────────────────────────────────────────────
export const MAX_HABITOS = 12;

export function limparHabitos(c: any): any | null {
  const ids = new Set<string>();
  const habitos: any[] = [];
  for (const h of (Array.isArray(c?.habitos) ? c.habitos : []).slice(0, MAX_HABITOS)) {
    const id = typeof h?.id === 'string' && ID_RE.test(h.id) ? h.id : null;
    const texto = linha(h?.texto, 100);
    if (!id || !texto || ids.has(id)) continue;
    ids.add(id);
    habitos.push(h.auto === 'treino' || h.auto === 'carga' ? { id, texto, auto: h.auto } : { id, texto });
  }
  if (!habitos.length) return null;
  return { titulo: linha(c.titulo, 120), subtitulo: linha(c.subtitulo, 200), instrucoes: lista(c.instrucoes, 10, 400), habitos };
}

// ─── medidas e fotos ─────────────────────────────────────────────────────────
export function limparMedidas(c: any): any | null {
  const listaDe = (v: any, max: number, comUnidade: boolean) => {
    const ids = new Set<string>();
    const out: any[] = [];
    for (const x of (Array.isArray(v) ? v : []).slice(0, max)) {
      const id = typeof x?.id === 'string' && ID_RE.test(x.id) ? x.id : null;
      const rotulo = linha(x?.rotulo, 40);
      if (!id || !rotulo || ids.has(id)) continue;
      ids.add(id);
      out.push(comUnidade ? { id, rotulo, unidade: linha(x?.unidade, 6) } : { id, rotulo });
    }
    return out;
  };
  const campos = listaDe(c?.campos, 20, true);
  const momentos = listaDe(c?.momentos, 6, false);
  const poses = listaDe(c?.poses, 5, false);
  if (!campos.length || !momentos.length) return null;
  return { titulo: linha(c.titulo, 120), subtitulo: linha(c.subtitulo, 200), instrucoes: lista(c.instrucoes, 10, 400), campos, momentos, poses, dica: paragrafo(c.dica, 400) };
}

// ─── diário de cargas ────────────────────────────────────────────────────────
export function limparDiario(c: any): any | null {
  return { titulo: linha(c?.titulo, 120), subtitulo: linha(c?.subtitulo, 200), instrucoes: lista(c?.instrucoes, 10, 400) };
}
