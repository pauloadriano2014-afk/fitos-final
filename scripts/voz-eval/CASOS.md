# Casos da avaliação — montar treino por voz

34 casos. **Você é quem valida**: leia cada fala e a coluna “como o sistema deve entender”. Se algum estiver errado, ou se faltar um tipo de fala que você usa, me diga o número do caso.

Legenda do esperado: `3x12[DROPSET]/60s` = 3 séries de 12 com drop set e 60 s de descanso. “assumido” = o coach não falou e o sistema completa com o padrão (3 séries, 12 reps, 60 s; GVT = 10×10; método 21 = 21 reps).

| caso | origem | tags | o que testa |
|---|---|---|---|
| c01 | sintético | básico | básico: séries x reps + descanso |
| c02 | sintético | básico, faixa | faixa de repetições ("8 a 10") |
| c03 | sintético | básico, decrescente | repetições diferentes por série (15, 12 e 10) |
| c04 | sintético | básico, formato | formato "NxM" e descanso não dito (deve virar padrão assumido) |
| c05 | sintético | básico, falha | "até a falha" em vez de número |
| c06 | sintético | técnica, drop set | drop set só na última série: separa o último bloco |
| c07 | sintético | técnica, rest pause | rest pause na última com faixa de reps |
| c08 | sintético | técnica, decrescente | reps decrescentes + drop set na última (padrão mais comum do Paulo) |
| c09 | sintético | técnica, grafia | grafias diferentes: "dropset", "rest-pause" |
| c10 | sintético | técnica, descanso por bloco | descanso diferente só na série da técnica |
| c11 | sintético | técnica, correção | o coach se corrige e cancela a técnica |
| c12 | sintético | GVT | só "GVT": o sistema aplica 10x10 |
| c13 | sintético | GVT, flexível | GVT com números do coach (6 por 10) vence o padrão |
| c14 | sintético | GVT, flexível | GVT só com número de séries (8): reps ficam no padrão |
| c15 | sintético | GVT, negativo | NEGATIVO: 10x10 sem falar GVT não pode virar GVT |
| c16 | sintético | GVT, grafia | sigla soletrada pela transcrição ("G V T") |
| c17 | sintético | técnica, bi-set | bi-set junta dois exercícios: um item cada, técnica nos dois |
| c18 | sintético | técnica, tri-set | tri-set com três exercícios numa frase só |
| c19 | sintético | técnica, método 21 | método 21 sem repetições: o padrão é 21 (7+7+7) |
| c20 | sintético | técnica, cluster | cluster set com descanso longo |
| c21 | sintético | técnica, TUT | "tempo sob tensão" por extenso |
| c22 | sintético | descanso, global | um descanso único dito no começo |
| c23 | sintético | descanso, global | um descanso único dito no FIM da frase |
| c24 | sintético | descanso, minuto e meio | descanso por extenso ("um minuto e meio") |
| c25 | sintético | números por extenso | todos os números por extenso |
| c26 | sintético | números por extenso, nome com número | o número do NOME do exercício vem por extenso ("quarenta e cinco") |
| c27 | sintético | ruído | conversa e hesitação misturadas (nome da aluna, "é...") |
| c28 | sintético | correção | o coach corrige o número de séries no meio da frase |
| c29 | sintético | observação | orientação de execução não pode contaminar séries/reps (a observação em si não é corrigida) |
| c30 | sintético | cardio | cardio: o app troca os blocos pelo padrão; só o exercício é corrigido |
| c31 | real | treino completo, real | A FRASE DO PAULO: 4 exercícios, drop set, rest pause, GVT e descansos |
| c32 | sintético | treino completo, peito | dia de peito com 6 exercícios, misturando números e técnicas |
| c33 | sintético | treino completo, costas | dia de costas com 5 exercícios e pegadas no nome |
| c34 | sintético | treino completo, glúteo | dia de glúteo com GVT no meio e descanso global no início |

## c01 — básico: séries x reps + descanso

Origem: **sintético** · tags: básico

Fala (como a transcrição escreveria):

````
Agachamento livre, 3 séries de 12, descanso de 60 segundos.
````

Como o sistema deve entender:

1. Agachamento Livre — 3x12/60s

## c02 — faixa de repetições ("8 a 10")

Origem: **sintético** · tags: básico, faixa

Fala (como a transcrição escreveria):

````
Supino reto com halteres, 4 séries de 8 a 10 repetições, 90 segundos de descanso.
````

Como o sistema deve entender:

1. Supino reto c/halteres — 4x8-10/90s

## c03 — repetições diferentes por série (15, 12 e 10)

Origem: **sintético** · tags: básico, decrescente

Fala (como a transcrição escreveria):

````
Leg press 45, 3 séries de 15, 12 e 10 repetições, descanso de 60 segundos.
````

