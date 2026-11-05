'use strict';

/**
 * @file Carrega e valida as variáveis de ambiente da aplicação.
 * Usa o carregador nativo do Node (process.loadEnvFile) quando existe um arquivo .env.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

/**
 * @param {string|undefined} valor
 * @param {boolean} padrao
 * @returns {boolean}
 */
function bool(valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  return ['1', 'true', 'yes', 'sim'].includes(String(valor).toLowerCase());
}

const DEV_SECRET = 'dev-only-secret-nao-use-em-producao';
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET é obrigatório em produção e deve ter pelo menos 32 caracteres.');
}

/**
 * Configuração imutável da aplicação.
 * @type {Readonly<{
 *  rootDir: string, nodeEnv: string, isProduction: boolean, port: number, dbPath: string,
 *  jwtSecret: string, jwtExpiresIn: string, bcryptRounds: number, timezone: string,
 *  allowRoleSelection: boolean, seedDemo: boolean
 * }>}
 */
const env = Object.freeze({
  rootDir: ROOT,
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 3000,
  dbPath:
    process.env.DB_PATH === ':memory:'
      ? ':memory:'
      : path.resolve(ROOT, process.env.DB_PATH || 'data/locaobra.db'),
  jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  timezone: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
  // Seletor de perfil no cadastro existe para testes; em produção fica desligado por padrão.
  allowRoleSelection: bool(process.env.ALLOW_ROLE_SELECTION, !isProduction),
  seedDemo: bool(process.env.SEED_DEMO, !isProduction),
});

module.exports = env;
