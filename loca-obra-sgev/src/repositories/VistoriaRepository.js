'use strict';

const { db } = require('../config/database');
const { Vistoria } = require('../models/Vistoria');

/**
 * Persistência de vistorias.
 */
const VistoriaRepository = {
  /** @param {number} id @returns {Vistoria|null} */
  findById(id) {
    return Vistoria.fromRow(db.prepare('SELECT * FROM vistorias WHERE id = ?').get(id));
  },

  /**
   * @param {{contrato_id:number,tipo:string,tem_avaria:boolean,custo_avaria:number,observacoes?:string,data_vistoria:string}} v
   * @returns {Vistoria}
   */
  create(v) {
    const info = db
      .prepare(
        `INSERT INTO vistorias (contrato_id, tipo, tem_avaria, custo_avaria, observacoes, data_vistoria)
         VALUES (@contrato_id, @tipo, @tem_avaria, @custo_avaria, @observacoes, @data_vistoria)`,
      )
      .run({ observacoes: null, ...v, tem_avaria: v.tem_avaria ? 1 : 0 });
    return this.findById(Number(info.lastInsertRowid));
  },

  /** @param {number} contratoId @returns {Vistoria[]} */
  listByContrato(contratoId) {
    return db
      .prepare('SELECT * FROM vistorias WHERE contrato_id = ? ORDER BY id')
      .all(contratoId)
      .map(Vistoria.fromRow);
  },

  /** @param {number} contratoId @param {string} tipo @returns {Vistoria|null} */
  findByContratoTipo(contratoId, tipo) {
    return Vistoria.fromRow(
      db.prepare('SELECT * FROM vistorias WHERE contrato_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1').get(contratoId, tipo),
    );
  },
};

module.exports = VistoriaRepository;
