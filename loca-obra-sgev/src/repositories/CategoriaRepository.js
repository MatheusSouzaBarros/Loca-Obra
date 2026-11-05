'use strict';

const { db } = require('../config/database');
const Categoria = require('../models/Categoria');

/**
 * Persistência de categorias.
 */
const CategoriaRepository = {
  /** @returns {Categoria[]} */
  list() {
    return db.prepare('SELECT * FROM categorias ORDER BY nome').all().map(Categoria.fromRow);
  },

  /** @param {number} id @returns {Categoria|null} */
  findById(id) {
    return Categoria.fromRow(db.prepare('SELECT * FROM categorias WHERE id = ?').get(id));
  },

  /** @param {string} nome @returns {Categoria|null} */
  findByNome(nome) {
    return Categoria.fromRow(db.prepare('SELECT * FROM categorias WHERE nome = ?').get(nome));
  },

  /**
   * @param {{nome:string,percentual_caucao_base:number,valor_diaria_base:number}} c
   * @returns {Categoria}
   */
  create(c) {
    const info = db
      .prepare(
        `INSERT INTO categorias (nome, percentual_caucao_base, valor_diaria_base)
         VALUES (@nome, @percentual_caucao_base, @valor_diaria_base)`,
      )
      .run(c);
    return this.findById(Number(info.lastInsertRowid));
  },

  /**
   * @param {number} id
   * @param {Partial<{nome:string,percentual_caucao_base:number,valor_diaria_base:number}>} campos
   * @returns {Categoria|null}
   */
  update(id, campos) {
    const permitidos = ['nome', 'percentual_caucao_base', 'valor_diaria_base'];
    const chaves = Object.keys(campos).filter((k) => permitidos.includes(k));
    if (chaves.length > 0) {
      const set = chaves.map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE categorias SET ${set} WHERE id = @id`).run({ ...campos, id });
    }
    return this.findById(id);
  },

  /** @param {number} id @returns {number} Quantidade de itens da categoria. */
  countItens(id) {
    return db.prepare('SELECT COUNT(*) AS n FROM itens WHERE categoria_id = ?').get(id).n;
  },

  /** @param {number} id @returns {boolean} */
  delete(id) {
    return db.prepare('DELETE FROM categorias WHERE id = ?').run(id).changes > 0;
  },
};

module.exports = CategoriaRepository;
