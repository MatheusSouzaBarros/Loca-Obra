'use strict';

const AuthService = require('../services/AuthService');
const env = require('../config/env');

/** Endpoints de autenticação. */
const AuthController = {
  /** POST /api/auth/login */
  login: (req, res) => res.json(AuthService.login(req.body)),

  /** POST /api/auth/register */
  registrar: (req, res) => res.status(201).json(AuthService.registrar(req.body)),

  /** GET /api/auth/me */
  me: (req, res) => res.json(AuthService.perfil(req.usuario)),

  /** GET /api/auth/config — flags públicas usadas pela tela de cadastro. */
  config: (_req, res) => res.json({ selecao_de_perfil: env.allowRoleSelection }),
};

module.exports = AuthController;
