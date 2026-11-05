// Relatórios: pendências de caução e atrasos (equipe); financeiro e frota (somente administrador).

import { get } from '../api.js';
import { h, brl, dataBR, tabela, abas, badgeContrato } from '../ui.js';

const figura = (valor, rotulo, alerta = false) =>
  h('div', { class: alerta ? 'alerta' : '' }, h('div', { class: 'fig' }, valor), h('div', { class: 'lbl' }, rotulo));

const contratoCol = [
  { titulo: 'Contrato', celula: (c) => `#${c.id}` },
  { titulo: 'Equipamento', celula: (c) => `${c.item_nome} (${c.numero_patrimonio})` },
  { titulo: 'Cliente', celula: (c) => c.cliente_nome },
];

async function pendencias() {
  const r = await get('/relatorios/pendencias-caucao');
  return h('div', { class: 'stack' },
    h('div', { class: 'ledger compact' }, figura(brl(r.total_retido), 'Total de caução retido'), figura(r.quantidade, 'Contratos com caução pendente')),
    h('section', { class: 'panel flush' }, tabela([
      ...contratoCol,
      { titulo: 'Devolução prevista', celula: (c) => dataBR(c.data_devolucao_prevista) },
      { titulo: 'Caução retido', num: true, celula: (c) => brl(c.valor_caucao_retido) },
      { titulo: 'Multa', num: true, celula: (c) => brl(c.multa_acumulada) },
      { titulo: 'Situação', celula: (c) => badgeContrato(c.status) },
    ], r.contratos.map((dado) => ({ dado, classe: dado.status === 'Em Atraso' ? 'late' : '' })),
    { vazioTitulo: 'Sem pendências', vazioTexto: 'Nenhum caução está retido neste momento.' })));
}

async function atrasos() {
  const r = await get('/relatorios/atrasos');
  return h('div', { class: 'stack' },
    h('div', { class: 'ledger compact' }, figura(r.quantidade, 'Contratos em atraso', r.quantidade > 0), figura(brl(r.multa_acumulada_total), 'Multa acumulada')),
    h('section', { class: 'panel flush' }, tabela([
      ...contratoCol,
      { titulo: 'Contato', celula: (c) => c.cliente_email },
      { titulo: 'Devolução prevista', celula: (c) => dataBR(c.data_devolucao_prevista) },
      { titulo: 'Dias', num: true, celula: (c) => c.dias_atraso },
      { titulo: 'Multa', num: true, celula: (c) => brl(c.multa_acumulada) },
    ], r.contratos.map((dado) => ({ dado, classe: 'late' })),
    { vazioTitulo: 'Nenhum atraso', vazioTexto: 'Todos os contratos em campo estão no prazo.' })));
}

async function financeiro() {
  const r = await get('/relatorios/financeiro');
  const g = r.geral;
  return h('div', { class: 'stack' },
    h('div', { class: 'ledger' },
      figura(brl(g.receita_diarias), 'Receita de diárias'),
      figura(brl(g.multas_aplicadas), 'Multas por atraso'),
      figura(brl(g.avarias_cobradas), 'Avarias cobradas'),
      figura(brl(g.caucao_retido_atual), 'Caução retido hoje')),
    h('div', { class: 'ledger compact' },
      figura(g.contratos_encerrados, 'Contratos encerrados'),
      figura(brl(g.caucao_devolvido), 'Caução devolvido'),
      figura(brl(g.cobrancas_adicionais), 'Cobranças adicionais')),
    h('section', { class: 'panel flush' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Por categoria (contratos encerrados)')),
      tabela([
        { titulo: 'Categoria', celula: (c) => c.categoria },
        { titulo: 'Contratos', num: true, celula: (c) => c.contratos },
        { titulo: 'Receita de diárias', num: true, celula: (c) => brl(c.receita_diarias) },
        { titulo: 'Multas', num: true, celula: (c) => brl(c.multas) },
      ], r.por_categoria.map((dado) => ({ dado })))));
}

async function frota() {
  const r = await get('/relatorios/frota');
  const total = r.por_status.reduce((s, x) => s + x.total, 0) || 1;
  const cls = { Disponível: 'seg-ok', 'Em Uso': 'seg-use', 'Em Manutenção': 'seg-man' };
  return h('div', { class: 'stack' },
    h('section', { class: 'panel' },
      h('h2', {}, 'Situação da frota'),
      h('div', { class: 'split-bar', role: 'img', 'aria-label': r.por_status.map((x) => `${x.total} ${x.status}`).join(', ') },
        r.por_status.map((x) => h('span', { class: cls[x.status], style: `width:${(x.total / total) * 100}%` }))),
      h('div', { class: 'legend' }, r.por_status.map((x) => h('span', {}, h('i', { class: cls[x.status] }), `${x.status}: ${x.total}`)))),
    h('section', { class: 'panel flush' }, tabela([
      { titulo: 'Categoria', celula: (c) => c.categoria },
      { titulo: 'Total', num: true, celula: (c) => c.total },
      { titulo: 'Disponíveis', num: true, celula: (c) => c.disponiveis },
      { titulo: 'Em uso', num: true, celula: (c) => c.em_uso },
      { titulo: 'Manutenção', num: true, celula: (c) => c.em_manutencao },
      { titulo: 'Utilização', num: true, celula: (c) => `${c.taxa_utilizacao}%` },
      { titulo: 'Patrimônio', num: true, celula: (c) => brl(c.valor_patrimonial) },
    ], r.por_categoria.map((dado) => ({ dado })))));
}

export default async function relatoriosView({ usuario }) {
  const admin = usuario.role === 'ADMIN';
  const itens = [
    { rotulo: 'Pendências de caução', conteudo: pendencias },
    { rotulo: 'Contratos em atraso', conteudo: atrasos },
    ...(admin ? [{ rotulo: 'Financeiro', conteudo: financeiro }, { rotulo: 'Frota', conteudo: frota }] : []),
  ];
  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', {}, 'Relatórios'),
      h('p', {}, admin ? 'Operação, finanças e frota.' : 'Pendências de caução e contratos em atraso.'))),
    h('section', { class: 'panel flush' }, abas(itens).el));
}
