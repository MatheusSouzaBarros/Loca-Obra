'use strict';

const ContratoRepository = require('../repositories/ContratoRepository');
const ItemRepository = require('../repositories/ItemRepository');
const CategoriaRepository = require('../repositories/CategoriaRepository');
const CaucaoService = require('./CaucaoService');
const { STATUS_ITEM } = require('../models/Item');
const Validador = require('../utils/Validador');
const AppError = require('../utils/AppError');
const { diffDias, hoje, addDias } = require('../utils/dates');
const { fromCents, toCents } = require('../utils/money');

/**
 * Consulta e validação de disponibilidade futura (checagem de sobreposição).
 */
const DisponibilidadeService = {
  /**
   * Quantidade de contratos que conflitam com [inicio, fim] para o item.
   * Delegado ao repositório, que aplica a fórmula obrigatória de sobreposição.
   * @param {number} itemId
   * @param {string} inicio
   * @param {string} fim
   * @returns {number}
   */
  contarConflitos(itemId, inicio, fim) {
    return ContratoRepository.contarConflitos(itemId, inicio, fim);
  },

  /**
   * @param {number} itemId
   * @param {string} inicio
   * @param {string} fim
   * @returns {boolean} true se o item não tem conflito de agenda no intervalo.
   */
  itemEstaLivre(itemId, inicio, fim) {
    return this.contarConflitos(itemId, inicio, fim) === 0;
  },

  /**
   * Lista os itens com a disponibilidade para o período informado.
   * @param {{inicio?:string, fim?:string, categoria_id?:string|number}} query
   * @returns {{periodo:{inicio:string,fim:string,dias:number}, total:number, disponiveis:number, itens:object[]}}
   */
  consultar(query) {
    const v = new Validador(query ?? {})
      .data('inicio')
      .data('fim')
      .inteiro('categoria_id', { obrigatorio: false, min: 1 });
    const { inicio, fim } = v.dados;
    if (inicio && fim) {
      if (fim <= inicio) v.erro('fim', 'A devolução deve ser estritamente posterior à retirada');
      if (inicio < hoje()) v.erro('inicio', 'A consulta considera apenas datas futuras (a partir de hoje)');
    }
    const { categoria_id } = v.resultado();

    const dias = Math.max(1, diffDias(inicio, fim));
    const conflitos = ItemRepository.conflitosPorItem(inicio, fim);

    const itens = ItemRepository.list({ categoria_id }).map((item) => {
      const emManutencao = item.status === STATUS_ITEM.EM_MANUTENCAO;
      const ocupado = (conflitos.get(item.id) ?? 0) > 0;
      return {
        id: item.id,
        numero_patrimonio: item.numero_patrimonio,
        nome: item.nome,
        categoria_id: item.categoria_id,
        categoria_nome: item.categoria_nome,
        valor_item: item.valor_item,
        status_atual: item.status,
        disponivel: !emManutencao && !ocupado,
        motivo_indisponibilidade: emManutencao ? 'Em manutenção' : ocupado ? 'Já reservado no período' : null,
        valor_diaria: item.valor_diaria_base,
        total_estimado: fromCents(dias * toCents(item.valor_diaria_base)),
        caucao_estimado: CaucaoService.calcularCaucao(item.valor_item, item.percentual_caucao_base),
      };
    });

    return {
      periodo: { inicio, fim, dias },
      total: itens.length,
      disponiveis: itens.filter((i) => i.disponivel).length,
      itens,
    };
  },

  /**
   * Agenda futura de um item (períodos comprometidos), sem dados de clientes.
   * @param {number} itemId
   * @returns {{item_id:number, a_partir_de:string, periodos:object[]}}
   */
  agenda(itemId) {
    const item = ItemRepository.findById(itemId);
    if (!item) throw AppError.notFound('Item não encontrado');
    const aPartirDe = addDias(hoje(), -1);
    return {
      item_id: item.id,
      a_partir_de: aPartirDe,
      periodos: ItemRepository.agenda(itemId, aPartirDe).map((p) => ({
        inicio: p.data_retirada_prevista,
        fim: p.data_devolucao_prevista,
        status: p.status,
      })),
    };
  },
};

module.exports = DisponibilidadeService;
