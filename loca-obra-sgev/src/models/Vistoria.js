'use strict';

const Validador = require('../utils/Validador');

const TIPOS_VISTORIA = Object.freeze({ ENTRADA: 'Entrada', SAIDA: 'Saída' });

/**
 * Entidade Vistoria técnica (entrada = retirada do equipamento; saída = devolução).
 */
class Vistoria {
  /**
   * @param {object} row Linha do banco.
   */
  constructor(row) {
    Object.assign(this, row);
    this.tem_avaria = Boolean(row.tem_avaria);
  }

  /** @param {object|undefined} row @returns {Vistoria|null} */
  static fromRow(row) {
    return row ? new Vistoria(row) : null;
  }

  /**
   * Valida a vistoria de saída (a que gera cobrança).
   * Regras: sem avaria => custo 0; com avaria => custo > 0 e observações obrigatórias.
   * @param {object} payload
   * @returns {{tem_avaria:boolean,custo_avaria:number,observacoes?:string}}
   */
  static validarSaida(payload) {
    const v = new Validador(payload)
      .booleano('tem_avaria')
      .numero('custo_avaria', { obrigatorio: false, min: 0, padrao: 0 })
      .texto('observacoes', { obrigatorio: false, max: 1000 });
    const d = v.dados;
    if (d.tem_avaria === false && d.custo_avaria > 0) {
      v.erro('custo_avaria', 'Sem avaria, o custo deve ser zero');
    }
    if (d.tem_avaria === true) {
      if (!(d.custo_avaria > 0)) v.erro('custo_avaria', 'Informe o custo do reparo (maior que zero)');
      if (!d.observacoes) v.erro('observacoes', 'Descreva a avaria encontrada');
    }
    return v.resultado();
  }

  /**
   * Valida a vistoria de entrada (registro do estado na retirada; nunca gera cobrança).
   * @param {object|undefined} payload
   * @returns {{tem_avaria:boolean,custo_avaria:number,observacoes?:string}}
   */
  static validarEntrada(payload) {
    const d = new Validador(payload)
      .booleano('tem_avaria', { obrigatorio: false, padrao: false })
      .texto('observacoes', { obrigatorio: false, max: 1000 })
      .resultado();
    return { ...d, custo_avaria: 0 };
  }
}

module.exports = { Vistoria, TIPOS_VISTORIA };
