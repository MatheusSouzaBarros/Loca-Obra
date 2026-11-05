'use strict';

const ContratoService = require('../services/ContratoService');
const { idParam } = require('../utils/params');

/** Endpoints do ciclo de vida de contratos. */
const ContratoController = {
  listar: (req, res) => res.json(ContratoService.listar(req.usuario, req.query)),
  obter: (req, res) => res.json(ContratoService.obter(idParam(req), req.usuario)),
  criar: (req, res) => res.status(201).json(ContratoService.criarReserva(req.usuario, req.body)),
  retirar: (req, res) => res.json(ContratoService.retirar(idParam(req), req.body)),
  devolver: (req, res) => res.json(ContratoService.devolver(idParam(req), req.body)),
  vistoriar: (req, res) => res.status(201).json(ContratoService.registrarVistoria(idParam(req), req.body)),
  liquidacao: (req, res) => res.json(ContratoService.simularLiquidacao(idParam(req), req.query)),
  encerrar: (req, res) => res.json(ContratoService.encerrar(idParam(req), req.body)),
};

module.exports = ContratoController;
