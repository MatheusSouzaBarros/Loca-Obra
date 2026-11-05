'use strict';

const AuthService = require('../services/AuthService');
const AppError = require('../utils/AppError');

/**
 * Exige um JWT válido no header `Authorization: Bearer <token>` e popula `req.usuario`.
 * @type {import('express').RequestHandler}
 */
function autenticar(req, _res, next) {
  const header = req.headers.authorization || '';
  const [esquema, token] = header.split(' ');
  if (esquema !== 'Bearer' || !token) throw AppError.unauthorized('Token não informado');
  req.usuario = AuthService.verificarToken(token);
  next();
}

/**
 * RBAC: permite a rota apenas aos perfis informados. Deve vir depois de `autenticar`.
 * @param {...string} roles Perfis autorizados.
 * @returns {import('express').RequestHandler}
 */
function autorizar(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) throw AppError.unauthorized();
    if (!roles.includes(req.usuario.role)) throw AppError.forbidden();
    next();
  };
}

module.exports = { autenticar, autorizar };
