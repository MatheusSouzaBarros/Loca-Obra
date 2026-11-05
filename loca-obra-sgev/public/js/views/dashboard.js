// Painel: números do dia e alertas. Equipe vê a operação toda; cliente vê só os próprios contratos.

import { get } from '../api.js';
import { h, brl, dataBR, tabela, badgeContrato, vazio } from '../ui.js';

const figura = (valor, rotulo, alerta = false) =>
  h('div', { class: alerta ? 'alerta' : '' }, h('div', { class: 'fig' }, valor), h('div', { class: 'lbl' }, rotulo));

export default async function dashboardView({ usuario, ir }) {
  const d = await get('/dashboard');
  const m = d.metricas;
  const cliente = d.escopo === 'cliente';

  const topo = h('div', { class: 'page-head' },
    h('div', {},
      h('h1', {}, cliente ? 'Seus contratos' : 'Operação de hoje'),
      h('p', {}, cliente
        ? 'Reservas, equipamentos em campo e caução retido em seu nome.'
        : 'Equipamentos em campo, caução retido e o que precisa de ação agora.')),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => ir('disponibilidade') }, cliente ? 'Reservar equipamento' : 'Consultar disponibilidade'),
      !cliente && m.aguardando_vistoria > 0
        ? h('button', { class: 'btn', type: 'button', onclick: () => ir('operacao') }, `Vistorias pendentes (${m.aguardando_vistoria})`)
        : null));

  const principais = h('div', { class: 'ledger' },
    figura(m.contratos_ativos, 'Contratos ativos (em campo)'),
    figura(brl(m.total_caucao_retido), 'Caução retido'),
    figura(m.contratos_em_atraso, 'Contratos em atraso', m.contratos_em_atraso > 0),
    figura(m.aguardando_vistoria, 'Aguardando vistoria'));

  const secundarios = h('div', { class: 'ledger compact' },
    figura(m.reservas_futuras, 'Reservas futuras'),
    figura(m.encerrados, 'Contratos encerrados'));

  const blocos = [topo, principais, secundarios];

  if (!cliente) {
    const total = d.frota_por_status.reduce((s, x) => s + x.total, 0) || 1;
    const cls = { Disponível: 'seg-ok', 'Em Uso': 'seg-use', 'Em Manutenção': 'seg-man' };
    blocos.push(h('section', { class: 'panel' },
      h('h2', {}, 'Frota agora'),
      h('div', { class: 'split-bar', role: 'img', 'aria-label': d.frota_por_status.map((x) => `${x.total} ${x.status}`).join(', ') },
        d.frota_por_status.map((x) => h('span', { class: cls[x.status], style: `width:${(x.total / total) * 100}%` }))),
      h('div', { class: 'legend' }, d.frota_por_status.map((x) =>
        h('span', {}, h('i', { class: cls[x.status] }), `${x.status}: ${x.total}`)))));
  }

  const alertas = cliente ? null : d.alertas_atraso;
  if (alertas) {
    blocos.push(h('section', { class: 'panel flush' },
      h('div', { class: 'panel-head' },
        h('h2', {}, 'Contratos em atraso'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => ir('relatorios') }, 'Ver relatório')),
      alertas.length
        ? tabela([
          { titulo: 'Contrato', celula: (c) => `#${c.id}` },
          { titulo: 'Equipamento', celula: (c) => `${c.item_nome} (${c.numero_patrimonio})` },
          { titulo: 'Cliente', celula: (c) => c.cliente_nome },
          { titulo: 'Devolução prevista', celula: (c) => dataBR(c.data_devolucao_prevista) },
          { titulo: 'Dias de atraso', num: true, celula: (c) => c.dias_atraso },
          { titulo: 'Multa acumulada', num: true, celula: (c) => brl(c.multa_acumulada) },
          { titulo: 'Situação', celula: (c) => badgeContrato(c.status) },
        ], alertas.map((c) => ({ dado: c, classe: 'late' })))
        : vazio('Nenhum atraso', 'Todos os equipamentos em campo estão dentro do prazo.')));
  }

  return h('div', { class: 'stack' }, blocos);
}
