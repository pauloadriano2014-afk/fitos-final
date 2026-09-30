# Avaliação do "montar treino por voz"

Compara modelos de IA (Haiku 4.5, Sonnet 5.5, Gemini 3.8 Flash) no mesmo conjunto de
falas, usando **o mesmo código de produção** (normalizar → casar com a biblioteca → montar
blocos). Só a IA da extração muda entre as colunas. A correção é **programática** (sem IA
julgando IA): o treino inteiro precisa sair idêntico ao esperado.

## Como rodar

```bash
# 1) Teste do teste (grátis, sem internet): gabarito=100%, vazio=0%, erro de API não vira nota
npx tsx scripts/voz-eval/run.ts --check

# 2) Revisar os casos (gera CASOS.md) — leia e corrija o que estiver errado
npx tsx scripts/voz-eval/run.ts --export-cases

# 3) Piloto pago pequeno: 3 casos × 3 modelos. Mede tokens e custo REAIS
export ANTHROPIC_API_KEY=...   # e GEMINI_API_KEY=... para o Gemini
npx tsx scripts/voz-eval/run.ts --limit 3 --yes

# 4) Rodada completa (34 casos × 3 modelos). --reps 3 repete cada caso p/ medir instabilidade
npx tsx scripts/voz-eval/run.ts --yes
npx tsx scripts/voz-eval/run.ts --models claude:claude-haiku-4-5 --reps 3 --yes
```

Sem `--yes` nada pago é chamado: ele só mostra o plano e a estimativa. Os resultados ficam em
`scripts/voz-eval/out/<run>/` (`results.jsonl`, `errors.jsonl`, `resumo.md`), são gravados a
cada caso e a rodada **retoma de onde parou** se cair. Falhas de execução (API fora, timeout)
vão para `errors.jsonl` e nunca viram nota zero.

## Como ler o resultado

- **Acerto total**: o treino inteiro saiu exatamente como esperado. Vem com intervalo de 95%.
  Com 34 casos o intervalo é de ~±12 pontos: só diferenças grandes entre modelos são confiáveis.
- **Exercício / séries / reps / descanso / técnica**: taxa por campo. Se o número de blocos
  diverge, os campos daquele exercício contam como erro (conservador).
- **US$/treino** e **US$/100 treinos**: custo medido pelas contagens de tokens da API.
- Divergências por caso ficam em `resumo.md` para auditar quem errou o quê.

## Histórico de aprovação

- **Casos e resultados esperados (34, `CASOS.md`)**: revisados e aprovados pelo Paulo em 30/09/2026,
  já com o padrão do método 21 = 21 repetições. Se os casos mudarem, revise de novo antes de comparar
  números com rodadas antigas.
- **Rodada paga**: ainda não executada quando este arquivo foi escrito (o ambiente onde o código foi
  escrito não tinha as chaves de API). O primeiro resultado real é o piloto do passo 3.

## Limitações honestas

- Só **1 dos 34 casos é fala real** (a do Paulo, `c31`); os outros 33 foram escritos por Claude
  a partir dos padrões de fala e de exercícios da biblioteca. Somar falas reais deixa a
  avaliação mais confiável (copie um bloco em `cases.ts`).
- O "ideal" de cada caso foi escrito por Claude e conferido linha a linha em `CASOS.md`.
- A biblioteca usada é o snapshot `Exercise.json` (escopo do Paulo), não o banco ao vivo.
- O provedor Gemini usa o mesmo prompt/esquema, mas **não foi testado contra a API real**.
- Custos antes do piloto são **estimativa** (1500 tokens de entrada, 700 de saída por chamada).
- A fala é texto: erros da transcrição (Whisper) não entram aqui.
