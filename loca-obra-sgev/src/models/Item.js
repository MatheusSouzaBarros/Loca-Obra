'use strict';

const Validador = require('../utils/Validador');

/** Situação física do patrimônio. */
const STATUS_ITEM = Object.freeze({
  DISPONIVEL: 'Disponível',
  EM_USO: 'Em Uso',
  EM_MANUTENCAO: 'Em Manutenção',
});
const LISTA_STATUS_ITEM = Object.freeze(Object.values(STATUS_ITEM));

/**
 * Entidade Item (patrimônio). `numero_patrimonio` é único.
 */
class Item {
  /**
   * @param {object} row Linha do banco (pode incluir campos da categoria via JOIN).
   */
  constructor(row) {
    Object.assign(this, row);
  }

  /** @param {object|undefined} row @returns {Item|null} */
  static fromRow(row) {
    return row ? new Item(row) : null;
  }

  /**
   * @param {object} payload
   * @param {{parcial?: boolean}} [opcoes]
   */
  static validar(payload, { parcial = false } = {}) {
    const dados = new Validador(payload, { parcial })
      .texto('numero_patrimonio', { min: 2, max: 40 })
      .inteiro('categoria_id', { min: 1 })
      .texto('nome', { min: 2, max: 120 })
      .numero('valor_item', { min: 0, minExclusivo: true })
      .enum('status', LISTA_STATUS_ITEM, { obrigatorio: false })
      .resultado();
    if (dados.numero_patrimonio) dados.numero_patrimonio = dados.numero_patrimonio.toUpperCase();
    return dados;
  }
}

module.exports = { Item, STATUS_ITEM, LISTA_STATUS_ITEM };
