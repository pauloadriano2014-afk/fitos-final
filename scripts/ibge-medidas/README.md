# Medidas caseiras do IBGE (POF 2008-2009)

Fonte: IBGE, *Pesquisa de Orçamentos Familiares 2008-2009 — Tabela de Medidas Referidas para os
Alimentos Consumidos no Brasil* (PDF `liv50000.pdf`, 545 páginas). Foram lidas **11.801 linhas**
(1.119 alimentos, 15 preparos, 103 tipos de medida) sem nenhuma falha de leitura; códigos de
preparo e de medida conferidos contra os quadros oficiais do próprio PDF.

## O que foi gerado

| arquivo | o que é |
|---|---|
| `prisma/data/ibge/revisao-ibge.csv` | **A planilha para você conferir.** 399 linhas: 112 alimentos do time master + 287 do TACO. Cada linha diz qual alimento/preparo do IBGE foi usado e o peso (g) de cada medida. |
| `prisma/data/ibge/sem-correspondencia.csv` | 330 alimentos para os quais não há equivalente confiável (suplementos, sem IBGE, preparo diferente...). |
| `prisma/data/ibge/ibge-medidas.json` | O IBGE inteiro já traduzido para as medidas do app (987 alimentos). Base para futuras sugestões. |
| `scripts/ibge-medidas/importar.ts` | Grava a planilha no banco (com simulação antes). |
| `scripts/ibge-medidas/gerador/` | Como a planilha foi gerada (reproduzível a partir do PDF). |

## Como ler a planilha

- `confianca = ALTA` → nome e preparo batem; `aplicar` já vem **SIM**. `MEDIA` → sugestão a conferir; `aplicar` vem vazio.
- Para aprovar uma linha, escreva **SIM** em `aplicar`. Para reprovar, apague o SIM. Pode **corrigir os números** (12,5 ou 12.5). Também dá para editar no Google Sheets/Excel (`Medidas-IBGE-revisao.xlsx`) e exportar de volta como CSV — o importador aceita `;` e `,`.
- `conflito_com_o_app` → onde o valor que o app já usava difere mais de 15% do IBGE. **O valor do app continua valendo**
  (ordem de precedência: ajuste do coach > medida manual > tabela antiga do app > IBGE); o IBGE só preenche o que falta.

## Como importar

    npx prisma db push                                   # 1x: cria as tabelas novas (4 no total)
    npx tsx scripts/ibge-medidas/importar.ts             # simulação (não grava)
    npx tsx scripts/ibge-medidas/importar.ts --aplicar   # grava

Seguro para repetir: só atualiza o que veio do IBGE e **nunca** sobrescreve medida manual ou de coach/nutri.

## Decisões tomadas (para você revisar)

- **Bife P/M/G** — o IBGE tem *bife (médio) = 100 g* para carne bovina e *unidade grande = 150 g* (bisteca/costela).
  Pequeno não existe na tabela, mas a metodologia dele diz "pequena = 75% da média": bife P = 75 g. Aves: filé médio 100 g;
  peixe: filé médio 120 g (P = 75% → 90 g, que bate com o "filé pequeno" do próprio IBGE). G só existe para bovina.
- **Colher de servir** (nova medida): é a "colher de arroz/servir" do IBGE, a mais citada para arroz e feijão.
- Ficaram **de fora**: "porção" (varia demais), copo/xícara de café/prato/tigela/pires (medidas de recipiente, não do alimento).
- Cru e cozido **nunca** são misturados (um preparo que o IBGE não tem = sem correspondência).
- Vegetais cujo nome não diz cru/cozido entram como `MEDIA` (só sugestão).