Como o sistema deve entender:

1. Leg press 45° — 1x15/60s + 1x12/60s + 1x10/60s

## c04 — formato "NxM" e descanso não dito (deve virar padrão assumido)

Origem: **sintético** · tags: básico, formato

Fala (como a transcrição escreveria):

````
Rosca martelo 3x12, elevação lateral com halteres 4x15, tríceps francês 3x12.
````

Como o sistema deve entender:

1. Rosca martelo — 3x12/60s  (assumido: rest)
2. Elevação lateral c/halteres — 4x15/60s  (assumido: rest)
3. Tríceps francês — 3x12/60s  (assumido: rest)

## c05 — "até a falha" em vez de número

Origem: **sintético** · tags: básico, falha

Fala (como a transcrição escreveria):

````
Flexão de braços, 3 séries até a falha, 60 segundos de descanso.
````

Como o sistema deve entender:

1. Flexão de braços — 3xFalha/60s

## c06 — drop set só na última série: separa o último bloco

Origem: **sintético** · tags: técnica, drop set

Fala (como a transcrição escreveria):

````
Cadeira extensora, 3 séries de 12, drop set na última série, 45 segundos de descanso.
````

Como o sistema deve entender:

1. Cadeira Extensora — 2x12/45s + 1x12[DROPSET]/45s

## c07 — rest pause na última com faixa de reps

Origem: **sintético** · tags: técnica, rest pause

Fala (como a transcrição escreveria):

````
Puxada frente aberta, 3 séries de 8 a 10, rest pause na última, descanso de 90 segundos.
````

Como o sistema deve entender:

1. Puxada frente aberta — 2x8-10/90s + 1x8-10[RESTPAUSE]/90s

## c08 — reps decrescentes + drop set na última (padrão mais comum do Paulo)

Origem: **sintético** · tags: técnica, decrescente

Fala (como a transcrição escreveria):

````
Agachamento livre, 3 séries de 15, 12 e 10 repetições, drop set na última série, 60 segundos de descanso.
````

Como o sistema deve entender:

1. Agachamento Livre — 1x15/60s + 1x12/60s + 1x10[DROPSET]/60s

## c09 — grafias diferentes: "dropset", "rest-pause"

Origem: **sintético** · tags: técnica, grafia

Fala (como a transcrição escreveria):

````
Mesa flexora 3 séries de 10, dropset na última. Stiff no Smith 3 séries de 8, rest-pause na última. 60 segundos de descanso em todos.
````

Como o sistema deve entender:

1. Mesa Flexora — 2x10/60s + 1x10[DROPSET]/60s
2. Stiff no Smith — 2x8/60s + 1x8[RESTPAUSE]/60s

## c10 — descanso diferente só na série da técnica

Origem: **sintético** · tags: técnica, descanso por bloco

Fala (como a transcrição escreveria):

````
Puxada frente aberta 3 séries de 10, rest pause na última série com 90 segundos de descanso nessa série. Nas outras, 60 segundos.
````

Como o sistema deve entender:

1. Puxada frente aberta — 2x10/60s + 1x10[RESTPAUSE]/90s

## c11 — o coach se corrige e cancela a técnica

Origem: **sintético** · tags: técnica, correção

Fala (como a transcrição escreveria):

````
Cadeira extensora 3 séries de 12 com drop set na última. Não, tira o drop set, é sem técnica. 60 segundos de descanso.
````

Como o sistema deve entender:

1. Cadeira Extensora — 3x12/60s

## c12 — só "GVT": o sistema aplica 10x10

Origem: **sintético** · tags: GVT

Fala (como a transcrição escreveria):

````
Mesa flexora, método GVT.
````

Como o sistema deve entender:

1. Mesa Flexora — 10x10[GVT]/60s  (assumido: sets, reps, rest)

## c13 — GVT com números do coach (6 por 10) vence o padrão

Origem: **sintético** · tags: GVT, flexível

Fala (como a transcrição escreveria):

````
Cadeira extensora, GVT 6 por 10.
````

Como o sistema deve entender:

1. Cadeira Extensora — 6x10[GVT]/60s  (assumido: rest)

## c14 — GVT só com número de séries (8): reps ficam no padrão

Origem: **sintético** · tags: GVT, flexível

Fala (como a transcrição escreveria):

````
Supino reto com barra, GVT com 8 séries.
````

Como o sistema deve entender:

1. Supino reto c/barra — 8x10[GVT]/60s  (assumido: reps, rest)

## c15 — NEGATIVO: 10x10 sem falar GVT não pode virar GVT

Origem: **sintético** · tags: GVT, negativo

Fala (como a transcrição escreveria):

````
Cadeira adutora, 10 séries de 10 repetições, sem técnica, 60 segundos de descanso.
````

Como o sistema deve entender:

