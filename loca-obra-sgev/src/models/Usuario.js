'use strict';

const Validador = require('../utils/Validador');

/** Perfis de acesso (RBAC). */
const ROLES = Object.freeze({ CLIENTE: 'CLIENTE', ATENDENTE: 'ATENDENTE', ADMIN: 'ADMIN' });
const LISTA_ROLES = Object.freeze(Object.values(ROLES));

/**
 * Entidade Usuário.
 */
class Usuario {
  /**
   * @param {{id:number,nome:string,email:string,senha_hash?:string,role:string,criado_em?:string}} row
   */
  constructor(row) {
    this.id = row.id;
    this.nome = row.nome;
    this.email = row.email;
    this.senha_hash = row.senha_hash;
    this.role = row.role;
    this.criado_em = row.criado_em;
  }

  /** @param {object|undefined} row @returns {Usuario|null} */
  static fromRow(row) {
    return row ? new Usuario(row) : null;
  }

  /** Representação segura (nunca expõe o hash da senha). */
  toJSON() {
    return { id: this.id, nome: this.nome, email: this.email, role: this.role, criado_em: this.criado_em };
  }

  /**
   * Valida dados de criação.
   * @param {object} payload
   * @returns {{nome:string,email:string,senha:string,role:string}}
   */
  static validarCriacao(payload) {
    return new Validador(payload)
      .texto('nome', { min: 2, max: 120 })
      .email('email')
      .senha('senha')
      .enum('role', LISTA_ROLES, { obrigatorio: false, padrao: ROLES.CLIENTE })
      .resultado();
  }

  /**
   * Valida dados de atualização (parcial).
   * @param {object} payload
   */
  static validarAtualizacao(payload) {
    return new Validador(payload, { parcial: true })
      .texto('nome', { min: 2, max: 120 })
      .email('email')
      .senha('senha')
      .enum('role', LISTA_ROLES)
      .resultado();
  }
}

module.exports = { Usuario, ROLES, LISTA_ROLES };
