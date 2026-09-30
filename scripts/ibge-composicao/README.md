# Composição nutricional do IBGE (POF 2008-2009)

Fonte: IBGE, *Pesquisa de Orçamentos Familiares 2008-2009 — Tabelas de Composição Nutricional dos Alimentos Consumidos no Brasil*
(2011, PDF de 351 páginas). Valores **por 100 g de parte comestível**. Vira a aba **"IBGE"** do seletor de alimentos do app.

## O que foi gerado

| arquivo | o que é |
|---|---|
| `prisma/data/ibge/ibge-composicao.json` | **1.429 alimentos/preparações** prontos pro app: kcal, proteína, carboidrato, gordura, fibra, os demais nutrientes (`n`), a fonte de cada valor (`src`) e as medidas caseiras do IBGE (`portions`, as mesmas de `ibge-medidas.json`). 9 alimentos sem energia na tabela (adoçantes e refrigerantes *light*) ficam em `excluidas`. |
| `scripts/ibge-composicao/importar.ts` | Grava no catálogo (`Food`, `source = 'IBGE'`) e nas medidas caseiras (`FoodPortion`, GLOBAL, origem IBGE). Simulação por padrão. |
| `scripts/ibge-composicao/gerador/` | Como o JSON foi gerado a partir do PDF (reproduzível): `1_extrair_pdf.py` e `2_gerar_json.py`. |

O PDF tem 1.971 linhas (alimento × preparo) em 1.121 alimentos. Linhas com os **mesmos valores** (ex.: milho cru/cozido/grelhado/assado)
viram **uma entrada só**, e o rótulo lista os preparos (`Batata-inglesa — frito, alho e óleo`). Conferência na geração: as Tabelas 1 a 4
têm exatamente as mesmas 1.971 linhas, na mesma ordem.

## Como importar

    npx tsx scripts/ibge-composicao/importar.ts             # simulação (não grava)
    npx tsx scripts/ibge-composicao/importar.ts --aplicar   # grava

**Não precisa de `prisma db push`**: usa as tabelas que já existem. A busca, a voz e a IA de dieta só enxergam TACO e os alimentos do time;
os do IBGE só aparecem na aba "IBGE" (`/api/food/search?source=IBGE`). Reexecutar é seguro e nunca sobrescreve medida manual ou de coach/nutri.
Para desfazer: `npx tsx scripts/ibge-composicao/importar.ts --remover --aplicar` (as dietas já salvas guardam os valores e não mudam).

## O que o coach precisa saber (está no aviso da aba)

- **87% dos alimentos da lista vêm da base americana NDSR** (aplicada a um alimento parecido); o resto vem da TACO (7%), rótulos, alimentos regionais e receitas.
  A origem de cada valor aparece sob o nome do alimento.
- Metodologia do IBGE: em **vegetais, legumes, carnes e massas**, as preparações cru/cozido/grelhado/assado/vinagrete usam a composição do alimento
  **cozido**; o **arroz** inclui ~1 ml de óleo de soja; sopas e pratos mistos são estimativas (receitas/combinações 50/50); suco sem açúcar, etc.
- **"-" = sem dado.** Acontece muito com carboidrato de carnes e com proteína/carboidrato de óleos. O app mostra "sem dado: C" na linha e, como a
  dieta precisa de números, o valor entra como **0** (as calorias continuam as da tabela).
- "Tr" (traço) vira 0.
- Os demais nutrientes (sódio, gorduras saturadas, vitaminas, minerais) estão no JSON (`n`) para um próximo passo; ainda não são usados pelo app.

## Como regenerar o JSON a partir do PDF

    cd scripts/ibge-composicao/gerador
    python3 1_extrair_pdf.py caminho/composicao.pdf        # precisa: pip install pymupdf  -> gera ibge_composicao_raw.json
    python3 2_gerar_json.py ibge_composicao_raw.json ../../../prisma/data/ibge/ibge-medidas.json ../../../prisma/data/ibge/ibge-composicao.json

O passo 1 confere que as Tabelas 1 a 4 têm as mesmas linhas (1.971) na mesma ordem. A Tabela 5 (fonte de cada valor) não lista 3 linhas no próprio PDF
(couve-flor frita e duas de carne); essas entradas ficam com "Fonte não informada".
