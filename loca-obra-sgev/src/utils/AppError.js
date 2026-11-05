'use strict';

/**
 * Erro de domínio com status HTTP e código estável para o cliente da API.
 */
class AppError extends Error {
  /**
   * @param {number} status Status HTTP.
   * @param {string} message Mensagem legível.
   * @param {string} [code] Código de máquina.
   * @param {object} [details] Detalhes (ex.: erros por campo).
   */
  constructor(status, message, code = 'ERRO', details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, message, 'REQUISICAO_INVALIDA', details);
  }

  static validation(message, details) {
    return new AppError(422, message, 'VALIDACAO', details);
  }

  static unauthorized(message = 'Autenticação necessária') {
    return new AppError(401, message, 'NAO_AUTENTICADO');
  }

  static forbidden(message = 'Você não tem permissão para esta operação') {
    return new AppError(403, message, 'ACESSO_NEGADO');
  }

  static notFound(message = 'Recurso não encontrado') {
    return new AppError(404, message, 'NAO_ENCONTRADO');
  }

  static conflict(message, code = 'CONFLITO') {
    return new AppError(409, message, code);
  }
}

module.exports = AppError;
