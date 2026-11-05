'use strict';

const UsuarioRepository = require('../repositories/UsuarioRepository');
const { Usuario, ROLES } = require('../models/Usuario');
const AuthService = require('./AuthService');
const AppError = require('../utils/AppError');

/**
 * CRUD administrativo de usuários da equipe (ATENDENTE/ADMIN).
 * Clientes são gerenciados por ClienteService, pois exigem dados cadastrais.
 */
const UsuarioService = {
  listar: () => UsuarioRepository.list(),

  /** @param {number} id */
  obter(id) {
    const u = UsuarioRepository.findById(id);
    if (!u) throw AppError.notFound('Usuário não encontrado');
    return u;
  },

  /** @param {object} payload */
  criar(payload) {
    const dados = Usuario.validarCriacao(payload);
    if (dados.role === ROLES.CLIENTE) {
      throw AppError.validation('Dados inválidos', { role: 'Clientes são criados pelo cadastro de clientes (exigem CPF/CNPJ)' });
    }
    if (UsuarioRepository.findByEmail(dados.email)) throw AppError.conflict('E-mail já cadastrado', 'EMAIL_DUPLICADO');
    return UsuarioRepository.create({
      nome: dados.nome,
      email: dados.email,
      senha_hash: AuthService.hashSenha(dados.senha),
      role: dados.role,
    });
  },

  /** @param {number} id @param {object} payload */
  atualizar(id, payload, usuarioLogado) {
    const atual = this.obter(id);
    const dados = Usuario.validarAtualizacao(payload);
    if (dados.role && dados.role !== atual.role) {
      if (atual.role === ROLES.CLIENTE || dados.role === ROLES.CLIENTE) {
        throw AppError.validation('Dados inválidos', { role: 'O perfil CLIENTE não pode ser atribuído ou removido por aqui' });
      }
      if (usuarioLogado.id === id) throw AppError.conflict('Você não pode alterar o próprio perfil', 'AUTO_ALTERACAO');
    }
    if (dados.email) {
      const outro = UsuarioRepository.findByEmail(dados.email);
      if (outro && outro.id !== id) throw AppError.conflict('E-mail já cadastrado', 'EMAIL_DUPLICADO');
    }
    const { senha, ...resto } = dados;
    return UsuarioRepository.update(id, { ...resto, ...(senha && { senha_hash: AuthService.hashSenha(senha) }) });
  },

  /** @param {number} id */
  remover(id, usuarioLogado) {
    const atual = this.obter(id);
    if (usuarioLogado.id === id) throw AppError.conflict('Você não pode excluir o próprio usuário', 'AUTO_EXCLUSAO');
    if (atual.role === ROLES.CLIENTE) {
      throw AppError.conflict('Exclua clientes pelo cadastro de clientes', 'USE_CLIENTES');
    }
    UsuarioRepository.delete(id);
  },
};

module.exports = UsuarioService;
