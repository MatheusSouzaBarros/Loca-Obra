'use strict';

const { db } = require('../config/database');
const { Contrato, STATUS_CONTRATO, STATUS_OCUPAM_AGENDA, STATUS_CAUCAO_RETIDO } = require('../models/Contrato');

const SELECT_BASE = `
  SELECT c.*,
         i.numero_patrimonio, i.nome AS item_nome, i.valor_item, i.status AS item_status,
         cat.id AS categoria_id, cat.nome AS categoria_nome, cat.percentual_caucao_base,
         cl.cpf_cnpj AS cliente_cpf_cnpj, cl.usuario_id AS cliente_usuario_id,
         u.nome AS cliente_nome, u.email AS cliente_email
  FROM contratos c
  JOIN itens i ON i.id = c.item_id
  JOIN categorias cat ON cat.id = i.categoria_id
  JOIN clientes cl ON cl.id = c.cliente_id
  JOIN usuarios u ON u.id = cl.usuario_id`;

const marcadores = (lista) => lista.map(() => '?').join(',');

/** Colunas que podem ser alteradas por `atualizar`. */
const COLUNAS_ATUALIZAVEIS = [
  'data_retirada_real',
  'data_devolucao_real',
  'valor_caucao_retido',
  'valor_multa',
  'status',
  'valor_caucao_devolvido',
  'valor_cobranca_adicional',
  'multa_descontada',
  'data_encerramento',
];

/**
 * Persistência de contratos e consultas de agenda/relatório operacional.
 */
const ContratoRepository = {
  /**
   * @param {{cliente_id?:number,status?:string,item_id?:number,limite?:number}} [filtros]
   * @returns {Contrato[]}
   */
  list({ cliente_id, status, item_id, limite = 500 } = {}) {
    const where = [];
    const params = [];
    if (cliente_id) {
      where.push('c.cliente_id = ?');
      params.push(cliente_id);
    }
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    if (item_id) {
      where.push('c.item_id = ?');
      params.push(item_id);
    }
    const sql = `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.id DESC LIMIT ?`;
    return db.prepare(sql).all(...params, limite).map(Contrato.fromRow);
  },

  /** @param {number} id @returns {Contrato|null} */
  findById(id) {
    return Contrato.fromRow(db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(id));
  },

  /**
   * Conta conflitos de agenda para o intervalo [inicio, fim] — fórmula obrigatória de sobreposição:
   * status IN ('Reservado','Retirado','Em Atraso') AND retirada_prevista < fim AND devolucao_prevista > inicio.
   * @param {number} itemId
   * @param {string} inicio Nova retirada (YYYY-MM-DD)
   * @param {string} fim Nova devolução (YYYY-MM-DD)
   * @param {number} [ignorarContratoId]
   * @returns {number}
   */
  contarConflitos(itemId, inicio, fim, ignorarContratoId = 0) {
    return db
      .prepare(
        `SELECT COUNT(*) AS n FROM contratos
         WHERE item_id = ?
           AND status IN (${marcadores(STATUS_OCUPAM_AGENDA)})
           AND (data_retirada_prevista < ? AND data_devolucao_prevista > ?)
           AND id <> ?`,
      )
      .get(itemId, ...STATUS_OCUPAM_AGENDA, fim, inicio, ignorarContratoId).n;
  },

  /**
   * @param {{cliente_id:number,item_id:number,data_reserva:string,data_retirada_prevista:string,
   *  data_devolucao_prevista:string,valor_diaria:number,status?:string,data_retirada_real?:string,
   *  valor_caucao_retido?:number}} c
   * @returns {Contrato}
   */
  create(c) {
    const info = db
      .prepare(
        `INSERT INTO contratos (cliente_id, item_id, data_reserva, data_retirada_prevista, data_devolucao_prevista,
                                data_retirada_real, valor_diaria, valor_caucao_retido, status)
         VALUES (@cliente_id, @item_id, @data_reserva, @data_retirada_prevista, @data_devolucao_prevista,
                 @data_retirada_real, @valor_diaria, @valor_caucao_retido, @status)`,
      )
      .run({ data_retirada_real: null, valor_caucao_retido: 0, status: STATUS_CONTRATO.RESERVADO, ...c });
    return this.findById(Number(info.lastInsertRowid));
  },

  /**
   * Atualiza campos do ciclo de vida (lista branca de colunas).
   * @param {number} id
   * @param {object} campos
   * @returns {Contrato|null}
   */
  atualizar(id, campos) {
    const chaves = Object.keys(campos).filter((k) => COLUNAS_ATUALIZAVEIS.includes(k));
    if (chaves.length > 0) {
      const set = chaves.map((k) => `${k} = @${k}`).join(', ');
      const valores = { ...campos, id };
      if ('multa_descontada' in valores) valores.multa_descontada = valores.multa_descontada ? 1 : 0;
      db.prepare(`UPDATE contratos SET ${set} WHERE id = @id`).run(valores);
    }
    return this.findById(id);
  },

  /**
   * Marca como "Em Atraso" os contratos retirados cuja devolução prevista já passou.
   * @param {string} dataHoje YYYY-MM-DD
   * @returns {number} Contratos atualizados.
   */
  marcarAtrasados(dataHoje) {
    return db
      .prepare(
        `UPDATE contratos SET status = ?
         WHERE status = ? AND data_devolucao_real IS NULL AND data_devolucao_prevista < ?`,
      )
      .run(STATUS_CONTRATO.EM_ATRASO, STATUS_CONTRATO.RETIRADO, dataHoje).changes;
  },

  /**
   * Contratos com caução retido (ainda não liquidado).
   * @returns {Contrato[]}
   */
  pendenciasCaucao() {
    return db
      .prepare(
        `${SELECT_BASE} WHERE c.status IN (${marcadores(STATUS_CAUCAO_RETIDO)}) ORDER BY c.data_devolucao_prevista`,
      )
      .all(...STATUS_CAUCAO_RETIDO)
      .map(Contrato.fromRow);
  },

  /**
   * Contratos em atraso (em campo ou devolvidos com atraso aguardando encerramento).
   * @returns {Contrato[]}
   */
  emAtraso() {
    return db
      .prepare(`${SELECT_BASE} WHERE c.status = ? ORDER BY c.data_devolucao_prevista`)
      .all(STATUS_CONTRATO.EM_ATRASO)
      .map(Contrato.fromRow);
  },
};

module.exports = ContratoRepository;
