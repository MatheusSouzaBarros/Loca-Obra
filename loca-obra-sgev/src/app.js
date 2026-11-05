'use strict';

/**
 * @file Montagem da aplicação Express (sem abrir porta — facilita testes).
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const routes = require('./routes');
const { naoEncontrado, errorHandler } = require('./middlewares/errorHandler');

/**
 * @returns {import('express').Express}
 */
function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', routes, naoEncontrado);

  // Frontend estático (SPA com roteamento por hash).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(errorHandler);
  return app;
}

module.exports = criarApp;
