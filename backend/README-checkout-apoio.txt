Fluxo implementado

1. apoio.html envia os dados para POST /checkout/apoio/create-preference
2. o back-end valida, cria a preferência no Mercado Pago e salva um registro local em checkout-records.json
3. o back-end envia:
   - e-mail para a organização com a inscrição iniciada
   - e-mail para o inscrito com status inicial (inscrição recebida / pagamento pendente)
4. o Mercado Pago chama POST /checkout/apoio/payment-notifications
5. o back-end consulta o pagamento, atualiza o registro local e envia novo e-mail conforme o status (aprovado, pendente ou não concluído)
6. confirmação-apoio.html consulta GET /checkout/apoio/status para mostrar o status mais recente disponível

Observações

- Se o front estiver em domínio diferente do back-end, defina window.API_BASE_URL antes do script ou use ?api_base=https://seu-backend
- O arquivo checkout-records.json é um armazenamento local simples. Em produção, o ideal é substituir por banco de dados.
- O envio de e-mail depende do ambiente conseguir conectar no SMTP configurado.
