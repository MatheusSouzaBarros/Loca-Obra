// Catálogo: categorias (com regra de caução) e equipamentos, com filtro por categoria e situação.

import { get } from '../api.js';
import { h, brl, pct, tabela, badgeItem, formulario } from '../ui.js';

export default async function catalogoView({ ir }) {
  const [categorias, itens] = await Promise.all([get('/categorias'), get('/itens')]);

  const cards = h('div', { class: 'cards' }, categorias.map((c) => {
    const qtd = itens.filter((i) => i.categoria_id === c.id).length;
    return h('article', { class: 'cat-card' },
      h('h3', {}, c.nome),
      h('dl', {},
        h('dt', {}, 'Diária base'), h('dd', {}, brl(c.valor_diaria_base)),
        h('dt', {}, 'Caução'), h('dd', {}, `${pct(c.percentual_caucao_base)} do valor`),
        h('dt', {}, 'Equipamentos'), h('dd', {}, qtd)));
  }));

  const f = formulario([
    { nome: 'categoria', label: 'Categoria', tipo: 'select', opcoes: [{ valor: '', rotulo: 'Todas' }, ...categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))] },
    { nome: 'status', label: 'Situação agora', tipo: 'select', opcoes: [{ valor: '', rotulo: 'Todas' }, ...['Disponível', 'Em Uso', 'Em Manutenção'].map((s) => ({ valor: s, rotulo: s }))] },
  ]);
  const lista = h('div');

  function desenhar() {
    const cat = f.campo('categoria').input.value;
    const st = f.campo('status').input.value;
    const filtrados = itens.filter((i) => (!cat || String(i.categoria_id) === cat) && (!st || i.status === st));
    lista.replaceChildren(tabela([
      { titulo: 'Patrimônio', celula: (i) => i.numero_patrimonio },
      { titulo: 'Equipamento', celula: (i) => i.nome },
      { titulo: 'Categoria', celula: (i) => i.categoria_nome },
      { titulo: 'Valor do item', num: true, celula: (i) => brl(i.valor_item) },
      { titulo: 'Diária', num: true, celula: (i) => brl(i.valor_diaria_base) },
      { titulo: 'Caução', num: true, celula: (i) => brl(i.valor_item * i.percentual_caucao_base) },
      { titulo: 'Situação agora', celula: (i) => badgeItem(i.status) },
    ], filtrados.map((dado) => ({ dado })), { vazioTitulo: 'Nenhum equipamento encontrado', vazioTexto: 'Ajuste os filtros.' }));
  }
  f.campo('categoria').input.addEventListener('change', desenhar);
  f.campo('status').input.addEventListener('change', desenhar);
  desenhar();

  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Catálogo'), h('p', {}, 'Categorias, diárias e caução por equipamento. A situação mostrada é a de hoje; para datas futuras use a consulta de disponibilidade.')),
      h('button', { class: 'btn primary', type: 'button', onclick: () => ir('disponibilidade') }, 'Consultar disponibilidade')),
    cards,
    h('section', { class: 'panel stack' }, h('div', { class: 'filters' }, f.el), lista));
}
