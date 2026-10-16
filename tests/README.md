# Testes automáticos do servidor (fitos-final)

Estes testes **não são** links de teste nem teste grátis de coach. São verificações automáticas do código do
servidor: cada arquivo chama a rota ou a regra de verdade, com o banco (Prisma), o login e o Next trocados por
simuladores (sem banco real, sem internet, sem tocar em produção), e confere o resultado.

## Como rodar (PowerShell)

```powershell
npm install            # na raiz do servidor, na primeira vez (as rotas precisam das dependências)
cd tests
npm install            # na primeira vez
npm test               # roda todos (uns 20 segundos)
node run.mjs cupom     # só os que têm "cupom" no nome
node run.mjs --list    # lista os testes
node run.mjs --todos   # inclui os testes em quarentena (veja abaixo)
```

Por padrão o servidor lido é a pasta acima de `tests` (`..`). Para outro lugar: `$env:BACKEND_DIR="C:\caminho\fitos-final"`.

## O que tem aqui

| Pasta/arquivo | Para que serve |
| --- | --- |
| `unit/` | Os testes (`t_*.ts`) e simuladores próprios (`mocks.ts`, `routemocks.ts`, `nextmock*.ts`…) |
| `mocks/` | Simuladores do banco por assunto (`prisma-*.js`), do Next, da OpenAI/Anthropic etc. |
| `builders/` | Cada teste usa um "montador" que diz quais simuladores entram; `manifest.json` liga teste → montador |
| `run.mjs` | O que copia, monta e roda tudo |
| `quarentena.json` | Testes que **já falhavam antes** e ainda não foram investigados |

Esta pasta fica **fora** do build do servidor (`tsconfig.json` ignora `tests`), então não afeta o deploy no Render.

Notas para o Windows: o runner cuida de quebra de linha (CRLF) e de caminhos com `C:\`, e quem falhar ganha uma segunda tentativa, sozinho.

## Quarentena: leia isto

`quarentena.json` lista os testes que falham hoje. Já falhavam **antes** das últimas mudanças e ficam fora do
`npm test` normal só para que o resultado seja claro (verde = nada novo quebrou). **Isso não quer dizer que
estejam certos**: podem ser testes velhos, simuladores desatualizados ou bugs reais ainda não investigados.
Um deles (`t_assistant_more`) só passa na branch `ios-1.1` do servidor, porque a `main` ainda não tem aquelas
perguntas do assistente.

## Limites

- Simuladores não são o banco de verdade: não pegam erro de SQL, de índice, de coluna que falta no Neon
  (por isso o `prisma db push` continua sendo conferido à mão) nem de integração real com Asaas, Expo ou OpenAI.
- Os testes de "mutação" (quebrar o código de propósito para ver se o teste percebe) foram feitos durante o
  desenvolvimento, mas esses scripts **não** foram incluídos aqui.
- Três testes de integridade (`cupom`, `indicação`, `relatório mensal`) usavam cópias antigas do servidor e
  **não foram incluídos**.
