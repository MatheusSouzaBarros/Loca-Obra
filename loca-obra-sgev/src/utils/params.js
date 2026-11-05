'use strict';

const AppError = require('./AppError');

/**
 * Lê e valida um parâmetro de rota numérico (inteiro positivo).
 * @param {import('express').Request} req
 * @param {string} [nome]
 * @returns {number}
 */
function idParam(req, nome = 'id') {
  const n = Number(req.params[nome]);
  if (!Number.isInteger(n) || n < 1) throw AppError.badRequest(`Parâmetro "${nome}" inválido`);
  return n;
}

module.exports = { idParam };
