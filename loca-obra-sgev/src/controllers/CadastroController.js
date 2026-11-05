'use strict';

const ClienteService = require('../services/ClienteService');
const UsuarioService = require('../services/UsuarioService');
const { idParam } = require('../utils/params');

/** CRUD administrativo de clientes e usuários. */
const CadastroController = {
  // --- Clientes ---
  listarClientes: (_req, res) => res.json(ClienteService.listar()),
  meuCadastro: (req, res) => res.json(ClienteService.doUsuario(req.usuario)),
  obterCliente: (req, res) => res.json(ClienteService.obter(idParam(req))),
  criarCliente: (req, res) => res.status(201).json(ClienteService.criar(req.body)),
  atualizarCliente: (req, res) => res.json(ClienteService.atualizar(idParam(req), req.body)),
  removerCliente: (req, res) => {
    ClienteService.remover(idParam(req));
    res.status(204).end();
  },

  // --- Usuários ---
  listarUsuarios: (_req, res) => res.json(UsuarioService.listar()),
  obterUsuario: (req, res) => res.json(UsuarioService.obter(idParam(req))),
  criarUsuario: (req, res) => res.status(201).json(UsuarioService.criar(req.body)),
  atualizarUsuario: (req, res) => res.json(UsuarioService.atualizar(idParam(req), req.body, req.usuario)),
  removerUsuario: (req, res) => {
    UsuarioService.remover(idParam(req), req.usuario);
    res.status(204).end();
  },
};

module.exports = CadastroController;
