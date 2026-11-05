'use strict';

/**
 * @file Utilitários de data. Datas de negócio (retirada/devolução) são "YYYY-MM-DD" (locação por diária),
 * o que permite comparação lexicográfica segura e devolução/retirada no mesmo dia.
 */

const env = require('../config/env');

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * @param {unknown} valor
 * @returns {boolean} true se for uma data real no formato YYYY-MM-DD.
 */
function isDataValida(valor) {
  if (typeof valor !== 'string') return false;
  const m = RE_DATA.exec(valor);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Data de hoje (YYYY-MM-DD) no fuso configurado.
 * @returns {string}
 */
function hoje() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Diferença em dias inteiros (ate - de).
 * @param {string} de YYYY-MM-DD
 * @param {string} ate YYYY-MM-DD
 * @returns {number}
 */
function diffDias(de, ate) {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  return Math.round((b - a) / MS_DIA);
}

/**
 * Soma dias a uma data.
 * @param {string} data YYYY-MM-DD
 * @param {number} n
 * @returns {string}
 */
function addDias(data, n) {
  const d = new Date(Date.parse(`${data}T00:00:00Z`) + n * MS_DIA);
  return d.toISOString().slice(0, 10);
}

/** @returns {string} Timestamp ISO atual. */
function agoraISO() {
  return new Date().toISOString();
}

module.exports = { isDataValida, hoje, diffDias, addDias, agoraISO };
