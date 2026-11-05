'use strict';

/**
 * @file Dados de carga obrigatórios (categorias/caução/diárias) e dados de demonstração.
 *
 * Uso: `npm run seed` (idempotente: só popula banco vazio) ou automaticamente no `npm start`.
 */

const env = require('./env');
const { emTransacao } = require('./database');
const UsuarioRepository = require('../repositories/UsuarioRepository');
const CategoriaRepository = require('../repositories/CategoriaRepository');
const ItemRepository = require('../repositories/ItemRepository');
const ClienteRepository = require('../repositories/ClienteRepository');
const ContratoRepository = require('../repositories/ContratoRepository');
const VistoriaRepository = require('../repositories/VistoriaRepository');
const AuthService = require('../services/AuthService');
const CaucaoService = require('../services/CaucaoService');
const { hoje, addDias, agoraISO } = require('../utils/dates');

/** Regras de carga: caução como fração do valor do item e diária base (R$). */
const CATEGORIAS_CARGA = [
  { nome: 'Betoneira', percentual_caucao_base: 0.3, valor_diaria_base: 45.0 },
  { nome: 'Martelete', percentual_caucao_base: 0.4, valor_diaria_base: 60.0 },
  { nome: 'Gerador', percentual_caucao_base: 0.5, valor_diaria_base: 130.0 },
];

const ITENS_CARGA = [
  { numero_patrimonio: 'BET-001', categoria: 'Betoneira', nome: 'Betoneira 400L Motor Elétrico', valor_item: 3500 },
  { numero_patrimonio: 'BET-002', categoria: 'Betoneira', nome: 'Betoneira 400L Motor Elétrico', valor_item: 3500 },
  { numero_patrimonio: 'BET-003', categoria: 'Betoneira', nome: 'Betoneira 150L Motor Elétrico', valor_item: 2400 },
  { numero_patrimonio: 'MAR-001', categoria: 'Martelete', nome: 'Martelete Demolidor 10kg', valor_item: 2800 },
  { numero_patrimonio: 'MAR-002', categoria: 'Martelete', nome: 'Martelete Perfurador SDS-Max', valor_item: 2800 },
  { numero_patrimonio: 'MAR-003', categoria: 'Martelete', nome: 'Martelete Demolidor 16kg', valor_item: 4200, status: 'Em Manutenção' },
  { numero_patrimonio: 'GER-001', categoria: 'Gerador', nome: 'Gerador a Diesel 10kVA', valor_item: 7500 },
  { numero_patrimonio: 'GER-002', categoria: 'Gerador', nome: 'Gerador a Gasolina 5kVA', valor_item: 4800 },
];

/** Contas de teste (ambiente de desenvolvimento/demonstração). */
const USUARIOS_DEMO = [
  { nome: 'Administrador', email: 'admin@locaobra.com', senha: 'Admin@123', role: 'ADMIN' },
  { nome: 'Atendente Operacional', email: 'atendente@locaobra.com', senha: 'Atendente@123', role: 'ATENDENTE' },
];

const CLIENTES_DEMO = [
  { nome: 'João da Silva', email: 'cliente@locaobra.com', senha: 'Cliente@123', cpf_cnpj: '52998224725', telefone: '(11) 99999-0001', endereco: 'Rua das Obras, 100 - São Paulo/SP' },
  { nome: 'Construtora Alfa Ltda', email: 'alfa@locaobra.com', senha: 'Cliente@123', cpf_cnpj: '11222333000181', telefone: '(11) 3333-0002', endereco: 'Av. Industrial, 2000 - Guarulhos/SP' },
];

/**
 * Cria categorias e itens de carga. Retorna mapa nome -> categoria.
 */
function semearCatalogo() {
  const categorias = new Map();
  for (const c of CATEGORIAS_CARGA) categorias.set(c.nome, CategoriaRepository.create(c));
  for (const { categoria, ...item } of ITENS_CARGA) {
    ItemRepository.create({ ...item, categoria_id: categorias.get(categoria).id });
  }
}

/**
 * Cria usuários de teste e contratos de demonstração em vários estágios do ciclo.
 */
