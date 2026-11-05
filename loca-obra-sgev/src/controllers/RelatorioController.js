'use strict';

const RelatorioService = require('../services/RelatorioService');

/** Dashboards e relatórios. */
const RelatorioController = {
  dashboard: (req, res) => res.json(RelatorioService.dashboard(req.usuario)),
  pendenciasCaucao: (_req, res) => res.json(RelatorioService.pendenciasCaucao()),
  atrasos: (_req, res) => res.json(RelatorioService.atrasos()),
  financeiro: (_req, res) => res.json(RelatorioService.financeiro()),
  frota: (_req, res) => res.json(RelatorioService.frota()),
};

module.exports = RelatorioController;
