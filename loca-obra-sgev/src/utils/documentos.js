'use strict';

/**
 * @file Validação de CPF e CNPJ (dígitos verificadores).
 */

/** @param {string} valor @returns {string} Apenas dígitos. */
function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** @param {string} cpf Apenas dígitos. @returns {boolean} */
function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (tamanho) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

/** @param {string} cnpj Apenas dígitos. @returns {boolean} */
function cnpjValido(cnpj) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (pesos) => {
    const soma = pesos.reduce((acc, peso, i) => acc + Number(cnpj[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  return dv(p1) === Number(cnpj[12]) && dv(p2) === Number(cnpj[13]);
}

/**
 * @param {string} valor CPF/CNPJ com ou sem máscara.
 * @returns {string|null} Documento normalizado (só dígitos) ou null se inválido.
 */
function normalizarDocumento(valor) {
  const d = somenteDigitos(valor);
  if (d.length === 11 && cpfValido(d)) return d;
  if (d.length === 14 && cnpjValido(d)) return d;
  return null;
}

module.exports = { somenteDigitos, cpfValido, cnpjValido, normalizarDocumento };
