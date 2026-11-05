# Loca Obra - SGEV

Sistema de gestão de locação de equipamentos de obra. Resolve o *double booking* (sobreposição de reservas) e controla o ciclo de vida de contratos e cauções.

**Stack:** Node.js 20+ · Express 5 · SQLite (better-sqlite3) · JWT · bcrypt · frontend em HTML/CSS/JS modular (sem build).

## Como rodar

```bash
npm install
cp .env.example .env     # troque o JWT_SECRET
npm start                # http://localhost:3000 (cria e popula o banco na 1ª execução)
npm test                 # testes de API (node:test)
```

## Contas de demonstração (SEED_DEMO=true)

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@locaobra.com | Admin@123 |
| Atendente | atendente@locaobra.com | Atendente@123 |
| Cliente | cliente@locaobra.com | Cliente@123 |

## Regras de negócio

- **Disponibilidade:** conflito se `retirada_prevista < nova_devolução AND devolução_prevista > nova_retirada` entre contratos `Reservado`, `Retirado` ou `Em Atraso`. Checagem e inserção na mesma transação, com trigger no banco como última barreira.
- **Caução** na retirada: `valor_item × percentual_caucao_base` (Betoneira 30%, Martelete 40%, Gerador 50%). Diárias base: R$ 45, R$ 60, R$ 130.
- **Atraso:** `dias_atraso × valor_diaria`, podendo ser descontada do caução.
- **Liquidação:** sem avaria devolve 100%; com avaria abate o reparo e devolve o saldo. O que exceder o caução vira cobrança adicional.
- **Integridade:** nº de patrimônio único, devolução estritamente posterior à retirada, item sempre ligado a uma categoria.

## Estrutura

```
src/config        banco, env, seed
src/models        entidades e validações
src/repositories  SQL e persistência
src/services      regras de negócio (Disponibilidade, Caucao, Contrato, ...)
src/controllers   HTTP
src/routes        rotas /api com RBAC
src/middlewares   JWT, RBAC, erros
public/           frontend (js/views = uma tela por arquivo)
tests/            testes de API
```

## Perfis (RBAC)

- **Cliente:** catálogo, disponibilidade, reservas, seus contratos.
- **Atendente:** retirada, devolução, vistoria, encerramento, relatórios operacionais.
- **Administrador:** tudo, mais CRUD de itens, categorias, clientes, usuários e relatórios financeiros/frota.
