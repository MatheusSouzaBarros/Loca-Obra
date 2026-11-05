'use strict';

const { emTransacao } = require('../config/database');
const ContratoRepository = require('../repositories/ContratoRepository');
const ItemRepository = require('../repositories/ItemRepository');
const ClienteRepository = require('../repositories/ClienteRepository');
const VistoriaRepository = require('../repositories/VistoriaRepository');
const CaucaoService = require('./CaucaoService');
const DisponibilidadeService = require('./DisponibilidadeService');
const { Contrato, STATUS_CONTRATO, LISTA_STATUS_CONTRATO } = require('../models/Contrato');
const { STATUS_ITEM } = require('../models/Item');
const { Vistoria, TIPOS_VISTORIA } = require('../models/Vistoria');
const { ROLES } = require('../models/Usuario');
const Validador = require('../utils/Validador');
const AppError = require('../utils/AppError');
const { hoje, diffDias, agoraISO } = require('../utils/dates');
const { fromCents, toCents } = require('../utils/money');

const ehEquipe = (usuario) => usuario.role === ROLES.ATENDENTE || usuario.role === ROLES.ADMIN;

/**
 * Lógica de negócio do ciclo de vida do contrato:
 * Reservado -> Retirado -> (Devolvido | Em Atraso) -> Vistoriado -> (Encerrado | Encerrado com avaria).
 */
