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

## Sincronização Notion → GitHub Pages

O workflow `Sync SEEDF dashboard from Notion` consulta a página operacional e publica somente um snapshot sanitizado em `public/data/seedf-snapshot.json`. O conteúdo completo do Notion não é copiado para o site público.

Para ativar a sincronização:

1. Crie um token de leitura no Notion e conecte a integração à página SEEDF.
2. No GitHub, abra **Settings → Secrets and variables → Actions**.
3. Crie o secret `SEEDF` sem colocar o token no código ou em mensagens.
4. Execute manualmente o workflow uma vez; depois ele roda a cada 15 minutos.

O botão **Atualizar** recarrega o último snapshot publicado. Quando o workflow detectar uma mudança, o GitHub Pages será reconstruído automaticamente.
