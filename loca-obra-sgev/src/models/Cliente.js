'use strict';

const Validador = require('../utils/Validador');

/**
 * Entidade Cliente (dados cadastrais vinculados a um Usuário).
 */
class Cliente {
  /**
   * @param {object} row Linha do banco (pode incluir nome/email do usuário via JOIN).
   */
  constructor(row) {
    Object.assign(this, row);
  }

  /** @param {object|undefined} row @returns {Cliente|null} */
  static fromRow(row) {
    return row ? new Cliente(row) : null;
  }

  /**
   * Valida apenas os dados cadastrais do cliente (sem credenciais).
   * @param {object} payload
   * @param {{parcial?: boolean}} [opcoes]
   * @returns {{cpf_cnpj?:string,telefone?:string,endereco?:string}}
   */
  static validarCadastro(payload, { parcial = false } = {}) {
    return new Validador(payload, { parcial })
      .documento('cpf_cnpj')
      .texto('telefone', { obrigatorio: false, min: 8, max: 20 })
      .texto('endereco', { obrigatorio: false, max: 255 })
      .resultado();
  }
}

module.exports = Cliente;
