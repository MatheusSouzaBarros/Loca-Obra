'use strict';

const Validador = require('../utils/Validador');
const { hoje } = require('../utils/dates');

/** Ciclo de vida do contrato. */
const STATUS_CONTRATO = Object.freeze({
  RESERVADO: 'Reservado',
  RETIRADO: 'Retirado',
  DEVOLVIDO: 'Devolvido',
  VISTORIADO: 'Vistoriado',
  ENCERRADO: 'Encerrado',
  EM_ATRASO: 'Em Atraso',
  ENCERRADO_AVARIA: 'Encerrado com avaria',
});
const LISTA_STATUS_CONTRATO = Object.freeze(Object.values(STATUS_CONTRATO));

/** Status que ocupam a agenda do item (usados na checagem de sobreposição). */
const STATUS_OCUPAM_AGENDA = Object.freeze([
  STATUS_CONTRATO.RESERVADO,
  STATUS_CONTRATO.RETIRADO,
  STATUS_CONTRATO.EM_ATRASO,
]);

/** Status em que o caução ainda está retido (não liquidado). */
const STATUS_CAUCAO_RETIDO = Object.freeze([
  STATUS_CONTRATO.RETIRADO,
  STATUS_CONTRATO.DEVOLVIDO,
  STATUS_CONTRATO.EM_ATRASO,
  STATUS_CONTRATO.VISTORIADO,
]);

/** Status finais. */
const STATUS_ENCERRADOS = Object.freeze([STATUS_CONTRATO.ENCERRADO, STATUS_CONTRATO.ENCERRADO_AVARIA]);

/**
 * Entidade Contrato de locação.
 */
class Contrato {
  /**
   * @param {object} row Linha do banco (inclui campos de item/cliente via JOIN).
   */
  constructor(row) {
    Object.assign(this, row);
    this.multa_descontada = Boolean(row.multa_descontada);
  }

  /** @param {object|undefined} row @returns {Contrato|null} */
  static fromRow(row) {
    return row ? new Contrato(row) : null;
  }

  /**
   * Valida o período: devolução estritamente posterior à retirada.
   * @param {object} payload
   * @param {{permitirPassado?: boolean}} [opcoes]
   * @returns {{data_retirada_prevista:string,data_devolucao_prevista:string}}
   */
  static validarPeriodo(payload, { permitirPassado = false } = {}) {
    const v = new Validador(payload)
      .data('data_retirada_prevista')
      .data('data_devolucao_prevista');
    const d = v.dados;
    if (d.data_retirada_prevista && d.data_devolucao_prevista) {
      if (d.data_devolucao_prevista <= d.data_retirada_prevista) {
        v.erro('data_devolucao_prevista', 'A devolução deve ser estritamente posterior à retirada');
      }
      if (!permitirPassado && d.data_retirada_prevista < hoje()) {
        v.erro('data_retirada_prevista', 'A retirada não pode estar no passado');
      }
    }
    return v.resultado();
  }

  /**
   * Valida a solicitação de reserva.
   * @param {object} payload
   * @returns {{item_id:number,cliente_id?:number,data_retirada_prevista:string,data_devolucao_prevista:string}}
   */
  static validarReserva(payload) {
    const base = new Validador(payload)
      .inteiro('item_id', { min: 1 })
      .inteiro('cliente_id', { obrigatorio: false, min: 1 })
      .resultado();
    return { ...base, ...Contrato.validarPeriodo(payload) };
  }
}

module.exports = {
  Contrato,
  STATUS_CONTRATO,
  LISTA_STATUS_CONTRATO,
  STATUS_OCUPAM_AGENDA,
  STATUS_CAUCAO_RETIDO,
  STATUS_ENCERRADOS,
};
