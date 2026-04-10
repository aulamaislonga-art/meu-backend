Alterações principais desta versão:
- Persistência em arquivo antes de qualquer envio de e-mail.
- Inscrições salvas em backend/data/submissions.
- Fila de e-mails com retry em backend/data/email-jobs.
- Anexos de voluntários salvos em backend/data/attachments.
- Protocolo retornado ao usuário em todas as inscrições.
- Health check com status de SMTP e jobs pendentes.

Antes de subir:
1. Copie backend/.env.example para backend/.env
2. Preencha as variáveis reais
3. Rode npm install
4. Suba o servidor
