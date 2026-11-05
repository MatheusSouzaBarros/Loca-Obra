'use strict';

const { db } = require('../config/database');
const Cliente = require('../models/Cliente');

const SELECT_BASE = `
  SELECT c.*, u.nome, u.email
  FROM clientes c JOIN usuarios u ON u.id = c.usuario_id`;

/**
 * Persistência de clientes.
 */
const ClienteRepository = {
  /** @returns {Cliente[]} */
  list() {
    return db.prepare(`${SELECT_BASE} ORDER BY u.nome`).all().map(Cliente.fromRow);
  },

  /** @param {number} id @returns {Cliente|null} */
  findById(id) {
    return Cliente.fromRow(db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(id));
  },

  /** @param {number} usuarioId @returns {Cliente|null} */
  findByUsuarioId(usuarioId) {
    return Cliente.fromRow(db.prepare(`${SELECT_BASE} WHERE c.usuario_id = ?`).get(usuarioId));
  },

  /** @param {string} doc Apenas dígitos. @returns {Cliente|null} */
  findByDocumento(doc) {
    return Cliente.fromRow(db.prepare(`${SELECT_BASE} WHERE c.cpf_cnpj = ?`).get(doc));
  },

  /**
   * @param {{usuario_id:number,cpf_cnpj:string,telefone?:string,endereco?:string}} c
   * @returns {Cliente}
   */
  create(c) {
    const info = db
      .prepare(
        `INSERT INTO clientes (usuario_id, cpf_cnpj, telefone, endereco)
         VALUES (@usuario_id, @cpf_cnpj, @telefone, @endereco)`,
      )
      .run({ telefone: null, endereco: null, ...c });
    return this.findById(Number(info.lastInsertRowid));
  },

  /**
   * @param {number} id
   * @param {Partial<{cpf_cnpj:string,telefone:string,endereco:string}>} campos
   * @returns {Cliente|null}
   */
  update(id, campos) {
    const permitidos = ['cpf_cnpj', 'telefone', 'endereco'];
    const chaves = Object.keys(campos).filter((k) => permitidos.includes(k));
    if (chaves.length > 0) {
      const set = chaves.map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE clientes SET ${set} WHERE id = @id`).run({ ...campos, id });
    }
    return this.findById(id);
  },

  /** @param {number} id @returns {number} Quantidade de contratos do cliente. */
  countContratos(id) {
    return db.prepare('SELECT COUNT(*) AS n FROM contratos WHERE cliente_id = ?').get(id).n;
  },

  /** @param {number} id @returns {boolean} */
  delete(id) {
    return db.prepare('DELETE FROM clientes WHERE id = ?').run(id).changes > 0;
  },
};

module.exports = ClienteRepository;
