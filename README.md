# ml-promo-bot

Robô em Node.js para aplicar promoções automaticamente nos anúncios de uma conta
de vendedor do Mercado Livre, usando a API oficial `/seller-promotions`.

## O que ele faz

A cada ciclo (padrão 15 min), `npm start`:
1. Consulta `/seller-promotions/users/{USER_ID}` para descobrir **todos** os
   convites de promoção disponíveis (DEAL, MARKETPLACE_CAMPAIGN, PRICE_DISCOUNT,
   LIGHTNING, DOD, VOLUME, PRE_NEGOTIATED, SELLER_CAMPAIGN, SMART,
   PRICE_MATCHING, UNHEALTHY_STOCK, SELLER_COUPON_CAMPAIGN — qualquer tipo).
2. Para cada campanha ativa/candidata, lista os itens elegíveis.
3. Para cada item, calcula o preço mínimo seguro (`src/pricing.js`) a partir de
   `costs.csv`. Itens abaixo da margem mínima, ou sem custo cadastrado, são
   descartados e **nunca** chegam à fila.
4. Os itens seguros são gravados em `pending.json` — uma fila de candidatos.

**O robô nunca aplica nada sozinho.** Para aprovar:

```bash
npm run review
```

Isso abre um prompt interativo, item por item, mostrando preço atual, preço
promocional e a campanha. Você responde `s` (aplica na API do ML), `n`/Enter
(rejeita e remove da fila) ou `q` (sai, deixando o resto pendente).

Itens sem linha em `costs.csv` são **ignorados por segurança** — o robô nunca
enfileira algo cujo custo ele não conhece.

## Setup

```bash
npm install
cp .env.example .env
cp costs.example.csv costs.csv   # preencha com seus custos reais
```

### Autenticação inicial (feita uma única vez, manualmente)

1. Crie uma aplicação em https://developers.mercadolivre.com.br/devcenter e
   anote `CLIENT_ID` e `CLIENT_SECRET`.
2. Abra no navegador, logado com a conta vendedora:
   ```
   https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=SEU_CLIENT_ID&redirect_uri=SEU_REDIRECT_URI
   ```
3. Você será redirecionado com um `?code=...` na URL. Troque esse código por
   tokens:
   ```bash
   curl -X POST https://api.mercadolibre.com/oauth/token \
     -d "grant_type=authorization_code" \
     -d "client_id=SEU_CLIENT_ID" \
     -d "client_secret=SEU_CLIENT_SECRET" \
     -d "code=O_CODE_RECEBIDO" \
     -d "redirect_uri=SEU_REDIRECT_URI"
   ```
4. A resposta traz `access_token`, `refresh_token` e `user_id`. Coloque
   `refresh_token` e `user_id` no `.env` (`ML_REFRESH_TOKEN`, `ML_USER_ID`).
   O bot renova o `access_token` sozinho a partir daí.

## Rodando

```bash
npm start     # detecta candidatos e enfileira em pending.json — não aplica nada
npm run review  # revisa a fila e aprova/rejeita item por item
```

## Próximos passos sugeridos

- **Webhooks**: assinar os tópicos `public_candidates` e `public_offers` no
  painel de notificações da aplicação, para reagir a novos convites em tempo
  real em vez de só fazer polling.
- **Painel em React**: um front-end simples que lê os logs/decisões do bot
  (pode ser servido por uma API REST própria adicionada a este backend) para
  acompanhar visualmente o que foi aplicado, recusado e por quê.
- **Persistência**: hoje o histórico só vai para o console — migrar para um
  arquivo/DB (SQLite é suficiente) para manter registro entre reinícios.
