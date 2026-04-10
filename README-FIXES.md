# Ajustes realizados no projeto

## Estrutura e segurança
- Removido `.env` do pacote final para não vazar credenciais.
- Criado `backend/.env.example`.
- Criado `backend/README.md`.
- Reescrito o back-end para centralizar a criação de checkout no servidor.
- Removidas chamadas diretas ao Mercado Pago nas páginas HTML.

## Páginas corrigidas
- `index-pt-clean.html`: endpoint do formulário agora usa base dinâmica.
- `index_voluntario.html`: endpoint do formulário agora usa base dinâmica.
- `pequisa_aluno_rota_separada.html`: endpoint ajustado para base dinâmica.
- `checkout/presencial/index.html`: refeito.
- `checkout/guinness/index.html`: refeito.
- `checkout/simples/index.html`: refeito.
- `checkout/apoio/index.html`: refeito.
- `checkout/colabinstitucional/index.html`: criado para evitar 404.
- `checkout/colabinstitucional/colabinstitucional.html`: mantido por compatibilidade.
- `checkout/suporteestrategico/index.html`: refeito.
- `checkout/participacao/index.html`: criado.
- `checkout/confirmacao-inscricao/index.html`: refeito para consultar o back-end.
- `checkout/confirmacao-apoio/index.html`: refeito para consultar o back-end.

## Back-end
- Rotas principais:
  - `POST /send`
  - `POST /send-aluno`
  - `POST /send-voluntario`
  - `POST /checkout/create-preference`
  - `GET /checkout/status`
  - `POST /checkout/payment-notifications`
- Mantida compatibilidade com `POST /checkout/apoio/create-preference` e `GET /checkout/apoio/status`.

## Observação importante
Antes de subir em produção, execute `npm install` dentro de `backend/` para instalar as dependências do novo `package.json`.

- `checkout/alunomatheus/index.html`: removido token exposto e integrado ao back-end.
- `checkout/alunoonline/index.html`: removido token exposto e integrado ao back-end.
- `checkout/participacao/index.html`: corrigido para usar o back-end.
- `backend/.env.example`: token real removido e substituído por placeholder.
