'use strict';

const { toCents, fromCents } = require('../utils/money');
const { diffDias } = require('../utils/dates');

/**
 * Regras financeiras puras de caução, multa e liquidação (sem acesso a banco).
 * Todos os cálculos são feitos em centavos inteiros.
 */
const CaucaoService = {
  /**
   * Caução retido na retirada: valor_item * percentual_caucao_base.
   * @param {number} valorItem
   * @param {number} percentual Fração (0.30 = 30%).
   * @returns {number}
   */
  calcularCaucao(valorItem, percentual) {
    return fromCents(Math.round(toCents(valorItem) * percentual));
  },

  /**
   * Dias de atraso (0 se devolvido no prazo).
   * @param {string} devolucaoPrevista YYYY-MM-DD
   * @param {string} devolucaoReal YYYY-MM-DD
   * @returns {number}
   */
  diasAtraso(devolucaoPrevista, devolucaoReal) {
    return Math.max(0, diffDias(devolucaoPrevista, devolucaoReal));
  },

  /**
   * Multa por atraso: dias_atraso * valor_diaria.
   * @param {number} diasAtraso
   * @param {number} valorDiaria
   * @returns {number}
   */
  calcularMulta(diasAtraso, valorDiaria) {
    return fromCents(diasAtraso * toCents(valorDiaria));
  },

  /**
   * Liquidação financeira do caução.
   *
   * Ordem de abatimento: 1º custo da avaria, 2º multa (se `descontarMulta`).
   * O saldo nunca fica negativo; o que exceder o caução vira cobrança adicional.
   * Multa não descontada fica registrada como valor a cobrar à parte.
   *
   * @param {{caucaoRetido:number, custoAvaria?:number, multa?:number, descontarMulta?:boolean}} p
   * @returns {{
   *  caucao_retido:number, custo_avaria:number, multa:number, avaria_descontada:number,
   *  multa_descontada:number, total_descontado:number, saldo_devolvido:number,
   *  cobranca_adicional:number, multa_a_cobrar_a_parte:number
   * }}
   */
  calcularLiquidacao({ caucaoRetido, custoAvaria = 0, multa = 0, descontarMulta = true }) {
    const caucao = toCents(caucaoRetido);
    const avaria = toCents(custoAvaria);
    const multaC = toCents(multa);

    const avariaDescontada = Math.min(avaria, caucao);
    const restanteAposAvaria = caucao - avariaDescontada;
    const multaDescontada = descontarMulta ? Math.min(multaC, restanteAposAvaria) : 0;
    const saldo = restanteAposAvaria - multaDescontada;

    const cobrancaAdicional = avaria - avariaDescontada + (descontarMulta ? multaC - multaDescontada : 0);
    const multaAParte = descontarMulta ? 0 : multaC;

    return {
      caucao_retido: fromCents(caucao),
      custo_avaria: fromCents(avaria),
      multa: fromCents(multaC),
      avaria_descontada: fromCents(avariaDescontada),
      multa_descontada: fromCents(multaDescontada),
      total_descontado: fromCents(avariaDescontada + multaDescontada),
      saldo_devolvido: fromCents(saldo),
      cobranca_adicional: fromCents(cobrancaAdicional),
      multa_a_cobrar_a_parte: fromCents(multaAParte),
    };
  },
};

module.exports = CaucaoService;
