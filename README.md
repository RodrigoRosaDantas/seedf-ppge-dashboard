# SEEDF PPGE — Dashboard PRO

Dashboard privado de preparação pré-edital para:

- Gestor PPGE — Administração — **ativo**;
- Analista PPGE — Apoio Administrativo — **ativo**;
- Analista PPGE — Monitor — **Radar suspenso**, com histórico preservado.

O Notion SEEDF é a fonte operacional. Este site é a camada de execução e visualização, com dados, métricas e identidade separados dos projetos TDAS, EDAS e TJDFT.

## Estado pós-TR nº 3/2026

- Fase 1 ativa;
- foco operacional: Gestor Administração + Apoio Administrativo;
- Monitor preservado em Radar, sem dívida de execução enquanto suspenso;
- C01 com **355 questões fixas ativas** e projeção operacional de **≈425** com D07/D14;
- D13 pós-TR: DF/RIDE + PDPM + Lei Maria da Penha + primeiros socorros, com nova bateria ainda pendente;
- Edital verticalizado com **64 eixos**, distinguindo força documental, Radar, suspensão e fora do escopo.
- A camada de site preserva histórico de Monitor sem convertê-lo em dívida, revisão ou prioridade ativa.

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
