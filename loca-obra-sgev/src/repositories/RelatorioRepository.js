'use strict';

const { db } = require('../config/database');
const { STATUS_CAUCAO_RETIDO, STATUS_ENCERRADOS } = require('../models/Contrato');

/**
 * Converte uma lista de constantes internas (nunca entrada do usuário) em literais SQL: 'a','b'.
 * @param {readonly string[]} lista
 * @returns {string}
 */
const literais = (lista) => lista.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

const SQL_RETIDO = literais(STATUS_CAUCAO_RETIDO);
const SQL_ENCERRADOS = literais(STATUS_ENCERRADOS);

/** Dias contratados (mínimo 1) — base de cobrança da diária. */
const DIAS_PREVISTOS = 'MAX(1, julianday(c.data_devolucao_prevista) - julianday(c.data_retirada_prevista))';

/**
 * Consultas agregadas para dashboards e relatórios.
 */
const RelatorioRepository = {
  /**
   * Métricas operacionais globais (equipe) ou restritas a um cliente.
   * @param {number} [clienteId]
   */
  metricasOperacionais(clienteId) {
    const filtro = clienteId ? 'AND c.cliente_id = @clienteId' : '';
    const params = clienteId ? { clienteId } : {};
    const um = (sql) => db.prepare(sql).get(params);
    return {
      contratos_ativos: um(
        `SELECT COUNT(*) AS n FROM contratos c
         WHERE c.status IN ('Retirado','Em Atraso') AND c.data_devolucao_real IS NULL ${filtro}`,
      ).n,
      reservas_futuras: um(`SELECT COUNT(*) AS n FROM contratos c WHERE c.status = 'Reservado' ${filtro}`).n,
      total_caucao_retido: um(
        `SELECT COALESCE(SUM(c.valor_caucao_retido), 0) AS v FROM contratos c
         WHERE c.status IN (${SQL_RETIDO}) ${filtro}`,
      ).v,
      contratos_em_atraso: um(`SELECT COUNT(*) AS n FROM contratos c WHERE c.status = 'Em Atraso' ${filtro}`).n,
      aguardando_vistoria: um(
        `SELECT COUNT(*) AS n FROM contratos c
         WHERE c.status IN ('Devolvido','Em Atraso') AND c.data_devolucao_real IS NOT NULL ${filtro}`,
      ).n,
      encerrados: um(`SELECT COUNT(*) AS n FROM contratos c WHERE c.status IN (${SQL_ENCERRADOS}) ${filtro}`).n,
    };
  },

  /** @returns {Array<{status:string,total:number}>} Itens agrupados por status. */
  frotaPorStatus() {
    return db.prepare('SELECT status, COUNT(*) AS total FROM itens GROUP BY status').all();
  },

  /** @returns {Array<object>} Frota agrupada por categoria e status. */
  frotaPorCategoria() {
    return db
      .prepare(
        `SELECT cat.id AS categoria_id, cat.nome AS categoria,
                COUNT(i.id) AS total,
                COALESCE(SUM(i.status = 'Disponível'), 0) AS disponiveis,
                COALESCE(SUM(i.status = 'Em Uso'), 0) AS em_uso,
                COALESCE(SUM(i.status = 'Em Manutenção'), 0) AS em_manutencao,
                COALESCE(SUM(i.valor_item), 0) AS valor_patrimonial
         FROM categorias cat LEFT JOIN itens i ON i.categoria_id = cat.id
         GROUP BY cat.id ORDER BY cat.nome`,
      )
      .all();
  },

  /** @returns {object} Totais financeiros de contratos encerrados e caução retido. */
  financeiroGeral() {
    const totais = db
      .prepare(
        `SELECT COUNT(*) AS contratos_encerrados,
                COALESCE(SUM(c.valor_diaria * ${DIAS_PREVISTOS}), 0) AS receita_diarias,
                COALESCE(SUM(c.valor_multa), 0) AS multas_aplicadas,
                COALESCE(SUM(c.valor_caucao_devolvido), 0) AS caucao_devolvido,
                COALESCE(SUM(c.valor_cobranca_adicional), 0) AS cobrancas_adicionais
         FROM contratos c WHERE c.status IN (${SQL_ENCERRADOS})`,
      )
      .get();
    const avarias = db
      .prepare(
        `SELECT COALESCE(SUM(v.custo_avaria), 0) AS avarias_cobradas
         FROM vistorias v JOIN contratos c ON c.id = v.contrato_id
         WHERE v.tipo = 'Saída' AND c.status IN (${SQL_ENCERRADOS})`,
      )
      .get();
    const retido = db
      .prepare(
        `SELECT COALESCE(SUM(c.valor_caucao_retido), 0) AS caucao_retido_atual
         FROM contratos c WHERE c.status IN (${SQL_RETIDO})`,
      )
      .get();
    return { ...totais, ...avarias, ...retido };
  },

  /** @returns {Array<object>} Receita e volume por categoria (contratos encerrados). */
  financeiroPorCategoria() {
    return db
      .prepare(
        `SELECT cat.nome AS categoria,
                COUNT(c.id) AS contratos,
                COALESCE(SUM(c.valor_diaria * ${DIAS_PREVISTOS}), 0) AS receita_diarias,
                COALESCE(SUM(c.valor_multa), 0) AS multas
         FROM categorias cat
         LEFT JOIN itens i ON i.categoria_id = cat.id
         LEFT JOIN contratos c ON c.item_id = i.id AND c.status IN (${SQL_ENCERRADOS})
         GROUP BY cat.id ORDER BY cat.nome`,
      )
      .all();
  },
};

module.exports = RelatorioRepository;
