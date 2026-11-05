'use strict';

const { emTransacao } = require('../config/database');
const ClienteRepository = require('../repositories/ClienteRepository');
const UsuarioRepository = require('../repositories/UsuarioRepository');
const Cliente = require('../models/Cliente');
const { Usuario, ROLES } = require('../models/Usuario');
const AuthService = require('./AuthService');
const AppError = require('../utils/AppError');

/**
 * CRUD administrativo de clientes (usuário + dados cadastrais).
 */
const ClienteService = {
  listar: () => ClienteRepository.list(),

  /** @param {number} id */
  obter(id) {
    const c = ClienteRepository.findById(id);
    if (!c) throw AppError.notFound('Cliente não encontrado');
    return c;
  },

  /** @param {import('../models/Usuario').Usuario} usuario @returns {object} Cadastro do cliente logado. */
  doUsuario(usuario) {
    const c = ClienteRepository.findByUsuarioId(usuario.id);
    if (!c) throw AppError.notFound('Cadastro de cliente não encontrado');
    return c;
  },

  /** @param {object} payload nome, email, senha, cpf_cnpj, telefone?, endereco? */
  criar(payload) {
    const usuarioDados = Usuario.validarCriacao({ ...payload, role: ROLES.CLIENTE });
    const clienteDados = Cliente.validarCadastro(payload);
    return emTransacao(() => {
      if (UsuarioRepository.findByEmail(usuarioDados.email)) throw AppError.conflict('E-mail já cadastrado', 'EMAIL_DUPLICADO');
      if (ClienteRepository.findByDocumento(clienteDados.cpf_cnpj)) throw AppError.conflict('CPF/CNPJ já cadastrado', 'DOCUMENTO_DUPLICADO');
      const usuario = UsuarioRepository.create({
        nome: usuarioDados.nome,
        email: usuarioDados.email,
        senha_hash: AuthService.hashSenha(usuarioDados.senha),
        role: ROLES.CLIENTE,
      });
      return ClienteRepository.create({ usuario_id: usuario.id, ...clienteDados });
    });
  },

  /** @param {number} id @param {object} payload */
  atualizar(id, payload) {
    const atual = this.obter(id);
    const { nome, email, senha } = Usuario.validarAtualizacao({ ...payload, role: undefined });
    const cadastro = Cliente.validarCadastro(payload, { parcial: true });
    return emTransacao(() => {
      if (email) {
        const outro = UsuarioRepository.findByEmail(email);
        if (outro && outro.id !== atual.usuario_id) throw AppError.conflict('E-mail já cadastrado', 'EMAIL_DUPLICADO');
      }
      if (cadastro.cpf_cnpj) {
        const outro = ClienteRepository.findByDocumento(cadastro.cpf_cnpj);
        if (outro && outro.id !== id) throw AppError.conflict('CPF/CNPJ já cadastrado', 'DOCUMENTO_DUPLICADO');
      }
      UsuarioRepository.update(atual.usuario_id, {
        ...(nome && { nome }),
        ...(email && { email }),
        ...(senha && { senha_hash: AuthService.hashSenha(senha) }),
      });
      return ClienteRepository.update(id, cadastro);
    });
  },

  /** @param {number} id */
  remover(id) {
    const atual = this.obter(id);
    if (ClienteRepository.countContratos(id) > 0) {
      throw AppError.conflict('Não é possível excluir: o cliente possui histórico de contratos', 'CLIENTE_COM_HISTORICO');
    }
    emTransacao(() => {
      ClienteRepository.delete(id);
      UsuarioRepository.delete(atual.usuario_id);
    });
  },
};

module.exports = ClienteService;
