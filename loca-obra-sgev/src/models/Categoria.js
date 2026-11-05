'use strict';

const Validador = require('../utils/Validador');

/**
 * Entidade Categoria de equipamento.
 * `percentual_caucao_base` é uma fração (0.30 = 30%).
 */
class Categoria {
  /**
   * @param {{id:number,nome:string,percentual_caucao_base:number,valor_diaria_base:number}} row
   */
  constructor(row) {
    this.id = row.id;
    this.nome = row.nome;
    this.percentual_caucao_base = row.percentual_caucao_base;
    this.valor_diaria_base = row.valor_diaria_base;
  }

  /** @param {object|undefined} row @returns {Categoria|null} */
  static fromRow(row) {
    return row ? new Categoria(row) : null;
  }

  /**
   * @param {object} payload
   * @param {{parcial?: boolean}} [opcoes]
   */
  static validar(payload, { parcial = false } = {}) {
    return new Validador(payload, { parcial })
      .texto('nome', { min: 2, max: 80 })
      .numero('percentual_caucao_base', {
        min: 0,
        minExclusivo: true,
        max: 1,
        mensagemMax: 'Informe como fração entre 0 e 1 (ex.: 0.30 para 30%)',
      })
      .numero('valor_diaria_base', { min: 0, minExclusivo: true })
      .resultado();
  }
}

module.exports = Categoria;
