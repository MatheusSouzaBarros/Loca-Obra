'use strict';

// Ambiente isolado: banco em memória, sem dados de demonstração (apenas a carga obrigatória).
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.SEED_DEMO = 'false';
process.env.BCRYPT_ROUNDS = '4';

const test = require('node:test');
const assert = require('node:assert/strict');

const { semearSeVazio } = require('../src/config/seed');
const criarApp = require('../src/app');
const ContratoRepository = require('../src/repositories/ContratoRepository');
const ItemRepository = require('../src/repositories/ItemRepository');
const CaucaoService = require('../src/services/CaucaoService');
const { hoje, addDias, agoraISO } = require('../src/utils/dates');

let servidor;
let base;
const tokens = {};
const ids = {};

async function api(metodo, caminho, corpo, token) {
  const res = await fetch(`${base}/api${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  return { status: res.status, body: texto ? JSON.parse(texto) : null };
}

const itemPorPat = (pat) => ItemRepository.findByPatrimonio(pat);
const reservar = (token, pat, ini, fim, extra = {}) =>
  api('POST', '/contratos', { item_id: itemPorPat(pat).id, data_retirada_prevista: ini, data_devolucao_prevista: fim, ...extra }, token);

test.before(async () => {
  semearSeVazio();
  servidor = criarApp().listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;

  const admin = await api('POST', '/auth/register', { nome: 'Admin Teste', email: 'admin@t.com', senha: 'Senha@1234', role: 'ADMIN' });
  const atend = await api('POST', '/auth/register', { nome: 'Atendente Teste', email: 'atend@t.com', senha: 'Senha@1234', role: 'ATENDENTE' });
  const cli1 = await api('POST', '/auth/register', { nome: 'Cliente Um', email: 'c1@t.com', senha: 'Senha@1234', cpf_cnpj: '529.982.247-25', telefone: '11999990001' });
  const cli2 = await api('POST', '/auth/register', { nome: 'Cliente Dois', email: 'c2@t.com', senha: 'Senha@1234', cpf_cnpj: '11.222.333/0001-81', telefone: '1133330002' });
  Object.assign(tokens, { admin: admin.body.token, atend: atend.body.token, c1: cli1.body.token, c2: cli2.body.token });
});

test.after(() => servidor.close());

test('carga: categorias com caução e diária conforme a regra', async () => {
  const { body } = await api('GET', '/categorias', null, tokens.c1);
  const por = Object.fromEntries(body.map((c) => [c.nome, c]));
  assert.equal(por.Betoneira.percentual_caucao_base, 0.3);
  assert.equal(por.Betoneira.valor_diaria_base, 45);
  assert.equal(por.Martelete.percentual_caucao_base, 0.4);
  assert.equal(por.Martelete.valor_diaria_base, 60);
  assert.equal(por.Gerador.percentual_caucao_base, 0.5);
  assert.equal(por.Gerador.valor_diaria_base, 130);
});

test('autenticação: sem token 401, token adulterado 401, login inválido 401', async () => {
  assert.equal((await api('GET', '/categorias')).status, 401);
  assert.equal((await api('GET', '/categorias', null, `${tokens.c1}x`)).status, 401);
  assert.equal((await api('POST', '/auth/login', { email: 'c1@t.com', senha: 'errada123' })).status, 401);
  const ok = await api('POST', '/auth/login', { email: 'c1@t.com', senha: 'Senha@1234' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.usuario.senha_hash, undefined, 'hash nunca pode vazar');
});

test('cadastro: CPF inválido e e-mail duplicado são rejeitados', async () => {
  const cpf = await api('POST', '/auth/register', { nome: 'X Y', email: 'x@t.com', senha: 'Senha@1234', cpf_cnpj: '111.111.111-11' });
  assert.equal(cpf.status, 422);
  assert.ok(cpf.body.erro.detalhes.cpf_cnpj);
  const dup = await api('POST', '/auth/register', { nome: 'X Y', email: 'C1@t.com', senha: 'Senha@1234', cpf_cnpj: '11144477735' });
  assert.equal(dup.status, 409);
});

test('RBAC: cada perfil só acessa o que lhe cabe', async () => {
  const cat = { nome: 'Compactador', percentual_caucao_base: 0.35, valor_diaria_base: 90 };
  assert.equal((await api('POST', '/categorias', cat, tokens.c1)).status, 403);
  assert.equal((await api('POST', '/categorias', cat, tokens.atend)).status, 403);
  assert.equal((await api('GET', '/relatorios/financeiro', null, tokens.c1)).status, 403);
  assert.equal((await api('GET', '/relatorios/financeiro', null, tokens.atend)).status, 403);
  assert.equal((await api('GET', '/relatorios/atrasos', null, tokens.c1)).status, 403);
  assert.equal((await api('GET', '/relatorios/atrasos', null, tokens.atend)).status, 200);
  assert.equal((await api('GET', '/relatorios/financeiro', null, tokens.admin)).status, 200);
  assert.equal((await api('GET', '/usuarios', null, tokens.atend)).status, 403);
  assert.equal((await api('GET', '/clientes', null, tokens.c1)).status, 403);
  assert.equal((await api('POST', '/contratos/1/retirada', {}, tokens.c1)).status, 403);
  assert.equal((await api('POST', '/categorias', cat, tokens.admin)).status, 201);
});

test('integridade: patrimônio único, categoria válida e período coerente', async () => {
  const cat = (await api('GET', '/categorias', null, tokens.admin)).body.find((c) => c.nome === 'Betoneira');
  const novo = { numero_patrimonio: 'bet-001', categoria_id: cat.id, nome: 'Duplicada', valor_item: 1000 };
  const dup = await api('POST', '/itens', novo, tokens.admin);
  assert.equal(dup.status, 409);
  assert.equal(dup.body.erro.codigo, 'PATRIMONIO_DUPLICADO');

  const semCat = await api('POST', '/itens', { ...novo, numero_patrimonio: 'NOVO-1', categoria_id: 9999 }, tokens.admin);
  assert.equal(semCat.status, 422);
  const semCampo = await api('POST', '/itens', { numero_patrimonio: 'NOVO-2', nome: 'Sem categoria', valor_item: 10 }, tokens.admin);
  assert.equal(semCampo.status, 422);

  const igual = await reservar(tokens.c1, 'BET-002', addDias(hoje(), 3), addDias(hoje(), 3));
  assert.equal(igual.status, 422);
  assert.ok(igual.body.erro.detalhes.data_devolucao_prevista);
  const invertido = await reservar(tokens.c1, 'BET-002', addDias(hoje(), 5), addDias(hoje(), 3));
  assert.equal(invertido.status, 422);
  const passado = await reservar(tokens.c1, 'BET-002', addDias(hoje(), -3), addDias(hoje(), 3));
  assert.equal(passado.status, 422);
});

test('double booking: sobreposição bloqueada, vizinhos no mesmo dia permitidos', async () => {
  const d = (n) => addDias(hoje(), n);
  const a = await reservar(tokens.c1, 'GER-001', d(10), d(15));
  assert.equal(a.status, 201);
  assert.equal(a.body.status, 'Reservado');
  assert.equal(a.body.valor_diaria, 130);

  const sobrepoe = await reservar(tokens.c2, 'GER-001', d(12), d(14));
  assert.equal(sobrepoe.status, 409);
  assert.equal(sobrepoe.body.erro.codigo, 'CONFLITO_AGENDA');
  assert.equal((await reservar(tokens.c2, 'GER-001', d(9), d(11))).status, 409, 'invade o início');
  assert.equal((await reservar(tokens.c2, 'GER-001', d(14), d(20))).status, 409, 'invade o fim');
  assert.equal((await reservar(tokens.c2, 'GER-001', d(8), d(20))).status, 409, 'envolve a reserva');

  assert.equal((await reservar(tokens.c2, 'GER-001', d(15), d(18))).status, 201, 'começa no dia da devolução');
  assert.equal((await reservar(tokens.c2, 'GER-001', d(8), d(10))).status, 201, 'termina no dia da retirada');
});

test('double booking: requisições concorrentes geram uma única reserva', async () => {
  const d = (n) => addDias(hoje(), n);
  const respostas = await Promise.all([
    reservar(tokens.c1, 'MAR-002', d(30), d(33)),
    reservar(tokens.c2, 'MAR-002', d(31), d(34)),
    reservar(tokens.c1, 'MAR-002', d(30), d(33)),
    reservar(tokens.c2, 'MAR-002', d(32), d(35)),
  ]);
  const status = respostas.map((r) => r.status).sort();
  assert.deepEqual(status, [201, 409, 409, 409]);
});

test('disponibilidade: reflete reservas futuras e itens em manutenção', async () => {
  const d = (n) => addDias(hoje(), n);
  const r = await api('GET', `/disponibilidade?inicio=${d(11)}&fim=${d(12)}`, null, tokens.c1);
  assert.equal(r.status, 200);
  const por = Object.fromEntries(r.body.itens.map((i) => [i.numero_patrimonio, i]));
  assert.equal(por['GER-001'].disponivel, false);
  assert.equal(por['GER-001'].motivo_indisponibilidade, 'Já reservado no período');
  assert.equal(por['GER-002'].disponivel, true);
  assert.equal(por['MAR-003'].disponivel, false);
  assert.equal(por['MAR-003'].motivo_indisponibilidade, 'Em manutenção');
  assert.equal(por['GER-002'].caucao_estimado, 2400);
  assert.equal(por['GER-002'].total_estimado, 130);

  assert.equal((await api('GET', `/disponibilidade?inicio=${d(5)}&fim=${d(5)}`, null, tokens.c1)).status, 422);
  assert.equal((await api('GET', `/disponibilidade?inicio=${d(-2)}&fim=${d(5)}`, null, tokens.c1)).status, 422);
  assert.equal((await reservar(tokens.c1, 'MAR-003', d(2), d(4))).status, 409, 'manutenção não reserva');
});

test('privacidade: cliente só enxerga os próprios contratos', async () => {
  const meus = await api('GET', '/contratos', null, tokens.c1);
  assert.ok(meus.body.length > 0);
  const c2Contrato = (await api('GET', '/contratos', null, tokens.c2)).body[0];
  assert.ok(meus.body.every((c) => c.cliente_email === 'c1@t.com'));
  assert.equal((await api('GET', `/contratos/${c2Contrato.id}`, null, tokens.c1)).status, 404);
  assert.equal((await api('GET', `/contratos/${c2Contrato.id}`, null, tokens.atend)).status, 200);
});

test('ciclo sem avaria: caução calculado na retirada e devolvido 100%', async () => {
  const d = (n) => addDias(hoje(), n);
  const res = await reservar(tokens.c1, 'BET-001', hoje(), d(2));
  assert.equal(res.status, 201);
  const id = res.body.id;

  assert.equal((await api('POST', `/contratos/${id}/devolucao`, {}, tokens.atend)).status, 409, 'não devolve o que não saiu');

  const ret = await api('POST', `/contratos/${id}/retirada`, { vistoria_entrada: { tem_avaria: true, observacoes: 'Risco na lataria' } }, tokens.atend);
  assert.equal(ret.status, 200);
  assert.equal(ret.body.status, 'Retirado');
  assert.equal(ret.body.valor_caucao_retido, 1050); // 3500 * 30%
  assert.equal(itemPorPat('BET-001').status, 'Em Uso');
  assert.equal((await api('POST', `/contratos/${id}/retirada`, {}, tokens.atend)).status, 409);

  const dev = await api('POST', `/contratos/${id}/devolucao`, {}, tokens.atend);
  assert.equal(dev.body.status, 'Devolvido');
  assert.equal(dev.body.valor_multa, 0);

  assert.equal((await api('POST', `/contratos/${id}/vistoria`, { tem_avaria: true, custo_avaria: 0, observacoes: 'x' }, tokens.atend)).status, 422);
  assert.equal((await api('POST', `/contratos/${id}/vistoria`, { tem_avaria: false, custo_avaria: 50 }, tokens.atend)).status, 422);
  const vis = await api('POST', `/contratos/${id}/vistoria`, { tem_avaria: false, observacoes: 'Ok' }, tokens.atend);
  assert.equal(vis.status, 201);
  assert.equal(vis.body.contrato.status, 'Vistoriado');

  const enc = await api('POST', `/contratos/${id}/encerramento`, {}, tokens.atend);
  assert.equal(enc.status, 200);
  assert.equal(enc.body.contrato.status, 'Encerrado');
  assert.equal(enc.body.liquidacao.saldo_devolvido, 1050);
  assert.equal(enc.body.contrato.valor_caucao_devolvido, 1050);
  assert.equal(itemPorPat('BET-001').status, 'Disponível');

  const detalhe = await api('GET', `/contratos/${id}`, null, tokens.c1);
  assert.deepEqual(detalhe.body.vistorias.map((v) => v.tipo), ['Entrada', 'Saída']);
  assert.equal(detalhe.body.vistorias[0].custo_avaria, 0, 'avaria de entrada nunca gera cobrança');
});

test('ciclo com atraso e avaria: multa + reparo abatidos do caução', async () => {
  const d = (n) => addDias(hoje(), n);
  // Reserva histórica (inserida direto no repositório: a API só aceita datas futuras).
  const it = itemPorPat('MAR-001');
  const c = ContratoRepository.create({
    cliente_id: 1, item_id: it.id, data_reserva: agoraISO(),
    data_retirada_prevista: d(-4), data_devolucao_prevista: d(-2), valor_diaria: it.valor_diaria_base,
  });

  const ret = await api('POST', `/contratos/${c.id}/retirada`, {}, tokens.atend);
  assert.equal(ret.body.valor_caucao_retido, 1120); // 2800 * 40%

  // A retirada ocorreu hoje e a devolução prevista era há 2 dias: o contrato já consta em atraso.
  const lista = await api('GET', '/relatorios/atrasos', null, tokens.atend);
  const noRelatorio = lista.body.contratos.find((x) => x.id === c.id);
  assert.ok(noRelatorio);
  assert.equal(noRelatorio.dias_atraso, 2);
  assert.equal(noRelatorio.multa_acumulada, 120);

  const dev = await api('POST', `/contratos/${c.id}/devolucao`, {}, tokens.atend);
  assert.equal(dev.body.status, 'Em Atraso');
  assert.equal(dev.body.valor_multa, 120); // 2 dias * R$ 60

  await api('POST', `/contratos/${c.id}/vistoria`, { tem_avaria: true, custo_avaria: 200, observacoes: 'Ponteira quebrada' }, tokens.atend);

  const sim = await api('GET', `/contratos/${c.id}/liquidacao?custo_avaria=200&descontar_multa=false`, null, tokens.atend);
  assert.equal(sim.body.saldo_devolvido, 920);
  assert.equal(sim.body.multa_a_cobrar_a_parte, 120);

  const enc = await api('POST', `/contratos/${c.id}/encerramento`, { descontar_multa: true }, tokens.atend);
  assert.equal(enc.body.contrato.status, 'Encerrado com avaria');
  assert.equal(enc.body.liquidacao.saldo_devolvido, 800); // 1120 - 200 - 120
  assert.equal(enc.body.contrato.valor_caucao_devolvido, 800);
  assert.equal(enc.body.contrato.multa_descontada, true);
  assert.equal(itemPorPat('MAR-001').status, 'Em Manutenção');

  // Liberação pós-reparo pelo atendente.
  const lib = await api('PATCH', `/itens/${it.id}/status`, { status: 'Disponível' }, tokens.atend);
  assert.equal(lib.status, 200);
  assert.equal((await api('PATCH', `/itens/${it.id}/status`, { status: 'Em Uso' }, tokens.atend)).status, 422);
});

test('avaria acima do caução: saldo zera e o excedente vira cobrança adicional', async () => {
  const res = await reservar(tokens.c2, 'GER-002', hoje(), addDias(hoje(), 1));
  const id = res.body.id;
  await api('POST', `/contratos/${id}/retirada`, {}, tokens.atend);
  await api('POST', `/contratos/${id}/devolucao`, {}, tokens.atend);
  await api('POST', `/contratos/${id}/vistoria`, { tem_avaria: true, custo_avaria: 3000, observacoes: 'Motor fundido' }, tokens.atend);
  const enc = await api('POST', `/contratos/${id}/encerramento`, {}, tokens.atend);
  assert.equal(enc.body.liquidacao.caucao_retido, 2400); // 4800 * 50%
  assert.equal(enc.body.liquidacao.saldo_devolvido, 0);
  assert.equal(enc.body.liquidacao.cobranca_adicional, 600);
  assert.equal(enc.body.contrato.valor_cobranca_adicional, 600);
});

test('relatórios: pendências de caução e financeiro refletem o movimento', async () => {
  const pend = await api('GET', '/relatorios/pendencias-caucao', null, tokens.atend);
  assert.equal(pend.status, 200);
  assert.equal(pend.body.quantidade, 0, 'todos os contratos retirados foram encerrados');

  const fin = await api('GET', '/relatorios/financeiro', null, tokens.admin);
  assert.equal(fin.body.geral.contratos_encerrados, 3);
  assert.equal(fin.body.geral.multas_aplicadas, 120);
  assert.equal(fin.body.geral.avarias_cobradas, 3200);
  assert.equal(fin.body.geral.caucao_devolvido, 1050 + 800 + 0);

  const dash = await api('GET', '/dashboard', null, tokens.c1);
  assert.equal(dash.body.escopo, 'cliente');
});

test('CaucaoService: cálculos em centavos e prioridade de abatimento', () => {
  assert.equal(CaucaoService.calcularCaucao(3500, 0.3), 1050);
  assert.equal(CaucaoService.calcularCaucao(0.1 + 0.2, 1), 0.3);
  assert.equal(CaucaoService.diasAtraso('2026-01-10', '2026-01-10'), 0);
  assert.equal(CaucaoService.diasAtraso('2026-01-10', '2026-01-13'), 3);
  assert.equal(CaucaoService.diasAtraso('2026-01-10', '2026-01-08'), 0);
  assert.equal(CaucaoService.calcularMulta(3, 130), 390);

  const l = CaucaoService.calcularLiquidacao({ caucaoRetido: 1000, custoAvaria: 900, multa: 300, descontarMulta: true });
  assert.equal(l.avaria_descontada, 900);
  assert.equal(l.multa_descontada, 100);
  assert.equal(l.saldo_devolvido, 0);
  assert.equal(l.cobranca_adicional, 200);

  const sem = CaucaoService.calcularLiquidacao({ caucaoRetido: 1000 });
  assert.equal(sem.saldo_devolvido, 1000);
});
