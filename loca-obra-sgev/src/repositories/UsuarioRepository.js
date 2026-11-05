'use strict';

const { db } = require('../config/database');
const { Usuario } = require('../models/Usuario');

/**
 * Persistência de usuários.
 */
const UsuarioRepository = {
  /** @param {number} id @returns {Usuario|null} */
  findById(id) {
    return Usuario.fromRow(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id));
  },

  /** @param {string} email @returns {Usuario|null} */
  findByEmail(email) {
    return Usuario.fromRow(db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email));
  },

  /** @returns {Usuario[]} */
  list() {
    return db.prepare('SELECT * FROM usuarios ORDER BY id').all().map(Usuario.fromRow);
  },

  /** @returns {number} */
  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  },

  /**
   * @param {{nome:string,email:string,senha_hash:string,role:string}} u
   * @returns {Usuario}
   */
  create(u) {
    const info = db
      .prepare('INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (@nome, @email, @senha_hash, @role)')
      .run(u);
    return this.findById(Number(info.lastInsertRowid));
  },

  /**
   * @param {number} id
   * @param {Partial<{nome:string,email:string,senha_hash:string,role:string}>} campos
   * @returns {Usuario|null}
   */
  update(id, campos) {
    const permitidos = ['nome', 'email', 'senha_hash', 'role'];
    const chaves = Object.keys(campos).filter((k) => permitidos.includes(k));
    if (chaves.length > 0) {
      const set = chaves.map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE usuarios SET ${set} WHERE id = @id`).run({ ...campos, id });
    }
    return this.findById(id);
  },

  /** @param {number} id @returns {boolean} */
  delete(id) {
    return db.prepare('DELETE FROM usuarios WHERE id = ?').run(id).changes > 0;
  },
};

module.exports = UsuarioRepository;