1. Cadeira adutora — 10x10/60s

## c16 — sigla soletrada pela transcrição ("G V T")

Origem: **sintético** · tags: GVT, grafia

Fala (como a transcrição escreveria):

````
Mesa flexora, método G V T.
````

Como o sistema deve entender:

1. Mesa Flexora — 10x10[GVT]/60s  (assumido: sets, reps, rest)

## c17 — bi-set junta dois exercícios: um item cada, técnica nos dois

Origem: **sintético** · tags: técnica, bi-set

Fala (como a transcrição escreveria):

````
Bi-set: rosca direta com barra curvada e tríceps corda na polia, 3 séries de 12 cada, descanso de 60 segundos.
````

Como o sistema deve entender:

1. Rosca direta c/barra curvada — 3x12[BISET]/60s
2. Tríceps corda na polia — 3x12[BISET]/60s

## c18 — tri-set com três exercícios numa frase só

Origem: **sintético** · tags: técnica, tri-set

Fala (como a transcrição escreveria):

````
Tri-set: elevação lateral com halteres, elevação frontal com anilha e posterior de ombros com halteres, 3 séries de 12, descanso de 60 segundos.
````

Como o sistema deve entender:

1. Elevação lateral c/halteres — 3x12[TRISET]/60s
2. Elevação frontal com anilha — 3x12[TRISET]/60s
3. Posterior de ombros c/halteres — 3x12[TRISET]/60s

## c19 — método 21 sem repetições: o padrão é 21 (7+7+7)

Origem: **sintético** · tags: técnica, método 21

Fala (como a transcrição escreveria):

````
Rosca Scott, método 21, 3 séries.
````

Como o sistema deve entender:

1. Rosca Scott — 3x21[21]/60s  (assumido: reps, rest)

## c20 — cluster set com descanso longo

Origem: **sintético** · tags: técnica, cluster

Fala (como a transcrição escreveria):

````
Agachamento no Smith, cluster set, 4 séries de 6 repetições, 120 segundos de descanso.
````

Como o sistema deve entender:

1. Agachamento no Smith — 4x6[CLUSTERSET]/120s

## c21 — "tempo sob tensão" por extenso

Origem: **sintético** · tags: técnica, TUT

Fala (como a transcrição escreveria):

````
Panturrilha no banco, tempo sob tensão, 4 séries de 15, 30 segundos de descanso.
````

Como o sistema deve entender:

1. Panturrilha no banco — 4x15[TUT]/30s

## c22 — um descanso único dito no começo

Origem: **sintético** · tags: descanso, global

Fala (como a transcrição escreveria):

````
Descanso de 60 segundos em todos os exercícios. Stiff no Smith, 3 séries de 10. Afundo no Smith, 3 séries de 12.
````

Como o sistema deve entender:

1. Stiff no Smith — 3x10/60s
2. Afundo no Smith — 3x12/60s

## c23 — um descanso único dito no FIM da frase

Origem: **sintético** · tags: descanso, global

Fala (como a transcrição escreveria):

````
Elevação pélvica máquina 4x10, cadeira abdutora 3x15, cadeira adutora 3x15. Todos com 45 segundos de descanso.
````

Como o sistema deve entender:

1. Elevação pélvica máquina — 4x10/45s
2. Cadeira abdutora — 3x15/45s
3. Cadeira adutora — 3x15/45s

## c24 — descanso por extenso ("um minuto e meio")

Origem: **sintético** · tags: descanso, minuto e meio

Fala (como a transcrição escreveria):

````
Desenvolvimento com halteres, 4 séries de 8, um minuto e meio de descanso.
````

Como o sistema deve entender:

1. Desenvolvimento c/halteres — 4x8/90s

## c25 — todos os números por extenso

Origem: **sintético** · tags: números por extenso

Fala (como a transcrição escreveria):

````
Remada curvada com barra, quatro séries de dez repetições, sessenta segundos de descanso.
````

Como o sistema deve entender:

1. Remada curvada c/barra — 4x10/60s

## c26 — o número do NOME do exercício vem por extenso ("quarenta e cinco")

Origem: **sintético** · tags: números por extenso, nome com número

Fala (como a transcrição escreveria):

````
Leg press quarenta e cinco, 3 séries de 12, dropset na última, 60 segundos.
````

Como o sistema deve entender:

1. Leg press 45° — 2x12/60s + 1x12[DROPSET]/60s

## c27 — conversa e hesitação misturadas (nome da aluna, "é...")

Origem: **sintético** · tags: ruído

Fala (como a transcrição escreveria):

````
Beleza, então pra Maria hoje vamos de perna. Primeiro agachamento livre, 3 séries de 10. Aí depois, é, cadeira extensora, 3 séries de 12. Pronto, é isso.
````

Como o sistema deve entender:

