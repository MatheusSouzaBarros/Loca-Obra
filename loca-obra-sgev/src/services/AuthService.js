'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { emTransacao } = require('../config/database');
const UsuarioRepository = require('../repositories/UsuarioRepository');
const ClienteRepository = require('../repositories/ClienteRepository');
const { Usuario, ROLES, LISTA_ROLES } = require('../models/Usuario');
const Cliente = require('../models/Cliente');
const Validador = require('../utils/Validador');
const AppError = require('../utils/AppError');

// Hash fictício para igualar o tempo de resposta quando o e-mail não existe.
const HASH_FICTICIO = bcrypt.hashSync('senha-fficticia', env.bcryptRounds);

/**
 * Autenticação (JWT) e cadastro de usuários/clientes.
 */
const AuthService = {
  /**
   * @param {Usuario} usuario
   * @returns {string} JWT assinado.
   */
  gerarToken(usuario) {
    return jwt.sign({ role: usuario.role, nome: usuario.nome }, env.jwtSecret, {
      subject: String(usuario.id),
      expiresIn: env.jwtExpiresIn,
    });
  },

  /**
   * Valida o token e devolve o usuário atual (garante que ainda existe e usa o role vigente).
   * @param {string} token
   * @returns {Usuario}
   */
  verificarToken(token) {
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw AppError.unauthorized('Token inválido ou expirado');
    }
    const usuario = UsuarioRepository.findById(Number(payload.sub));
    if (!usuario) throw AppError.unauthorized('Usuário não existe mais');
    return usuario;
  },

  /**
   * @param {object} payload {email, senha}
   * @returns {{token:string, usuario:object}}
   */
  login(payload) {
    const { email, senha } = new Validador(payload).email('email').texto('senha', { max: 72 }).resultado();
    const usuario = UsuarioRepository.findByEmail(email);
    const ok = bcrypt.compareSync(senha, usuario ? usuario.senha_hash : HASH_FICTICIO);
    if (!usuario || !ok) throw AppError.unauthorized('E-mail ou senha inválidos');
    return { token: this.gerarToken(usuario), usuario: usuario.toJSON() };
  },

  /**
   * Cadastro público. O perfil só pode ser escolhido quando ALLOW_ROLE_SELECTION está ligado
   * (ambiente de testes); caso contrário o cadastro é sempre CLIENTE.
   * @param {object} payload
   * @returns {{token:string, usuario:object}}
   */
  registrar(payload) {
    const dados = Usuario.validarCriacao(payload);
    const role = env.allowRoleSelection && LISTA_ROLES.includes(payload.role) ? payload.role : ROLES.CLIENTE;
    const cliente = role === ROLES.CLIENTE ? Cliente.validarCadastro(payload) : null;

    const usuario = emTransacao(() => {
      if (UsuarioRepository.findByEmail(dados.email)) throw AppError.conflict('E-mail já cadastrado', 'EMAIL_DUPLICADO');
      if (cliente && ClienteRepository.findByDocumento(cliente.cpf_cnpj)) {
        throw AppError.conflict('CPF/CNPJ já cadastrado', 'DOCUMENTO_DUPLICADO');
      }
      const criado = UsuarioRepository.create({
        nome: dados.nome,
        email: dados.email,
        senha_hash: bcrypt.hashSync(dados.senha, env.bcryptRounds),
        role,
      });
      if (cliente) ClienteRepository.create({ usuario_id: criado.id, ...cliente });
      return criado;
    });

    return { token: this.gerarToken(usuario), usuario: usuario.toJSON() };
  },

  /**
   * Perfil do usuário autenticado (com dados de cliente, se houver).
   * @param {Usuario} usuario
   * @returns {object}
   */
  perfil(usuario) {
    const base = usuario.toJSON();
    if (usuario.role !== ROLES.CLIENTE) return base;
    const cliente = ClienteRepository.findByUsuarioId(usuario.id);
    return { ...base, cliente: cliente ? { id: cliente.id, cpf_cnpj: cliente.cpf_cnpj, telefone: cliente.telefone, endereco: cliente.endereco } : null };
  },

  /** @param {string} senha @returns {string} Hash bcrypt. */
  hashSenha(senha) {
    return bcrypt.hashSync(senha, env.bcryptRounds);
  },
};

module.exports = AuthService;
