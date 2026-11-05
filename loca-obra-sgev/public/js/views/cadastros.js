// Cadastros (administrador): CRUD de equipamentos, categorias, clientes e usuários.

import { get, post, put, del } from '../api.js';
import { h, brl, pct, tabela, abas, modal, confirmar, formulario, toast, comEspera, badgeItem } from '../ui.js';

/**
 * Abre um formulário em modal para criar/editar um registro.
 * @param {{titulo:string, specs:Array, valores?:object, transformar?:Function, salvar:Function, aoConcluir:Function}} o
 */
function abrirForm({ titulo, specs, valores, transformar = (x) => x, salvar, aoConcluir }) {
  const f = formulario(specs, valores);
  const ok = h('button', { class: 'btn primary', type: 'button' }, 'Salvar');
  const m = modal({ titulo, corpo: f.el, rodape: [h('button', { class: 'btn', type: 'button', onclick: () => m.fechar() }, 'Cancelar'), ok] });
  ok.addEventListener('click', () => comEspera(ok, async () => {
    try {
      await salvar(transformar(f.ler()));
      m.fechar();
      toast('Salvo com sucesso');
      aoConcluir();
    } catch (e) { f.mostrarErro(e); }
  }));
}

async function remover({ titulo, texto, caminho, aoConcluir }) {
  if (!(await confirmar({ titulo, texto, rotulo: 'Excluir', perigo: true }))) return;
  try {
    await del(caminho);
    toast('Excluído');
    aoConcluir();
  } catch (e) { toast(e.message, 'erro'); }
}

/** Painel de CRUD: botão "Novo", tabela e ações por linha. */
function painelCrud({ rotuloNovo, colunas, linhas, aoNovo, aoEditar, aoExcluir, vazio }) {
  const acoes = (d) => h('div', { class: 'row' },
    h('button', { class: 'btn sm', type: 'button', onclick: () => aoEditar(d) }, 'Editar'),
    h('button', { class: 'btn sm danger', type: 'button', onclick: () => aoExcluir(d) }, 'Excluir'));
  return h('div', { class: 'stack' },
    h('div', { class: 'panel-head', style: 'padding:14px 18px 0' }, h('span', { class: 'muted' }, `${linhas.length} registro(s)`),
      h('button', { class: 'btn primary', type: 'button', onclick: aoNovo }, rotuloNovo)),
    tabela([...colunas, { titulo: '', celula: acoes }], linhas.map((dado) => ({ dado })), { vazioTitulo: vazio, vazioTexto: '' }));
}