1. Agachamento Livre — 3x10/60s  (assumido: rest)
2. Cadeira Extensora — 3x12/60s  (assumido: rest)

## c28 — o coach corrige o número de séries no meio da frase

Origem: **sintético** · tags: correção

Fala (como a transcrição escreveria):

````
Leg press 45, 4 séries de 12... não, 3 séries de 12, 60 segundos de descanso.
````

Como o sistema deve entender:

1. Leg press 45° — 3x12/60s

## c29 — orientação de execução não pode contaminar séries/reps (a observação em si não é corrigida)

Origem: **sintético** · tags: observação

Fala (como a transcrição escreveria):

````
Agachamento livre, 4 séries de 8, descanso de 90 segundos, descer devagar contando três segundos.
````

Como o sistema deve entender:

1. Agachamento Livre — 4x8/90s

## c30 — cardio: o app troca os blocos pelo padrão; só o exercício é corrigido

Origem: **sintético** · tags: cardio

Fala (como a transcrição escreveria):

````
Correr na esteira, 20 minutos.
````

Como o sistema deve entender:

1. Correr na esteira — 3x12/60s  (assumido: sets, reps, rest)  _(cardio: o app usa os valores padrão de cardio)_

## c31 — A FRASE DO PAULO: 4 exercícios, drop set, rest pause, GVT e descansos

Origem: **real** · tags: treino completo, real

Fala (como a transcrição escreveria):

````
Agachamento livre 3 séries de 15, 12 e 10 repetições com drop set na última série e 60 segundos de descanso entre as séries. Leg press 45 com 3 séries de 8 a 10 repetições, 60 segundos de descanso e rest pause na última série. Búlgaro no Smith com 3 séries de 10 repetições e 60 segundos de descanso. 10 séries de cadeira extensora com o método GVT.
````

Como o sistema deve entender:

1. Agachamento Livre — 1x15/60s + 1x12/60s + 1x10[DROPSET]/60s
2. Leg press 45° — 2x8-10/60s + 1x8-10[RESTPAUSE]/60s
3. Búlgaro no Smith — 3x10/60s
4. Cadeira Extensora — 10x10[GVT]/60s  (assumido: reps, rest)

## c32 — dia de peito com 6 exercícios, misturando números e técnicas

Origem: **sintético** · tags: treino completo, peito

Fala (como a transcrição escreveria):

````
Supino reto com barra 4 séries de 8 a 10, rest pause na última. Supino inclinado com halteres 3 séries de 10. Crucifixo reto com halteres 3 séries de 12. Cross-over polia alta 3 séries de 15, drop set na última. Tríceps corda na polia 4 séries de 12. Tríceps testa com barra H 3 séries de 10. Descanso de 60 segundos em todos.
````

Como o sistema deve entender:

1. Supino reto c/barra — 3x8-10/60s + 1x8-10[RESTPAUSE]/60s
2. Supino inclinado c/halteres — 3x10/60s
3. Crucifixo reto c/halteres — 3x12/60s
4. Cross-over polia alta — 2x15/60s + 1x15[DROPSET]/60s
5. Tríceps corda na polia — 4x12/60s
6. Tríceps testa c/barra H — 3x10/60s

## c33 — dia de costas com 5 exercícios e pegadas no nome

Origem: **sintético** · tags: treino completo, costas

Fala (como a transcrição escreveria):

````
Puxada frente aberta 4x10, com drop set na última. Remada baixa com triângulo 4x10. Serrote 3x12. Puxada com triângulo 3x12. Rosca direta com barra curvada 3x12, 60 segundos de descanso em todos.
````

Como o sistema deve entender:

1. Puxada frente aberta — 3x10/60s + 1x10[DROPSET]/60s
2. Remada baixa c/triângulo — 4x10/60s
3. Serrote — 3x12/60s
4. Puxada c/triângulo — 3x12/60s
5. Rosca direta c/barra curvada — 3x12/60s

## c34 — dia de glúteo com GVT no meio e descanso global no início

Origem: **sintético** · tags: treino completo, glúteo

Fala (como a transcrição escreveria):

````
Descanso de 60 segundos em todos. Elevação pélvica com barra, 4 séries de 10, rest pause na última. Agachamento sumô com halter, 3 séries de 12. Mesa flexora, método GVT. Passada com halteres, 3 séries de 12. Cadeira abdutora, 3 séries de 15, drop set na última.
````

Como o sistema deve entender:

1. Elevação pélvica c/barra — 3x10/60s + 1x10[RESTPAUSE]/60s
2. Agachamento sumô c/halter — 3x12/60s
3. Mesa Flexora — 10x10[GVT]/60s  (assumido: sets, reps)
4. Passada com halteres — 3x12/60s
5. Cadeira abdutora — 2x15/60s + 1x15[DROPSET]/60s
