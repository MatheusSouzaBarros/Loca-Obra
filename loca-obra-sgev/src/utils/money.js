'use strict';

/**
 * @file Aritmética monetária em centavos inteiros, para evitar erros de ponto flutuante.
 */

/** @param {number|string} valor Reais. @returns {number} Centavos inteiros. */
const toCents = (valor) => Math.round(Number(valor) * 100);

/** @param {number} centavos @returns {number} Reais com 2 casas. */
const fromCents = (centavos) => centavos / 100;

/** @param {number|string} valor @returns {number} Valor arredondado a 2 casas. */
const round2 = (valor) => fromCents(toCents(valor));

module.exports = { toCents, fromCents, round2 };