function semearDemo() {
  for (const u of USUARIOS_DEMO) {
    UsuarioRepository.create({ nome: u.nome, email: u.email, senha_hash: AuthService.hashSenha(u.senha), role: u.role });
  }
  const clientes = CLIENTES_DEMO.map((c) => {
    const usuario = UsuarioRepository.create({ nome: c.nome, email: c.email, senha_hash: AuthService.hashSenha(c.senha), role: 'CLIENTE' });
    return ClienteRepository.create({ usuario_id: usuario.id, cpf_cnpj: c.cpf_cnpj, telefone: c.telefone, endereco: c.endereco });
  });
  const [joao, alfa] = clientes;
  const item = (pat) => ItemRepository.findByPatrimonio(pat);
  const h = hoje();

  /** Cria um contrato "em campo" (retirado) com caução calculado como no check-out. */
  const retirado = (cliente, pat, ini, fim, real) => {
    const it = item(pat);
    ItemRepository.update(it.id, { status: 'Em Uso' });
    return ContratoRepository.create({
      cliente_id: cliente.id,
      item_id: it.id,
      data_reserva: agoraISO(),
      data_retirada_prevista: ini,
      data_devolucao_prevista: fim,
      data_retirada_real: real,
      valor_diaria: it.valor_diaria_base,
      valor_caucao_retido: CaucaoService.calcularCaucao(it.valor_item, it.percentual_caucao_base),
      status: 'Retirado',
    });
  };
  const reservado = (cliente, pat, ini, fim) => {
    const it = item(pat);
    return ContratoRepository.create({
      cliente_id: cliente.id,
      item_id: it.id,
      data_reserva: agoraISO(),
      data_retirada_prevista: ini,
      data_devolucao_prevista: fim,
      valor_diaria: it.valor_diaria_base,
    });
  };

  // Em atraso (será promovido automaticamente pelo sistema): gerador devia voltar há 2 dias.
  retirado(joao, 'GER-001', addDias(h, -5), addDias(h, -2), addDias(h, -5));
  // Em campo, dentro do prazo.
  retirado(alfa, 'BET-001', addDias(h, -1), addDias(h, 3), addDias(h, -1));
  // Reservas futuras.
  reservado(joao, 'MAR-001', addDias(h, 2), addDias(h, 5));
  reservado(alfa, 'BET-002', addDias(h, 10), addDias(h, 14));

  // Histórico encerrado sem avaria (caução 100% devolvido).
  const itMar = item('MAR-002');
  const c5 = ContratoRepository.create({
    cliente_id: joao.id, item_id: itMar.id, data_reserva: agoraISO(),
    data_retirada_prevista: addDias(h, -20), data_devolucao_prevista: addDias(h, -17),
    data_retirada_real: addDias(h, -20), valor_diaria: itMar.valor_diaria_base,
    valor_caucao_retido: CaucaoService.calcularCaucao(itMar.valor_item, itMar.percentual_caucao_base), status: 'Retirado',
  });
  VistoriaRepository.create({ contrato_id: c5.id, tipo: 'Saída', tem_avaria: false, custo_avaria: 0, observacoes: 'Equipamento em ótimo estado.', data_vistoria: agoraISO() });
  ContratoRepository.atualizar(c5.id, {
    data_devolucao_real: addDias(h, -17), status: 'Encerrado',
    valor_caucao_devolvido: c5.valor_caucao_retido, data_encerramento: agoraISO(),
  });

  // Histórico encerrado com avaria (reparo abatido do caução).
  const itBet = item('BET-003');
  const c6 = ContratoRepository.create({
    cliente_id: alfa.id, item_id: itBet.id, data_reserva: agoraISO(),
    data_retirada_prevista: addDias(h, -15), data_devolucao_prevista: addDias(h, -12),
    data_retirada_real: addDias(h, -15), valor_diaria: itBet.valor_diaria_base,
    valor_caucao_retido: CaucaoService.calcularCaucao(itBet.valor_item, itBet.percentual_caucao_base), status: 'Retirado',
  });
  VistoriaRepository.create({ contrato_id: c6.id, tipo: 'Saída', tem_avaria: true, custo_avaria: 300, observacoes: 'Pá interna danificada; troca realizada.', data_vistoria: agoraISO() });
  const liq = CaucaoService.calcularLiquidacao({ caucaoRetido: c6.valor_caucao_retido, custoAvaria: 300 });
  ContratoRepository.atualizar(c6.id, {
    data_devolucao_real: addDias(h, -12), status: 'Encerrado com avaria',
    valor_caucao_devolvido: liq.saldo_devolvido, data_encerramento: agoraISO(),
  });
}

/**
 * Popula o banco apenas se estiver vazio (sem categorias).
 * @returns {boolean} true se populou.
 */
function semearSeVazio() {
  if (CategoriaRepository.list().length > 0) return false;
  emTransacao(() => {
    semearCatalogo();
    if (env.seedDemo) semearDemo();
  });
  console.log(`[seed] Carga inicial aplicada${env.seedDemo ? ' (com dados de demonstração)' : ''}.`);
  return true;
}

module.exports = { semearSeVazio, CATEGORIAS_CARGA };

if (require.main === module) {
  if (!semearSeVazio()) console.log('[seed] Banco já possui dados; nada a fazer.');
}