const ContratoService = {
  /**
   * Promove a "Em Atraso" os contratos em campo com devolução vencida.
   * Chamado antes de listagens e transições para manter os status coerentes sem job externo.
   * @returns {number}
   */
  atualizarAtrasos() {
    return ContratoRepository.marcarAtrasados(hoje());
  },

  /**
   * Acrescenta campos calculados (dias, valores previstos, atraso corrente) ao contrato.
   * @param {Contrato} c
   * @returns {object}
   */
  enriquecer(c) {
    const diasPrevistos = Math.max(1, diffDias(c.data_retirada_prevista, c.data_devolucao_prevista));
    const emCampo = !c.data_devolucao_real && [STATUS_CONTRATO.RETIRADO, STATUS_CONTRATO.EM_ATRASO].includes(c.status);
    const diasAtraso = c.data_devolucao_real
      ? CaucaoService.diasAtraso(c.data_devolucao_prevista, c.data_devolucao_real)
      : emCampo
        ? CaucaoService.diasAtraso(c.data_devolucao_prevista, hoje())
        : 0;
    return {
      ...c,
      dias_previstos: diasPrevistos,
      valor_total_previsto: fromCents(diasPrevistos * toCents(c.valor_diaria)),
      caucao_estimado: c.valor_caucao_retido > 0
        ? c.valor_caucao_retido
        : CaucaoService.calcularCaucao(c.valor_item, c.percentual_caucao_base),
      dias_atraso: diasAtraso,
      multa_acumulada: c.data_devolucao_real ? c.valor_multa : CaucaoService.calcularMulta(diasAtraso, c.valor_diaria),
    };
  },

  /** @private Carrega o contrato (404 se não existir) e valida visibilidade para o usuário. */
  _carregar(id, usuario) {
    const contrato = ContratoRepository.findById(id);
    if (!contrato) throw AppError.notFound('Contrato não encontrado');
    if (usuario && !ehEquipe(usuario) && contrato.cliente_usuario_id !== usuario.id) {
      // 404 (e não 403) para não revelar a existência de contratos de terceiros.
      throw AppError.notFound('Contrato não encontrado');
    }
    return contrato;
  },

  /**
   * Lista contratos. Clientes enxergam apenas os próprios.
   * @param {import('../models/Usuario').Usuario} usuario
   * @param {{status?:string,item_id?:string|number,cliente_id?:string|number}} query
   * @returns {object[]}
   */
  listar(usuario, query = {}) {
    this.atualizarAtrasos();
    const filtros = new Validador(query, { parcial: true })
      .enum('status', LISTA_STATUS_CONTRATO)
      .inteiro('item_id', { min: 1 })
      .inteiro('cliente_id', { min: 1 })
      .resultado();
    if (!ehEquipe(usuario)) {
      const cliente = ClienteRepository.findByUsuarioId(usuario.id);
      if (!cliente) return [];
      filtros.cliente_id = cliente.id;
    }
    return ContratoRepository.list(filtros).map((c) => this.enriquecer(c));
  },

  /**
   * Detalhe do contrato com vistorias.
   * @param {number} id
   * @param {import('../models/Usuario').Usuario} usuario
   */
  obter(id, usuario) {
    this.atualizarAtrasos();
    const contrato = this._carregar(id, usuario);
    return { ...this.enriquecer(contrato), vistorias: VistoriaRepository.listByContrato(id) };
  },

  /**
   * Cria uma reserva validando disponibilidade. A checagem e a inserção ocorrem na mesma
   * transação; o trigger do banco é a última barreira contra double booking.
   * @param {import('../models/Usuario').Usuario} usuario
   * @param {object} payload {item_id, data_retirada_prevista, data_devolucao_prevista, cliente_id?}
   * @returns {object}
   */
  criarReserva(usuario, payload) {
    const dados = Contrato.validarReserva(payload);

    let cliente;
    if (usuario.role === ROLES.CLIENTE) {
      cliente = ClienteRepository.findByUsuarioId(usuario.id);
      if (!cliente) throw AppError.conflict('Seu usuário não possui cadastro de cliente', 'CLIENTE_INEXISTENTE');
    } else {
      if (!dados.cliente_id) throw AppError.validation('Dados inválidos', { cliente_id: 'Informe o cliente da locação' });
      cliente = ClienteRepository.findById(dados.cliente_id);
      if (!cliente) throw AppError.notFound('Cliente não encontrado');
    }

    const item = ItemRepository.findById(dados.item_id);
    if (!item) throw AppError.notFound('Item não encontrado');
    if (item.status === STATUS_ITEM.EM_MANUTENCAO) {
      throw AppError.conflict('Item em manutenção: não pode ser reservado', 'ITEM_EM_MANUTENCAO');
    }

    const criado = emTransacao(() => {
      const conflitos = DisponibilidadeService.contarConflitos(
        item.id,
        dados.data_retirada_prevista,
        dados.data_devolucao_prevista,
      );
      if (conflitos > 0) {
        throw AppError.conflict('Item indisponível: já existe reserva/contrato no período solicitado', 'CONFLITO_AGENDA');
      }
      return ContratoRepository.create({
        cliente_id: cliente.id,
        item_id: item.id,
        data_reserva: agoraISO(),
        data_retirada_prevista: dados.data_retirada_prevista,
        data_devolucao_prevista: dados.data_devolucao_prevista,
        valor_diaria: item.valor_diaria_base, // snapshot: mudanças futuras da categoria não alteram contratos existentes
        status: STATUS_CONTRATO.RESERVADO,
      });
    });
    return this.enriquecer(criado);
  },

  /**
   * Check-out: Reservado -> Retirado. Calcula e retém o caução (valor_item * percentual_caucao_base).
   * @param {number} id
   * @param {object} payload {data_retirada_real?, vistoria_entrada?: {tem_avaria?, observacoes?}}
   */
  retirar(id, payload = {}) {
    this.atualizarAtrasos();
    const dados = new Validador(payload ?? {}).data('data_retirada_real', { obrigatorio: false }).resultado();
    const entrada = payload?.vistoria_entrada ? Vistoria.validarEntrada(payload.vistoria_entrada) : null;

    return emTransacao(() => {
      const contrato = this._carregar(id);
      if (contrato.status !== STATUS_CONTRATO.RESERVADO) {
        throw AppError.conflict(`Só é possível retirar contratos "Reservado" (status atual: ${contrato.status})`, 'STATUS_INVALIDO');
      }
      const dataReal = dados.data_retirada_real ?? hoje();
      if (dataReal > hoje()) throw AppError.validation('Dados inválidos', { data_retirada_real: 'Não pode ser futura' });
      if (dataReal < contrato.data_retirada_prevista) {
        throw AppError.conflict(`Retirada antes da data prevista (${contrato.data_retirada_prevista}) não é permitida`, 'RETIRADA_ANTECIPADA');
      }
      const item = ItemRepository.findById(contrato.item_id);
      if (item.status !== STATUS_ITEM.DISPONIVEL) {
        throw AppError.conflict(`Item indisponível para retirada (situação: ${item.status})`, 'ITEM_INDISPONIVEL');
      }

      const caucao = CaucaoService.calcularCaucao(item.valor_item, item.percentual_caucao_base);
      ItemRepository.update(item.id, { status: STATUS_ITEM.EM_USO });
      if (entrada) {
        VistoriaRepository.create({ contrato_id: id, tipo: TIPOS_VISTORIA.ENTRADA, data_vistoria: agoraISO(), ...entrada });
      }
      const atualizado = ContratoRepository.atualizar(id, {
        status: STATUS_CONTRATO.RETIRADO,
        data_retirada_real: dataReal,
        valor_caucao_retido: caucao,
      });
      return this.enriquecer(atualizado);
    });
  },

  /**
   * Check-in: registra a devolução. Atrasado => "Em Atraso" + multa (dias_atraso * valor_diaria);
   * no prazo => "Devolvido". O item segue "Em Uso" até a vistoria/encerramento.
   * @param {number} id
   * @param {object} payload {data_devolucao_real?}
   */
  devolver(id, payload = {}) {
    this.atualizarAtrasos();
    const dados = new Validador(payload ?? {}).data('data_devolucao_real', { obrigatorio: false }).resultado();

    return emTransacao(() => {
      const contrato = this._carregar(id);
      const emCampo = [STATUS_CONTRATO.RETIRADO, STATUS_CONTRATO.EM_ATRASO].includes(contrato.status);
      if (!emCampo || contrato.data_devolucao_real) {
        throw AppError.conflict(`Só é possível devolver contratos em campo (status atual: ${contrato.status})`, 'STATUS_INVALIDO');
      }
      const dataReal = dados.data_devolucao_real ?? hoje();
      if (dataReal > hoje()) throw AppError.validation('Dados inválidos', { data_devolucao_real: 'Não pode ser futura' });
      if (dataReal < contrato.data_retirada_real) {
        throw AppError.validation('Dados inválidos', { data_devolucao_real: 'Anterior à retirada real' });
      }

      const diasAtraso = CaucaoService.diasAtraso(contrato.data_devolucao_prevista, dataReal);
      const atrasado = diasAtraso > 0;
      const atualizado = ContratoRepository.atualizar(id, {
        data_devolucao_real: dataReal,
        status: atrasado ? STATUS_CONTRATO.EM_ATRASO : STATUS_CONTRATO.DEVOLVIDO,
        valor_multa: atrasado ? CaucaoService.calcularMulta(diasAtraso, contrato.valor_diaria) : 0,
      });
      return this.enriquecer(atualizado);
    });
  },

  /**
   * Vistoria técnica de saída. Registra avarias e move o contrato para "Vistoriado".
   * @param {number} id
   * @param {object} payload {tem_avaria, custo_avaria?, observacoes?}
   */
  registrarVistoria(id, payload) {
    const dados = Vistoria.validarSaida(payload);
    return emTransacao(() => {
      const contrato = this._carregar(id);
      const devolvido = [STATUS_CONTRATO.DEVOLVIDO, STATUS_CONTRATO.EM_ATRASO].includes(contrato.status) && contrato.data_devolucao_real;
      if (!devolvido) {
        throw AppError.conflict(`A vistoria de saída exige o equipamento devolvido (status atual: ${contrato.status})`, 'STATUS_INVALIDO');
      }
      const vistoria = VistoriaRepository.create({
        contrato_id: id,
        tipo: TIPOS_VISTORIA.SAIDA,
        data_vistoria: agoraISO(),
        ...dados,
      });
      const atualizado = ContratoRepository.atualizar(id, { status: STATUS_CONTRATO.VISTORIADO });
      return { contrato: this.enriquecer(atualizado), vistoria };
    });
  },

  /**
   * Simula a liquidação (sem gravar), usada pela tela para mostrar o abatimento em tempo real.
   * @param {number} id
   * @param {{custo_avaria?:string|number, descontar_multa?:string|boolean}} query
   */
  simularLiquidacao(id, query = {}) {
    this.atualizarAtrasos();
    const contrato = this._carregar(id);
    const v = new Validador(query, { parcial: true }).numero('custo_avaria', { min: 0 }).resultado();
    const descontar = query.descontar_multa === undefined ? true : ['true', '1', true].includes(query.descontar_multa);
    const posDevolucao = contrato.data_devolucao_real
      ? contrato.valor_multa
      : CaucaoService.calcularMulta(CaucaoService.diasAtraso(contrato.data_devolucao_prevista, hoje()), contrato.valor_diaria);
    const caucao = contrato.valor_caucao_retido > 0
      ? contrato.valor_caucao_retido
      : CaucaoService.calcularCaucao(contrato.valor_item, contrato.percentual_caucao_base);
    return CaucaoService.calcularLiquidacao({
      caucaoRetido: caucao,
      custoAvaria: v.custo_avaria ?? 0,
      multa: posDevolucao,
      descontarMulta: descontar,
    });
  },

  /**
   * Encerramento financeiro: Vistoriado -> Encerrado | Encerrado com avaria.
   * Sem avaria e sem multa descontada, devolve 100% do caução.
   * @param {number} id
   * @param {{descontar_multa?:boolean}} payload
   */
  encerrar(id, payload = {}) {
    const { descontar_multa } = new Validador(payload ?? {}).booleano('descontar_multa', { obrigatorio: false, padrao: true }).resultado();

    return emTransacao(() => {
      const contrato = this._carregar(id);
      if (contrato.status !== STATUS_CONTRATO.VISTORIADO) {
        throw AppError.conflict(`Só é possível encerrar contratos "Vistoriado" (status atual: ${contrato.status})`, 'STATUS_INVALIDO');
      }
      const vistoria = VistoriaRepository.findByContratoTipo(id, TIPOS_VISTORIA.SAIDA);
      const liquidacao = CaucaoService.calcularLiquidacao({
        caucaoRetido: contrato.valor_caucao_retido,
        custoAvaria: vistoria.custo_avaria,
        multa: contrato.valor_multa,
        descontarMulta: descontar_multa,
      });

      const comAvaria = vistoria.tem_avaria;
      ItemRepository.update(contrato.item_id, {
        status: comAvaria ? STATUS_ITEM.EM_MANUTENCAO : STATUS_ITEM.DISPONIVEL,
      });
      const atualizado = ContratoRepository.atualizar(id, {
        status: comAvaria ? STATUS_CONTRATO.ENCERRADO_AVARIA : STATUS_CONTRATO.ENCERRADO,
        valor_caucao_devolvido: liquidacao.saldo_devolvido,
        valor_cobranca_adicional: fromCents(toCents(liquidacao.cobranca_adicional) + toCents(liquidacao.multa_a_cobrar_a_parte)),
        multa_descontada: descontar_multa && contrato.valor_multa > 0,
        data_encerramento: agoraISO(),
      });
      return { contrato: this.enriquecer(atualizado), liquidacao };
    });
  },
};

module.exports = ContratoService;
