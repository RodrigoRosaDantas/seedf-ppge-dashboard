# SEEDF PPGE — Dashboard PRO

Dashboard privado de preparação pré-edital para:

- Gestor PPGE — Administração;
- Analista PPGE — Apoio Administrativo;
- Analista PPGE — Monitor.

O Notion SEEDF é a fonte operacional. Este site é a camada de execução e visualização, com dados, métricas e identidade separados dos projetos TDAS, EDAS e TJDFT.

## Estado inicial

- Fase 1 ativa, com C01 liberado;
- próxima ação: D01 — Português fino + LDB;
- C01 preparado com 385 questões fixas e checkpoints adaptativos;
- nenhum desempenho SEEDF importado ou presumido.

## Desenvolvimento

```bash
npm run build
```

## Integração ao vivo Notion → GitHub Pages

O site consulta uma Edge Function protegida, que lê somente a página operacional do Notion e devolve um snapshot sanitizado. O conteúdo completo e o token do Notion nunca chegam ao navegador.

Há também um backup versionado em `public/data/seedf-snapshot.json`, atualizado pelo workflow `Sync SEEDF dashboard from Notion`. Assim, o site continua funcional mesmo quando a API estiver temporariamente indisponível.

Para ativar a sincronização ao vivo:

1. Crie um token de leitura no Notion e conecte a integração à página SEEDF.
2. No GitHub, mantenha o secret `SEEDF` em **Settings → Secrets and variables → Actions**.
3. No projeto [Supabase](https://supabase.com/dashboard/project/fqqkkyusnzhuuizahkww/functions/secrets), crie o secret `SEEDF` com o mesmo valor do token. Nunca coloque o token no código ou em mensagens.
4. Execute manualmente o workflow uma vez; depois o backup roda a cada 15 minutos.

O botão **Atualizar** consulta a API do Notion na hora. Se a API falhar, ele utiliza o último snapshot publicado pelo GitHub e identifica essa situação na interface.
