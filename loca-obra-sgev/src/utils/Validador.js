'use strict';

/**
 * @file Validador fluente de payloads. Acumula erros por campo e lança AppError 422 ao final.
 *
 * @example
 * const dados = new Validador(body)
 *   .texto('nome', { max: 100 })
 *   .numero('valor', { min: 0, minExclusivo: true })
 *   .resultado();
 */

const AppError = require('./AppError');
const { isDataValida } = require('./dates');
const { normalizarDocumento } = require('./documentos');

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class Validador {
  /**
   * @param {object} payload Corpo da requisição.
   * @param {{parcial?: boolean}} [opcoes] Em modo parcial (atualização), campos ausentes são ignorados.
   */
  constructor(payload, { parcial = false } = {}) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw AppError.badRequest('Corpo da requisição inválido (esperado um objeto JSON)');
    }
    this.p = payload;
    this.parcial = parcial;
    this.erros = {};
    this.dados = {};
  }

  /** @private */
  _ausente(campo, obrigatorio) {
    const v = this.p[campo];
    if (v !== undefined && v !== null && v !== '') return false;
    if (obrigatorio && !this.parcial) this.erros[campo] = 'Campo obrigatório';
    return true;
  }

  texto(campo, { obrigatorio = true, min = 1, max = 255 } = {}) {
    if (this._ausente(campo, obrigatorio)) return this;
    const v = this.p[campo];
    if (typeof v !== 'string') this.erros[campo] = 'Deve ser um texto';
    else if (v.trim().length < min) this.erros[campo] = `Mínimo de ${min} caractere(s)`;
    else if (v.trim().length > max) this.erros[campo] = `Máximo de ${max} caracteres`;
    else this.dados[campo] = v.trim();
    return this;
  }

  senha(campo, { obrigatorio = true } = {}) {
    if (this._ausente(campo, obrigatorio)) return this;
    const v = this.p[campo];
    if (typeof v !== 'string' || v.length < 8) this.erros[campo] = 'A senha deve ter ao menos 8 caracteres';
    else if (v.length > 72) this.erros[campo] = 'A senha deve ter no máximo 72 caracteres';
    else this.dados[campo] = v;
    return this;
  }

  email(campo, { obrigatorio = true } = {}) {
    if (this._ausente(campo, obrigatorio)) return this;
    const v = this.p[campo];
    if (typeof v !== 'string' || !RE_EMAIL.test(v.trim()) || v.length > 254) this.erros[campo] = 'E-mail inválido';
    else this.dados[campo] = v.trim().toLowerCase();
    return this;
  }

  documento(campo, { obrigatorio = true } = {}) {
    if (this._ausente(campo, obrigatorio)) return this;
    const doc = normalizarDocumento(this.p[campo]);
    if (!doc) this.erros[campo] = 'CPF/CNPJ inválido';
    else this.dados[campo] = doc;
    return this;
  }

  numero(campo, { obrigatorio = true, min, max, minExclusivo = false, padrao, mensagemMax } = {}) {
    if (this._ausente(campo, obrigatorio)) {
      if (padrao !== undefined && !(campo in this.dados)) this.dados[campo] = padrao;
      return this;
    }
    const v = this.p[campo];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) this.erros[campo] = 'Deve ser um número';
    else if (min !== undefined && (minExclusivo ? n <= min : n < min)) {
      this.erros[campo] = minExclusivo ? `Deve ser maior que ${min}` : `Deve ser maior ou igual a ${min}`;
    } else if (max !== undefined && n > max) this.erros[campo] = mensagemMax || `Deve ser menor ou igual a ${max}`;
    else this.dados[campo] = n;
    return this;
  }

  inteiro(campo, opcoes = {}) {
    this.numero(campo, opcoes);
    if (campo in this.dados && !Number.isInteger(this.dados[campo])) {
      this.erros[campo] = 'Deve ser um número inteiro';
      delete this.dados[campo];
    }
    return this;
  }

  enum(campo, valores, { obrigatorio = true, padrao } = {}) {
    if (this._ausente(campo, obrigatorio)) {
      if (padrao !== undefined) this.dados[campo] = padrao;
      return this;
    }
    if (!valores.includes(this.p[campo])) this.erros[campo] = `Valor inválido. Use: ${valores.join(', ')}`;
    else this.dados[campo] = this.p[campo];
    return this;
  }

  data(campo, { obrigatorio = true } = {}) {
    if (this._ausente(campo, obrigatorio)) return this;
    if (!isDataValida(this.p[campo])) this.erros[campo] = 'Data inválida (use AAAA-MM-DD)';
    else this.dados[campo] = this.p[campo];
    return this;
  }

  booleano(campo, { obrigatorio = true, padrao } = {}) {
    const v = this.p[campo];
    if (v === undefined || v === null) {
      if (padrao !== undefined) this.dados[campo] = padrao;
      else if (obrigatorio && !this.parcial) this.erros[campo] = 'Campo obrigatório';
      return this;
    }
    if (typeof v !== 'boolean') this.erros[campo] = 'Deve ser verdadeiro ou falso';
    else this.dados[campo] = v;
    return this;
  }

  /** Registra um erro manual. */
  erro(campo, mensagem) {
    this.erros[campo] = mensagem;
    return this;
  }

  /**
   * @returns {object} Dados saneados.
   * @throws {AppError} 422 com erros por campo.
   */
  resultado() {
    if (Object.keys(this.erros).length > 0) throw AppError.validation('Dados inválidos', this.erros);
    return this.dados;
  }
}

module.exports = Validador;
