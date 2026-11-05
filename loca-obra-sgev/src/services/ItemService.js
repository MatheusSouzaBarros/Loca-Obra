'use strict';

const ItemRepository = require('../repositories/ItemRepository');
const CategoriaRepository = require('../repositories/CategoriaRepository');
const ContratoRepository = require('../repositories/ContratoRepository');
const { Item, STATUS_ITEM, LISTA_STATUS_ITEM } = require('../models/Item');
const { STATUS_CAUCAO_RETIDO } = require('../models/Contrato');
const Validador = require('../utils/Validador');
const AppError = require('../utils/AppError');

/**
 * CRUD de itens (patrimônio) e ajuste operacional de situação.
 */
const ItemService = {
  /** @param {{categoria_id?:string, status?:string}} query */
  listar(query = {}) {
    const filtros = new Validador(query, { parcial: true })
      .inteiro('categoria_id', { min: 1 })
      .enum('status', LISTA_STATUS_ITEM)
      .resultado();
    return ItemRepository.list(filtros);
  },

  /** @param {number} id */
  obter(id) {
    const item = ItemRepository.findById(id);
    if (!item) throw AppError.notFound('Item não encontrado');
    return item;
  },

  /** @private */
  _validarVinculos(dados, idAtual) {
    if (dados.categoria_id && !CategoriaRepository.findById(dados.categoria_id)) {
      throw AppError.validation('Dados inválidos', { categoria_id: 'Categoria inexistente: todo item deve ter uma categoria válida' });
    }
    if (dados.numero_patrimonio) {
      const existente = ItemRepository.findByPatrimonio(dados.numero_patrimonio);
      if (existente && existente.id !== idAtual) {
        throw AppError.conflict('Número de patrimônio já cadastrado', 'PATRIMONIO_DUPLICADO');
      }
    }
  },

  /** @param {object} payload */
  criar(payload) {
    const dados = Item.validar(payload);
    this._validarVinculos(dados);
    return ItemRepository.create(dados);
  },

  /** @param {number} id @param {object} payload */
  atualizar(id, payload) {
    this.obter(id);
    const dados = Item.validar(payload, { parcial: true });
    this._validarVinculos(dados, id);
    return ItemRepository.update(id, dados);
  },

  /**
   * Ajuste operacional (atendente/admin): libera ou envia para manutenção.
   * "Em Uso" é controlado exclusivamente pelo ciclo do contrato.
   * @param {number} id
   * @param {object} payload {status}
   */
  alterarStatus(id, payload) {
    const item = this.obter(id);
    const { status } = new Validador(payload)
      .enum('status', [STATUS_ITEM.DISPONIVEL, STATUS_ITEM.EM_MANUTENCAO])
      .resultado();
    const emPosse = ContratoRepository.list({ item_id: id }).some((c) => STATUS_CAUCAO_RETIDO.includes(c.status));
    if (emPosse) {
      throw AppError.conflict('O item está com um cliente (contrato em andamento); conclua devolução e vistoria antes', 'ITEM_EM_POSSE');
    }
    return ItemRepository.update(item.id, { status });
  },

  /** @param {number} id */
  remover(id) {
    this.obter(id);
    if (ItemRepository.countContratos(id) > 0) {
      throw AppError.conflict('Não é possível excluir: o item possui histórico de contratos', 'ITEM_COM_HISTORICO');
    }
    ItemRepository.delete(id);
  },
};

module.exports = ItemService;
