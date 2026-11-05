// Contratos: lista com filtro e detalhe (linha do tempo, valores e vistorias).
// `abrirDetalhe` é reutilizado pela tela de operação.

import { get } from '../api.js';
import { h, brl, dataBR, tabela, badgeContrato, modal, formulario } from '../ui.js';

const STATUS = ['Reservado', 'Retirado', 'Em Atraso', 'Devolvido', 'Vistoriado', 'Encerrado', 'Encerrado com avaria'];

/** Linha do tempo do ciclo de vida do contrato. */
function etapas(c) {
  const devolvido = Boolean(c.data_devolucao_real);
  const encerrado = c.status.startsWith('Encerrado');
  const lista = [
    ['Reservado', true],
    ['Retirado', Boolean(c.data_retirada_real)],
    ['Devolvido', devolvido],
    ['Vistoriado', devolvido && ['Vistoriado', 'Encerrado', 'Encerrado com avaria'].includes(c.status)],
    ['Encerrado', encerrado],
  ];
  const atual = lista.findIndex(([, feito]) => !feito);
  return h('ol', { class: 'steps', 'aria-label': 'Etapas do contrato' },
    lista.map(([r, feito], i) => h('li', { class: feito ? 'done' : i === atual ? 'now' : '' }, r)));
}

export async function abrirDetalhe(id) {
  const c = await get(`/contratos/${id}`);
  const par = (rotulo, valor) => h('div', {}, h('dt', {}, rotulo), h('dd', {}, valor ?? '—'));
  const vist = c.vistorias.length
    ? tabela([
      { titulo: 'Tipo', celula: (v) => v.tipo },
      { titulo: 'Data', celula: (v) => dataBR(v.data_vistoria) },
      { titulo: 'Avaria', celula: (v) => (v.tem_avaria ? 'Sim' : 'Não') },
      { titulo: 'Custo', num: true, celula: (v) => brl(v.custo_avaria) },
      { titulo: 'Observações', celula: (v) => v.observacoes || '—' },
    ], c.vistorias.map((dado) => ({ dado })))
    : h('p', { class: 'muted' }, 'Nenhuma vistoria registrada.');

  const encerrado = c.status.startsWith('Encerrado');
  modal({
    titulo: `Contrato #${c.id}`,
    corpo: [
      h('div', { class: 'row' }, badgeContrato(c.status), h('span', { class: 'muted' }, `${c.item_nome} (${c.numero_patrimonio})`)),
      etapas(c),
      h('dl', { class: 'kv' },
        par('Cliente', c.cliente_nome),
        par('Reserva feita em', dataBR(c.data_reserva)),
        par('Retirada prevista', dataBR(c.data_retirada_prevista)),
        par('Devolução prevista', dataBR(c.data_devolucao_prevista)),
        par('Retirada real', dataBR(c.data_retirada_real)),
        par('Devolução real', dataBR(c.data_devolucao_real)),
        par(`Diária × ${c.dias_previstos}`, `${brl(c.valor_diaria)} × ${c.dias_previstos} = ${brl(c.valor_total_previsto)}`),
        par('Caução', brl(c.valor_caucao_retido || c.caucao_estimado) + (c.valor_caucao_retido ? ' (retido)' : ' (estimado)')),
        c.dias_atraso > 0 ? par('Atraso', `${c.dias_atraso} dia(s) · multa ${brl(c.multa_acumulada)}`) : null,
        encerrado ? par('Caução devolvido', brl(c.valor_caucao_devolvido)) : null,
        encerrado && c.valor_cobranca_adicional > 0 ? par('Cobrança adicional', brl(c.valor_cobranca_adicional)) : null),
      h('h3', {}, 'Vistorias'),
      vist,
    ],
  });
}

export default async function contratosView({ usuario }) {
  const cliente = usuario.role === 'CLIENTE';
  const f = formulario([{ nome: 'status', label: 'Situação', tipo: 'select', opcoes: [{ valor: '', rotulo: 'Todas' }, ...STATUS.map((s) => ({ valor: s, rotulo: s }))] }]);
  const lista = h('div', { 'aria-live': 'polite' });

  async function carregar() {
    const st = f.campo('status').input.value;
    const contratos = await get('/contratos', { status: st });
    const colunas = [
      { titulo: 'Contrato', celula: (c) => h('button', { class: 'btn sm', type: 'button', onclick: () => abrirDetalhe(c.id).catch(() => {}) }, `#${c.id}`) },
      { titulo: 'Equipamento', celula: (c) => `${c.item_nome} (${c.numero_patrimonio})` },
      cliente ? null : { titulo: 'Cliente', celula: (c) => c.cliente_nome },
      { titulo: 'Retirada', celula: (c) => dataBR(c.data_retirada_prevista) },
      { titulo: 'Devolução', celula: (c) => dataBR(c.data_devolucao_prevista) },
      { titulo: 'Total previsto', num: true, celula: (c) => brl(c.valor_total_previsto) },
      { titulo: 'Caução', num: true, celula: (c) => brl(c.valor_caucao_retido || c.caucao_estimado) },
      { titulo: 'Situação', celula: (c) => badgeContrato(c.status) },
    ].filter(Boolean);
    lista.replaceChildren(h('section', { class: 'panel flush' }, tabela(colunas,
      contratos.map((dado) => ({ dado, classe: dado.status === 'Em Atraso' ? 'late' : '' })),
      { vazioTitulo: 'Nenhum contrato', vazioTexto: cliente ? 'Suas reservas aparecerão aqui.' : 'Nenhum contrato com esse filtro.' })));
  }
  f.campo('status').input.addEventListener('change', () => carregar().catch((e) => lista.replaceChildren(h('div', { class: 'form-erro' }, e.message))));
  await carregar();

  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', {}, cliente ? 'Meus contratos' : 'Contratos'),
      h('p', {}, cliente ? 'Histórico das suas reservas e locações.' : 'Todas as reservas e locações, da reserva ao encerramento.'))),
    h('div', { class: 'filters' }, f.el),
    lista);
}
