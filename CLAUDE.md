# Regras fixas deste projeto (backend `fitos-final`)

Quem trabalha aqui: Paulo (dono do ELITE FIT). Responder sempre em português simples, sem jargão. Comandos sempre para **PowerShell**.

## 1) Banco de dados: sempre entregar os comandos do Prisma (regra do Paulo)
O Render **não** roda `prisma db push` (o build dele é só `prisma generate` + `next build`). Por isso, **toda vez que uma tarefa mexer no banco** (qualquer alteração em `prisma/schema/*.prisma`: coluna, tabela, índice, enum), a resposta final **tem que trazer o bloco de comandos**, nesta ordem, antes de qualquer merge/deploy:

```powershell
npx prisma generate
npx prisma db push
```

- O `db push` vem **antes** de publicar o código no `main`. Código novo que lê coluna que ainda não existe derruba login e cadastro.
- Explicar em uma frase o que o push faz ("adiciona 2 colunas opcionais, nada é apagado"). Se for destrutivo (apagar coluna/tabela, mudar tipo), avisar em destaque e **nunca** sugerir `--accept-data-loss` sem o Paulo confirmar.
- Registrar o passo também no `ROTEIRO-LANCAMENTO.md` do repositório do app (`FIT-OS-FRONTEND`).
- Nunca rodar `db push` nem `ALTER TABLE` no banco de produção (Neon) por conta própria: só com o OK explícito do Paulo, e depois de dizer exatamente o que será feito.
- Se a tarefa **não** mexe no banco, dizer isso numa linha ("sem mudança de banco, não precisa de db push").

## 2) Onde cada coisa é publicada
- Servidor (`fitos-final`, Render): publica a branch **`main`** (deploy automático a cada commit).
- PWA (`FIT-OS-FRONTEND`, Render): publica a branch **`main`**.
- App do iPhone/Android: atualização de JavaScript por `eas update`, ligada à versão do app (`runtimeVersion` = versão do `app.json`). `main` = versão 1.0.0 (app 1.0 da loja); `ios-1.1` = versão 1.1.0.
- `ios-1.1` e `main` divergem. Correção urgente para quem usa a PWA ou o app 1.0 deve sair em uma branch criada a partir da `main`, só com a correção.
- **A Apple JÁ revisou e aprovou o app.** Não existe revisão em andamento. NUNCA mais perguntar, avisar ou segurar o `eas update` por causa de revisão da Apple. Só voltar a tratar disso quando o Paulo disser que vai mandar uma nova versão para revisar.