export default async function cadastrosView() {
  let abasCtl;
  const recarregar = () => abasCtl.recarregar();

  const opcoesStatus = ['Disponível', 'Em Uso', 'Em Manutenção'].map((s) => ({ valor: s, rotulo: s }));

  async function itens() {
    const [lista, categorias] = await Promise.all([get('/itens'), get('/categorias')]);
    const specs = [
      { nome: 'numero_patrimonio', label: 'Nº de patrimônio', obrigatorio: true, dica: 'Único no sistema.' },
      { nome: 'categoria_id', label: 'Categoria', tipo: 'select', obrigatorio: true, opcoes: categorias.map((c) => ({ valor: c.id, rotulo: c.nome })) },
      { nome: 'nome', label: 'Nome', obrigatorio: true, span: true },
      { nome: 'valor_item', label: 'Valor do item (R$)', tipo: 'number', min: 0, step: '0.01', obrigatorio: true, dica: 'Base do cálculo do caução.' },
      { nome: 'status', label: 'Situação', tipo: 'select', opcoes: opcoesStatus },
    ];
    const tratar = (d) => ({ ...d, categoria_id: Number(d.categoria_id) });
    return painelCrud({
      rotuloNovo: 'Novo equipamento',
      vazio: 'Nenhum equipamento cadastrado',
      linhas: lista,
      colunas: [
        { titulo: 'Patrimônio', celula: (i) => i.numero_patrimonio },
        { titulo: 'Nome', celula: (i) => i.nome },
        { titulo: 'Categoria', celula: (i) => i.categoria_nome },
        { titulo: 'Valor', num: true, celula: (i) => brl(i.valor_item) },
        { titulo: 'Situação', celula: (i) => badgeItem(i.status) },
      ],
      aoNovo: () => abrirForm({ titulo: 'Novo equipamento', specs, transformar: tratar, salvar: (d) => post('/itens', d), aoConcluir: recarregar }),
      aoEditar: (i) => abrirForm({ titulo: `Editar ${i.numero_patrimonio}`, specs, valores: i, transformar: tratar, salvar: (d) => put(`/itens/${i.id}`, d), aoConcluir: recarregar }),
      aoExcluir: (i) => remover({ titulo: 'Excluir equipamento', texto: `Excluir ${i.nome} (${i.numero_patrimonio})? Equipamentos com contratos não podem ser excluídos.`, caminho: `/itens/${i.id}`, aoConcluir: recarregar }),
    });
  }

  async function categorias() {
    const lista = await get('/categorias');
    const specs = [
      { nome: 'nome', label: 'Nome', obrigatorio: true, span: true },
      { nome: 'percentual', label: 'Caução (% do valor do item)', tipo: 'number', min: 0, max: 100, step: '0.1', obrigatorio: true },
      { nome: 'valor_diaria_base', label: 'Diária base (R$)', tipo: 'number', min: 0, step: '0.01', obrigatorio: true },
    ];
    const paraApi = ({ percentual, ...r }) => ({ ...r, percentual_caucao_base: Math.round(percentual * 10) / 1000 });
    const paraForm = (c) => ({ ...c, percentual: Math.round(c.percentual_caucao_base * 1000) / 10 });
    return painelCrud({
      rotuloNovo: 'Nova categoria',
      vazio: 'Nenhuma categoria',
      linhas: lista,
      colunas: [
        { titulo: 'Categoria', celula: (c) => c.nome },
        { titulo: 'Caução', num: true, celula: (c) => pct(c.percentual_caucao_base) },
        { titulo: 'Diária base', num: true, celula: (c) => brl(c.valor_diaria_base) },
      ],
      aoNovo: () => abrirForm({ titulo: 'Nova categoria', specs, transformar: paraApi, salvar: (d) => post('/categorias', d), aoConcluir: recarregar }),
      aoEditar: (c) => abrirForm({ titulo: `Editar ${c.nome}`, specs, valores: paraForm(c), transformar: paraApi, salvar: (d) => put(`/categorias/${c.id}`, d), aoConcluir: recarregar }),
      aoExcluir: (c) => remover({ titulo: 'Excluir categoria', texto: `Excluir a categoria ${c.nome}? Só é possível se não houver equipamentos nela.`, caminho: `/categorias/${c.id}`, aoConcluir: recarregar }),
    });
  }

  async function clientes() {
    const lista = await get('/clientes');
    const base = [
      { nome: 'nome', label: 'Nome / razão social', obrigatorio: true, span: true },
      { nome: 'email', label: 'E-mail', tipo: 'email', obrigatorio: true },
      { nome: 'cpf_cnpj', label: 'CPF ou CNPJ', obrigatorio: true },
      { nome: 'telefone', label: 'Telefone' },
      { nome: 'endereco', label: 'Endereço' },
    ];
    const novo = [...base, { nome: 'senha', label: 'Senha inicial', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', dica: 'Mínimo de 8 caracteres.' }];
    const edicao = [...base, { nome: 'senha', label: 'Nova senha', tipo: 'password', autocomplete: 'new-password', dica: 'Deixe em branco para manter.' }];
    return painelCrud({
      rotuloNovo: 'Novo cliente',
      vazio: 'Nenhum cliente',
      linhas: lista,
      colunas: [
        { titulo: 'Nome', celula: (c) => c.nome },
        { titulo: 'E-mail', celula: (c) => c.email },
        { titulo: 'CPF/CNPJ', celula: (c) => c.cpf_cnpj },
        { titulo: 'Telefone', celula: (c) => c.telefone || '—' },
      ],
      aoNovo: () => abrirForm({ titulo: 'Novo cliente', specs: novo, salvar: (d) => post('/clientes', d), aoConcluir: recarregar }),
      aoEditar: (c) => abrirForm({ titulo: `Editar ${c.nome}`, specs: edicao, valores: c, salvar: (d) => put(`/clientes/${c.id}`, d), aoConcluir: recarregar }),
      aoExcluir: (c) => remover({ titulo: 'Excluir cliente', texto: `Excluir ${c.nome}? Clientes com contratos não podem ser excluídos.`, caminho: `/clientes/${c.id}`, aoConcluir: recarregar }),
    });
  }

  async function usuarios() {
    const lista = await get('/usuarios');
    const roles = [{ valor: 'CLIENTE', rotulo: 'Cliente' }, { valor: 'ATENDENTE', rotulo: 'Atendente' }, { valor: 'ADMIN', rotulo: 'Administrador' }];
    const base = [
      { nome: 'nome', label: 'Nome', obrigatorio: true, span: true },
      { nome: 'email', label: 'E-mail', tipo: 'email', obrigatorio: true },
      { nome: 'role', label: 'Perfil', tipo: 'select', opcoes: roles },
    ];
    const novo = [...base, { nome: 'senha', label: 'Senha inicial', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', dica: 'Mínimo de 8 caracteres.' }];
    const edicao = [...base, { nome: 'senha', label: 'Nova senha', tipo: 'password', autocomplete: 'new-password', dica: 'Deixe em branco para manter.' }];
    const nomeRole = Object.fromEntries(roles.map((r) => [r.valor, r.rotulo]));
    return painelCrud({
      rotuloNovo: 'Novo usuário',
      vazio: 'Nenhum usuário',
      linhas: lista,
      colunas: [
        { titulo: 'Nome', celula: (u) => u.nome },
        { titulo: 'E-mail', celula: (u) => u.email },
        { titulo: 'Perfil', celula: (u) => nomeRole[u.role] || u.role },
      ],
      aoNovo: () => abrirForm({ titulo: 'Novo usuário', specs: novo, salvar: (d) => post('/usuarios', d), aoConcluir: recarregar }),
      aoEditar: (u) => abrirForm({ titulo: `Editar ${u.nome}`, specs: edicao, valores: u, salvar: (d) => put(`/usuarios/${u.id}`, d), aoConcluir: recarregar }),
      aoExcluir: (u) => remover({ titulo: 'Excluir usuário', texto: `Excluir ${u.nome} (${u.email})?`, caminho: `/usuarios/${u.id}`, aoConcluir: recarregar }),
    });
  }

  abasCtl = abas([
    { rotulo: 'Equipamentos', conteudo: itens },
    { rotulo: 'Categorias', conteudo: categorias },
    { rotulo: 'Clientes', conteudo: clientes },
    { rotulo: 'Usuários', conteudo: usuarios },
  ]);

  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', {}, 'Cadastros'),
      h('p', {}, 'Patrimônio, categorias (caução e diária base), clientes e usuários.'))),
    h('section', { class: 'panel flush' }, abasCtl.el));
}
