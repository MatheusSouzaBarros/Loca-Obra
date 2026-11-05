'use strict';

const AppError = require('../utils/AppError');

/**
 * 404 para rotas de API inexistentes.
 * @type {import('express').RequestHandler}
 */
function naoEncontrado(req, _res, next) {
  next(AppError.notFound(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

/**
 * Traduz erros de constraint do SQLite em respostas HTTP coerentes.
 * @param {Error & {code?:string}} err
 * @returns {AppError|null}
 */
function traduzErroBanco(err) {
  const code = err.code || '';
  if (!code.startsWith('SQLITE_CONSTRAINT')) return null;
  if (String(err.message).includes('CONFLITO_AGENDA')) {
    return AppError.conflict('Item indisponível: já existe reserva/contrato no período solicitado', 'CONFLITO_AGENDA');
  }
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return AppError.conflict('Registro duplicado', 'DUPLICADO');
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return AppError.conflict('Operação bloqueada por registros relacionados', 'REGISTRO_RELACIONADO');
  }
  return AppError.validation('Dados violam uma regra de integridade');
}

/**
 * Handler global de erros.
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let erro = err;
  if (!(erro instanceof AppError)) {
    if (err.type === 'entity.parse.failed') erro = AppError.badRequest('JSON inválido no corpo da requisição');
    else if (err.type === 'entity.too.large') erro = new AppError(413, 'Corpo da requisição muito grande', 'PAYLOAD_GRANDE');
    else erro = traduzErroBanco(err) || null;
  }
  if (!erro) {
    console.error(`[erro] ${req.method} ${req.originalUrl}`, err);
    return res.status(500).json({ erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor' } });
  }
  const corpo = { codigo: erro.code, mensagem: erro.message };
  if (erro.details) corpo.detalhes = erro.details;
  return res.status(erro.status).json({ erro: corpo });
}

module.exports = { naoEncontrado, errorHandler };
