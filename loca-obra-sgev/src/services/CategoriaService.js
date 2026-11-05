'use strict';

const CategoriaRepository = require('../repositories/CategoriaRepository');
const Categoria = require('../models/Categoria');
const AppError = require('../utils/AppError');

/**
 * CRUD de categorias. Alterar taxa de caução/diária vale para novas reservas e retiradas futuras;
 * a diária de contratos já criados é preservada (snapshot no contrato).
 */
const CategoriaService = {
  listar: () => CategoriaRepository.list(),

  /** @param {number} id */
  obter(id) {
    const c = CategoriaRepository.findById(id);
    if (!c) throw AppError.notFound('Categoria não encontrada');
    return c;
  },

  /** @param {object} payload */
  criar(payload) {
    const dados = Categoria.validar(payload);
    if (CategoriaRepository.findByNome(dados.nome)) throw AppError.conflict('Já existe categoria com este nome', 'CATEGORIA_DUPLICADA');
    return CategoriaRepository.create(dados);
  },

  /** @param {number} id @param {object} payload */
  atualizar(id, payload) {
    this.obter(id);
    const dados = Categoria.validar(payload, { parcial: true });
    if (dados.nome) {
      const existente = CategoriaRepository.findByNome(dados.nome);
      if (existente && existente.id !== id) throw AppError.conflict('Já existe categoria com este nome', 'CATEGORIA_DUPLICADA');
    }
    return CategoriaRepository.update(id, dados);
  },

  /** @param {number} id */
  remover(id) {
    this.obter(id);
    if (CategoriaRepository.countItens(id) > 0) {
      throw AppError.conflict('Não é possível excluir: existem itens vinculados a esta categoria', 'CATEGORIA_EM_USO');
    }
    CategoriaRepository.delete(id);
  },
};

module.exports = CategoriaService;
