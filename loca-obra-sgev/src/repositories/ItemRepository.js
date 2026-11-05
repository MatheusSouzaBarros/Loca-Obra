'use strict';

const { db } = require('../config/database');
const { Item } = require('../models/Item');
const { STATUS_OCUPAM_AGENDA } = require('../models/Contrato');

const SELECT_BASE = `
  SELECT i.*, c.nome AS categoria_nome, c.percentual_caucao_base, c.valor_diaria_base
  FROM itens i JOIN categorias c ON c.id = i.categoria_id`;

const MARCADORES_AGENDA = STATUS_OCUPAM_AGENDA.map(() => '?').join(',');

/**
 * Persistência de itens (patrimônio).
 */
const ItemRepository = {
  /**
   * @param {{categoria_id?:number,status?:string}} [filtros]
   * @returns {Item[]}
   */
  list({ categoria_id, status } = {}) {
    const where = [];
    const params = [];
    if (categoria_id) {
      where.push('i.categoria_id = ?');
      params.push(categoria_id);
    }
    if (status) {
      where.push('i.status = ?');
      params.push(status);
    }
    const sql = `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.nome, i.numero_patrimonio`;
    return db.prepare(sql).all(...params).map(Item.fromRow);
  },

  /** @param {number} id @returns {Item|null} */
  findById(id) {
    return Item.fromRow(db.prepare(`${SELECT_BASE} WHERE i.id = ?`).get(id));
  },

  /** @param {string} numero @returns {Item|null} */
  findByPatrimonio(numero) {
    return Item.fromRow(db.prepare(`${SELECT_BASE} WHERE i.numero_patrimonio = ?`).get(numero));
  },

  /**
   * @param {{numero_patrimonio:string,categoria_id:number,nome:string,valor_item:number,status?:string}} i
   * @returns {Item}
   */
  create(i) {
    const info = db
      .prepare(
        `INSERT INTO itens (numero_patrimonio, categoria_id, nome, valor_item, status)
         VALUES (@numero_patrimonio, @categoria_id, @nome, @valor_item, @status)`,
      )
      .run({ status: 'Disponível', ...i });
    return this.findById(Number(info.lastInsertRowid));
  },

  /**
   * @param {number} id
   * @param {Partial<{numero_patrimonio:string,categoria_id:number,nome:string,valor_item:number,status:string}>} campos
   * @returns {Item|null}
   */
  update(id, campos) {
    const permitidos = ['numero_patrimonio', 'categoria_id', 'nome', 'valor_item', 'status'];
    const chaves = Object.keys(campos).filter((k) => permitidos.includes(k));
    if (chaves.length > 0) {
      const set = chaves.map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE itens SET ${set} WHERE id = @id`).run({ ...campos, id });
    }
    return this.findById(id);
  },

  /** @param {number} id @returns {number} Quantidade de contratos do item. */
  countContratos(id) {
    return db.prepare('SELECT COUNT(*) AS n FROM contratos WHERE item_id = ?').get(id).n;
  },

  /** @param {number} id @returns {boolean} */
  delete(id) {
    return db.prepare('DELETE FROM itens WHERE id = ?').run(id).changes > 0;
  },

  /**
   * IDs de itens com algum conflito de agenda no intervalo (mesma fórmula de sobreposição
   * usada em ContratoRepository.contarConflitos, porém em lote).
   * @param {string} inicio YYYY-MM-DD
   * @param {string} fim YYYY-MM-DD
   * @returns {Map<number, number>} item_id -> quantidade de contratos conflitantes
   */
  conflitosPorItem(inicio, fim) {
    const rows = db
      .prepare(
        `SELECT item_id, COUNT(*) AS n FROM contratos
         WHERE status IN (${MARCADORES_AGENDA})
           AND data_retirada_prevista < ? AND data_devolucao_prevista > ?
         GROUP BY item_id`,
      )
      .all(...STATUS_OCUPAM_AGENDA, fim, inicio);
    return new Map(rows.map((r) => [r.item_id, r.n]));
  },

  /**
   * Períodos já comprometidos de um item (sem dados de clientes).
   * @param {number} itemId
   * @param {string} aPartirDe YYYY-MM-DD (descarta períodos que terminam antes)
   * @returns {{data_retirada_prevista:string,data_devolucao_prevista:string,status:string}[]}
   */
  agenda(itemId, aPartirDe) {
    return db
      .prepare(
        `SELECT data_retirada_prevista, data_devolucao_prevista, status FROM contratos
         WHERE item_id = ? AND status IN (${MARCADORES_AGENDA}) AND data_devolucao_prevista >= ?
         ORDER BY data_retirada_prevista`,
      )
      .all(itemId, ...STATUS_OCUPAM_AGENDA, aPartirDe);
  },
};

module.exports = ItemRepository;
