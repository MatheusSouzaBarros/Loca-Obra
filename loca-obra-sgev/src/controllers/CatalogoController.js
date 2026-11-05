'use strict';

const CategoriaService = require('../services/CategoriaService');
const ItemService = require('../services/ItemService');
const DisponibilidadeService = require('../services/DisponibilidadeService');
const { idParam } = require('../utils/params');

/** Categorias, itens e consulta de disponibilidade. */
const CatalogoController = {
  // --- Categorias ---
  listarCategorias: (_req, res) => res.json(CategoriaService.listar()),
  obterCategoria: (req, res) => res.json(CategoriaService.obter(idParam(req))),
  criarCategoria: (req, res) => res.status(201).json(CategoriaService.criar(req.body)),
  atualizarCategoria: (req, res) => res.json(CategoriaService.atualizar(idParam(req), req.body)),
  removerCategoria: (req, res) => {
    CategoriaService.remover(idParam(req));
    res.status(204).end();
  },

  // --- Itens ---
  listarItens: (req, res) => res.json(ItemService.listar(req.query)),
  obterItem: (req, res) => res.json(ItemService.obter(idParam(req))),
  criarItem: (req, res) => res.status(201).json(ItemService.criar(req.body)),
  atualizarItem: (req, res) => res.json(ItemService.atualizar(idParam(req), req.body)),
  alterarStatusItem: (req, res) => res.json(ItemService.alterarStatus(idParam(req), req.body)),
  removerItem: (req, res) => {
    ItemService.remover(idParam(req));
    res.status(204).end();
  },
  agendaItem: (req, res) => res.json(DisponibilidadeService.agenda(idParam(req))),

  // --- Disponibilidade ---
  consultarDisponibilidade: (req, res) => res.json(DisponibilidadeService.consultar(req.query)),
};

module.exports = CatalogoController;
