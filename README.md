# cliente-insta-bot

Automação de Reels no Instagram — 2 contas, 6 posts/dia, 100% via GitHub Actions.
O computador fica desligado; o GitHub publica, salva o progresso e renova os tokens.

Guia completo (passo a passo com prints de onde clicar): veja o documento
"Insta Bot — passo a passo do automático" entregue junto com este zip.

## Comandos

| Comando | O que faz |
| --- | --- |
| `node src/auth.js a` / `b` | Autoriza a conta e salva token + user id no `.env` |
| `npm run status` | Mostra as contas e confirma que os tokens funcionam |
| `node src/generate-calendar.js 2026-11-02 [a,b]` | Gera `calendar-ab-2026-11-02.json` com 7 dias × 6 horários (não mexe no `calendar.json`) |
| `node src/add-posts.js <arquivo>` | Junta os posts do arquivo no `calendar.json` sem apagar nada |
| `npm run bulk-upload` | Sobe os vídeos de `content-a/` e `content-b/` para o Cloudinary e grava `media_url` |
| `npm run check` | Confere se o calendário está pronto (legendas, mídia, datas) |
| `npm run schedule:dry` | Simula o que o bot publicaria agora, sem publicar |
| `npm run schedule` | Publica de verdade os posts do horário atual (é o que o Actions roda) |
| `npm run refresh-token` | Renova os tokens localmente (no GitHub isso é automático) |
| `node src/upload.js video.mp4 pasta` | Upload avulso de um arquivo para o Cloudinary |

## Rotina semanal

```
git pull
node src/generate-calendar.js <segunda-feira>
# coloque os vídeos em content-a/reel-01.mp4 ... reel-42.mp4 e content-b/...
# edite as legendas em calendar-ab-<segunda-feira>.json
node src/add-posts.js calendar-ab-<segunda-feira>.json
npm run bulk-upload
npm run check
git add calendar.json && git commit -m "semana X" && git push
```

## Secrets necessários no GitHub (Settings → Secrets and variables → Actions)

`ACCOUNT_A_LONG_LIVED_TOKEN`, `ACCOUNT_A_INSTAGRAM_USER_ID`,
`ACCOUNT_B_LONG_LIVED_TOKEN`, `ACCOUNT_B_INSTAGRAM_USER_ID`,
`ACCOUNT_C_…` / `ACCOUNT_D_…` (opcionais — contas backup, veja abaixo),
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`GH_PAT` (fine-grained token com *Secrets: Read and write* — obrigatório para a renovação automática).

Em Settings → Actions → General, marque **Read and write permissions**.

## Contas backup (C e D)

C usa os vídeos da A e D usa os vídeos da B, com **legenda e calendário próprios**
(6 reels/dia por 7 dias, stories incluídos). Para montar uma semana:

```
git pull
node src/generate-calendar.js <data-inicio> c,d --videos-de <data do 1º vídeo da A/B>
# escreva as legendas em calendar-cd-<data-inicio>.json (diferentes das contas A/B)
node src/add-posts.js calendar-cd-<data-inicio>.json
npm run check        # avisa se alguma legenda ficou igual à da conta de origem
git add calendar.json && git commit -m "backup semana X" && git push
```

O `media_url` do Cloudinary é copiado da conta de origem — não sobe vídeo de novo.
Secrets: `ACCOUNT_C_LONG_LIVED_TOKEN`, `ACCOUNT_C_INSTAGRAM_USER_ID` (e D).
Autorizar: `node src/auth.js c` / `node src/auth.js d`.

## Horários (America/Sao_Paulo)

10:00 · 12:30 · 15:00 · 17:30 · 20:00 · 22:30 — se o cron do GitHub atrasar ou pular um horário, o bot publica o post atrasado na execução seguinte (1 post por conta por vez, com no mínimo 60 min entre posts da mesma conta, até 3 dias de atraso)
e nunca publica o mesmo post duas vezes.

## Campos do `calendar.json`

```json
{
  "id": "a-d1-01",
  "account": "a",
  "date": "2026-11-02",
  "time": "10:00",
  "type": "reel",
  "caption": "Legenda...\n\n#hashtags",
  "media": "content-a/reel-01.mp4",
  "media_url": "https://res.cloudinary.com/.../a-d1-01.mp4",
  "status": "pending"
}
```

- `status`: `pending` → `published` | `skipped` (legenda não editada) | `failed` (3 tentativas). Para tentar de novo, volte para `pending`.
- `last_error`, `attempts`, `posted_at`, `instagram_id` são preenchidos pelo bot.
- `type` pode ser `reel` (vídeo) ou `image` (foto).
