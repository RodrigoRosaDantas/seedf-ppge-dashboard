# SEEDF PPGE — Central de Comando

Painel público de preparação pré-edital para:

- Gestor PPGE — Administração — **ativo**;
- Analista PPGE — Apoio Administrativo — **ativo**;
- Analista PPGE — Monitor — preservado em **Radar**, sem dívida ativa enquanto suspenso.

O Notion SEEDF é a fonte operacional. O site oferece a camada de execução, continuidade e análise, com dados e identidade separados dos projetos TDAS, EDAS e TJDFT.

## Regras operacionais preservadas

- Uma sessão real iniciada e não concluída continua sendo a próxima ação.
- A etapa ativa do C01 fica preparada enquanto houver uma sessão aberta do Leis Primeiro.
- Leitura, prática, evidência e consolidação permanecem estados distintos.
- O histórico de Radar não vira prioridade nem dívida ativa.
- O painel mantém o edital em 64 eixos, o D13 com alvo de zero questões até nova bateria e o diagnóstico DSE03 suspenso.

## Dados e publicação

O workflow **Sync SEEDF dashboard from Notion** lê a página operacional com o secret `SEEDF` do GitHub Actions e publica snapshots sanitizados em `public/data/`. A sincronização programada roda a cada 15 minutos na branch `main`. O token não é enviado ao navegador.

O botão de atualização do site recarrega os snapshots publicados pelo GitHub Pages. Ele não consulta o Notion diretamente. Alterações feitas numa branch ou pull request só aparecem no site público depois de chegarem à `main` e serem publicadas pelo GitHub Pages.

Para configurar a sincronização, adicione o token de leitura do Notion em **Settings → Secrets and variables → Actions** com o nome `SEEDF`, conecte a integração à página operacional e execute o workflow uma vez.

## Desenvolvimento

```bash
npm test
npm run build
```
