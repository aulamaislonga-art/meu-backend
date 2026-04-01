# Back-end - Aula Mais Longa

## O que este back-end faz
- Recebe os formulários da landing page
- Envia e-mail para a organização e para o usuário
- Cria preferências de pagamento no Mercado Pago pelo servidor
- Registra o status dos checkouts em `checkout-records.json`
- Processa notificações de pagamento e dispara e-mails de atualização

## Rotas principais
- `POST /send`
- `POST /send-aluno`
- `POST /send-voluntario`
- `POST /checkout/create-preference`
- `GET /checkout/status`
- `POST /checkout/payment-notifications`
- `GET /health`

## Como rodar
1. Copie `.env.example` para `.env`
2. Preencha as variáveis
3. Execute `npm install`
4. Execute `npm start`

## Observações
- As páginas HTML foram ajustadas para chamar o back-end por uma base dinâmica (`window.API_BASE_URL` ou mesma origem).
- O token do Mercado Pago não deve ficar exposto em HTML.
