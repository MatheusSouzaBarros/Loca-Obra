'use strict';

/**
 * @file Mapeamento das rotas da API RESTful (prefixo /api) com RBAC.
 *
 * Perfis: C = CLIENTE, A = ATENDENTE, ADM = ADMIN.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { autenticar, autorizar } = require('../middlewares/auth');
const { ROLES } = require('../models/Usuario');
const Auth = require('../controllers/AuthController');
const Catalogo = require('../controllers/CatalogoController');
const Cadastro = require('../controllers/CadastroController');
const Contrato = require('../controllers/ContratoController');
const Relatorio = require('../controllers/RelatorioController');

const { CLIENTE, ATENDENTE, ADMIN } = ROLES;
const equipe = autorizar(ATENDENTE, ADMIN);
const soAdmin = autorizar(ADMIN);

const router = Router();

// Proteção contra força bruta nas rotas públicas de autenticação.
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'Muitas tentativas. Tente novamente em alguns minutos.' } },
});

// --- Autenticação ---
router.get('/auth/config', Auth.config);
router.post('/auth/login', limitadorAuth, Auth.login);
router.post('/auth/register', limitadorAuth, Auth.registrar);
router.get('/auth/me', autenticar, Auth.me);

// Todas as rotas abaixo exigem autenticação.
router.use(autenticar);

// --- Categorias (leitura: todos; escrita: ADM) ---
router.get('/categorias', Catalogo.listarCategorias);
router.get('/categorias/:id', Catalogo.obterCategoria);
router.post('/categorias', soAdmin, Catalogo.criarCategoria);
router.put('/categorias/:id', soAdmin, Catalogo.atualizarCategoria);
router.delete('/categorias/:id', soAdmin, Catalogo.removerCategoria);

// --- Itens (leitura: todos; escrita: ADM; ajuste de situação: A/ADM) ---
router.get('/itens', Catalogo.listarItens);
router.get('/itens/:id', Catalogo.obterItem);
router.get('/itens/:id/agenda', Catalogo.agendaItem);
router.post('/itens', soAdmin, Catalogo.criarItem);
router.put('/itens/:id', soAdmin, Catalogo.atualizarItem);
router.patch('/itens/:id/status', equipe, Catalogo.alterarStatusItem);
router.delete('/itens/:id', soAdmin, Catalogo.removerItem);

// --- Disponibilidade futura (todos) ---
router.get('/disponibilidade', Catalogo.consultarDisponibilidade);

// --- Clientes ---
router.get('/clientes/me', autorizar(CLIENTE), Cadastro.meuCadastro);
router.get('/clientes', equipe, Cadastro.listarClientes);
router.get('/clientes/:id', equipe, Cadastro.obterCliente);
router.post('/clientes', soAdmin, Cadastro.criarCliente);
router.put('/clientes/:id', soAdmin, Cadastro.atualizarCliente);
router.delete('/clientes/:id', soAdmin, Cadastro.removerCliente);

// --- Usuários (ADM) ---
router.get('/usuarios', soAdmin, Cadastro.listarUsuarios);
router.get('/usuarios/:id', soAdmin, Cadastro.obterUsuario);
router.post('/usuarios', soAdmin, Cadastro.criarUsuario);
router.put('/usuarios/:id', soAdmin, Cadastro.atualizarUsuario);
router.delete('/usuarios/:id', soAdmin, Cadastro.removerUsuario);

// --- Contratos ---
router.get('/contratos', Contrato.listar); // C: apenas os próprios; A/ADM: todos
router.post('/contratos', Contrato.criar); // C: reserva própria; A/ADM: em nome de um cliente
router.get('/contratos/:id', Contrato.obter);
router.post('/contratos/:id/retirada', equipe, Contrato.retirar);
router.post('/contratos/:id/devolucao', equipe, Contrato.devolver);
router.get('/contratos/:id/liquidacao', equipe, Contrato.liquidacao);
router.post('/contratos/:id/vistoria', equipe, Contrato.vistoriar);
router.post('/contratos/:id/encerramento', equipe, Contrato.encerrar);

// --- Relatórios ---
router.get('/dashboard', Relatorio.dashboard);
router.get('/relatorios/pendencias-caucao', equipe, Relatorio.pendenciasCaucao);
router.get('/relatorios/atrasos', equipe, Relatorio.atrasos);
router.get('/relatorios/financeiro', soAdmin, Relatorio.financeiro);
router.get('/relatorios/frota', soAdmin, Relatorio.frota);

module.exports = router;
