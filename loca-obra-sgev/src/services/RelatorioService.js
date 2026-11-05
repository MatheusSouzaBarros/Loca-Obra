'use strict';

const RelatorioRepository = require('../repositories/RelatorioRepository');
const ContratoRepository = require('../repositories/ContratoRepository');
const ClienteRepository = require('../repositories/ClienteRepository');
const ContratoService = require('./ContratoService');
const { ROLES } = require('../models/Usuario');
const { hoje } = require('../utils/dates');
const { fromCents, toCents } = require('../utils/money');

/**
 * Dashboards e relatórios (operacionais e financeiros).
 */
const RelatorioService = {
  /**
   * Dashboard por perfil: equipe vê métricas globais; cliente vê apenas as próprias.
   * @param {import('../models/Usuario').Usuario} usuario
   */
  dashboard(usuario) {
    ContratoService.atualizarAtrasos();
    if (usuario.role === ROLES.CLIENTE) {
      const cliente = ClienteRepository.findByUsuarioId(usuario.id);
      return {
        escopo: 'cliente',
        gerado_em: hoje(),
        metricas: RelatorioRepository.metricasOperacionais(cliente ? cliente.id : -1),
      };
    }
    const resultado = {
      escopo: 'global',
      gerado_em: hoje(),
      metricas: RelatorioRepository.metricasOperacionais(),
      frota_por_status: RelatorioRepository.frotaPorStatus(),
      alertas_atraso: ContratoRepository.emAtraso().slice(0, 8).map((c) => ContratoService.enriquecer(c)),
    };
    return resultado;
  },

  /** Contratos com caução retido (pendências de liquidação), com total. */
  pendenciasCaucao() {
    ContratoService.atualizarAtrasos();
    const contratos = ContratoRepository.pendenciasCaucao().map((c) => ContratoService.enriquecer(c));
    const total = contratos.reduce((acc, c) => acc + toCents(c.valor_caucao_retido), 0);
    return { total_retido: fromCents(total), quantidade: contratos.length, contratos };
  },

  /** Contratos em atraso, com multa acumulada. */
  atrasos() {
    ContratoService.atualizarAtrasos();
    const contratos = ContratoRepository.emAtraso().map((c) => ContratoService.enriquecer(c));
    const multa = contratos.reduce((acc, c) => acc + toCents(c.multa_acumulada), 0);
    return { quantidade: contratos.length, multa_acumulada_total: fromCents(multa), contratos };
  },

  /** Relatório financeiro (ADMIN). */
  financeiro() {
    ContratoService.atualizarAtrasos();
    return { geral: RelatorioRepository.financeiroGeral(), por_categoria: RelatorioRepository.financeiroPorCategoria() };
  },

  /** Relatório de frota (ADMIN). */
  frota() {
    const porCategoria = RelatorioRepository.frotaPorCategoria().map((c) => ({
      ...c,
      taxa_utilizacao: c.total ? Math.round((c.em_uso / c.total) * 1000) / 10 : 0,
    }));
    return { por_status: RelatorioRepository.frotaPorStatus(), por_categoria: porCategoria };
  },
};

module.exports = RelatorioService;
