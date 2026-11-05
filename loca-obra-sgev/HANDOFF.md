# HANDOFF - Loca Obra SGEV

Atualizado em 2026-10-11. Leia isto primeiro ao retomar.

## Estado
Backend completo e frontend completo, validados no navegador (Playwright) nos três perfis.
- `npm test`: 14 testes de API passando (sobreposição, caução, atraso, avaria, RBAC, relatórios).
- Fluxo testado pela interface: cliente reserva → atendente devolve → vistoria com avaria (caução R$ 1.050 − reparo R$ 500 = saldo R$ 550) → encerra "Encerrado com avaria".

## O que existe
- Backend em camadas conforme o spec (config, models, repositories, services, controllers, routes, middlewares) + utils.
- Frontend `public/`: auth, painel, disponibilidade (quadro com faixas), catálogo, contratos (+detalhe), operação (retirada/devolução/vistoria/encerramento com simulação do caução), relatórios (4 abas), cadastros (CRUD admin).
- README.md com instruções, regras e estrutura.

## Corrigido nesta sessão
- Parêntese faltando em `public/js/views/relatorios.js` (derrubava o app inteiro no navegador).

## Pendências sugeridas (nada bloqueante)
1. Testes automatizados do frontend (o script usado está só no scratchpad; mover para `tests/e2e/`).
2. Conferir telas internas em 390px (só o login foi visto no celular).
3. Dockerfile e `.env` de produção (SEED_DEMO=false, ALLOW_ROLE_SELECTION=false, JWT_SECRET forte).
4. Paginação nas listas de contratos (limite atual 500).
5. Recuperação de senha e auditoria de ações.

## Como retomar
`npm install && npm test && npm start`. Banco SQLite em `data/` (ignorado no zip; recriado pelo seed).
