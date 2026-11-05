// Retirada e vistoria: a fila de trabalho do balcão, organizada pelo ciclo de vida do contrato.
//   Retiradas -> Em campo (devolução) -> Vistoria de saída -> Encerramento financeiro.
// A vistoria mostra, em tempo real, quanto do caução é abatido antes de o atendente confirmar.

import { get, post } from '../api.js';
import { h, brl, dataBR, hojeISO, tabela, badgeContrato, abas, modal, formulario, toast, comEspera, debounce } from '../ui.js';
import { abrirDetalhe } from './contratos.js';

const vistoriaSaida = (c) => (c.vistorias || []).find((v) => v.tipo === 'Saída');

/** Tabela de liquidação do caução (resultado de /contratos/:id/liquidacao). */
function tabelaLiquidacao(l) {
  const linha = (r, v, cls = '') => h('tr', { class: cls }, h('td', {}, r), h('td', { class: 'num' }, v));
  return h('table', { class: 'calc', 'aria-label': 'Liquidação do caução' }, h('tbody', {},
    linha('Caução retido', brl(l.caucao_retido)),
    l.avaria_descontada > 0 ? linha('(−) Reparo da avaria', brl(l.avaria_descontada)) : null,
    l.multa_descontada > 0 ? linha('(−) Multa por atraso', brl(l.multa_descontada)) : null,
    linha('Saldo devolvido ao cliente', brl(l.saldo_devolvido), 'total'),
    l.cobranca_adicional > 0 ? linha('Cobrança adicional (excede o caução)', brl(l.cobranca_adicional), 'extra') : null,
    l.multa_a_cobrar_a_parte > 0 ? linha('Multa a cobrar à parte', brl(l.multa_a_cobrar_a_parte), 'extra') : null));
}

/** Busca a simulação e a desenha no contêiner, descartando respostas antigas. */
function simulador(id, alvo) {
  let seq = 0;
  return async (custo, descontarMulta) => {
    const eu = ++seq;
    try {
      const l = await get(`/contratos/${id}/liquidacao`, { custo_avaria: custo || 0, descontar_multa: descontarMulta });
      if (eu === seq) alvo.replaceChildren(tabelaLiquidacao(l));
    } catch (e) {
      if (eu === seq) alvo.replaceChildren(h('div', { class: 'form-erro' }, e.message));
    }
  };
}

const resumo = (c) => h('dl', { class: 'kv' },
  h('div', {}, h('dt', {}, 'Equipamento'), h('dd', {}, `${c.item_nome} (${c.numero_patrimonio})`)),
  h('div', {}, h('dt', {}, 'Cliente'), h('dd', {}, c.cliente_nome)),
  h('div', {}, h('dt', {}, 'Período previsto'), h('dd', {}, `${dataBR(c.data_retirada_prevista)} a ${dataBR(c.data_devolucao_prevista)}`)));

// ---------- Ações ----------

function abrirRetirada(c, aoConcluir) {
  const f = formulario([
    { nome: 'data_retirada_real', label: 'Data da retirada', tipo: 'date', min: c.data_retirada_prevista, max: hojeISO(), valor: hojeISO() > c.data_retirada_prevista ? hojeISO() : c.data_retirada_prevista, obrigatorio: true },
    { nome: 'tem_avaria', label: 'Equipamento com avaria na retirada?', tipo: 'select', opcoes: [{ valor: 'nao', rotulo: 'Não, em bom estado' }, { valor: 'sim', rotulo: 'Sim, já tem avaria' }] },
    { nome: 'observacoes', label: 'Observações da vistoria de entrada', tipo: 'textarea', span: true, placeholder: 'Estado geral, acessórios entregues, avarias pré-existentes…' },
  ]);
  const ok = h('button', { class: 'btn primary', type: 'button' }, 'Confirmar retirada');
  const m = modal({
    titulo: `Retirada · contrato #${c.id}`,
    corpo: [resumo(c),
      h('p', {}, `O caução de ${brl(c.caucao_estimado)} será retido agora e o equipamento passa a "Em Uso".`),
      f.el],
    rodape: [h('button', { class: 'btn', type: 'button', onclick: () => m.fechar() }, 'Cancelar'), ok],
  });
  ok.addEventListener('click', () => comEspera(ok, async () => {
    const v = f.ler();
    try {
      await post(`/contratos/${c.id}/retirada`, {
        data_retirada_real: v.data_retirada_real,
        vistoria_entrada: { tem_avaria: v.tem_avaria === 'sim', observacoes: v.observacoes },
      });
      m.fechar();
      toast(`Retirada registrada. Caução de ${brl(c.caucao_estimado)} retido.`);
      aoConcluir();
    } catch (e) { f.mostrarErro(e); }
  }));
}

function abrirDevolucao(c, aoConcluir) {
  const f = formulario([
    { nome: 'data_devolucao_real', label: 'Data da devolução', tipo: 'date', min: c.data_retirada_real, max: hojeISO(), valor: hojeISO(), obrigatorio: true },
  ]);
  const atraso = c.dias_atraso > 0
    ? h('p', { class: 'form-erro' }, `Contrato em atraso: ${c.dias_atraso} dia(s). Multa estimada de ${brl(c.multa_acumulada)} (dias de atraso × diária), calculada pela data informada.`)
    : null;
  const ok = h('button', { class: 'btn primary', type: 'button' }, 'Registrar devolução');
  const m = modal({
    titulo: `Devolução · contrato #${c.id}`,
    corpo: [resumo(c), atraso, f.el],
    rodape: [h('button', { class: 'btn', type: 'button', onclick: () => m.fechar() }, 'Cancelar'), ok],
  });
  ok.addEventListener('click', () => comEspera(ok, async () => {
    try {
      const r = await post(`/contratos/${c.id}/devolucao`, f.ler());
      m.fechar();
      toast(r.status === 'Em Atraso' ? `Devolução com atraso. Multa de ${brl(r.valor_multa)} registrada.` : 'Devolução registrada. Falta a vistoria.');
      aoConcluir();
    } catch (e) { f.mostrarErro(e); }
  }));
}

function abrirVistoria(c, aoConcluir) {
  const f = formulario([
    { nome: 'tem_avaria', label: 'Há avaria?', tipo: 'select', opcoes: [{ valor: 'nao', rotulo: 'Não, sem avarias' }, { valor: 'sim', rotulo: 'Sim, há avaria' }] },
    { nome: 'custo_avaria', label: 'Custo do reparo (R$)', tipo: 'number', min: 0, step: '0.01', placeholder: '0,00' },
    { nome: 'observacoes', label: 'Observações', tipo: 'textarea', span: true, placeholder: 'Descreva a avaria encontrada (obrigatório quando há avaria).' },
  ]);
  const temAvaria = f.campo('tem_avaria').input;
  const custo = f.campo('custo_avaria').input;
  const descontar = h('input', { type: 'checkbox', id: 'desc-multa', checked: true });
  const alvo = h('div', { 'aria-live': 'polite' });
  const simular = simulador(c.id, alvo);

  const custoAtual = () => (temAvaria.value === 'sim' ? Number(custo.value) || 0 : 0);
  const atualizar = () => {
    custo.disabled = temAvaria.value !== 'sim';
    if (custo.disabled) custo.value = '';
    simular(custoAtual(), descontar.checked);
  };
  const atualizarSuave = debounce(atualizar, 200);
  temAvaria.addEventListener('change', atualizar);
  custo.addEventListener('input', atualizarSuave);
  descontar.addEventListener('change', atualizar);

  const temMulta = c.valor_multa > 0;
  const registrar = h('button', { class: 'btn', type: 'button' }, 'Só registrar vistoria');
  const registrarEncerrar = h('button', { class: 'btn primary', type: 'button' }, 'Registrar e encerrar');
  const m = modal({
    titulo: `Vistoria de saída · contrato #${c.id}`,
    corpo: [
      resumo(c),
      f.el,
      temMulta ? h('label', { class: 'check', for: 'desc-multa' }, descontar, `Descontar a multa por atraso (${brl(c.valor_multa)}) do caução`) : null,
      h('h3', {}, 'Abatimento do caução'),
      alvo,
    ],
    rodape: [h('button', { class: 'btn', type: 'button', onclick: () => m.fechar() }, 'Cancelar'), registrar, registrarEncerrar],
  });
  atualizar();

  const payload = () => {
    const v = f.ler();
    return { tem_avaria: v.tem_avaria === 'sim', custo_avaria: custoAtual(), observacoes: v.observacoes };
  };
  registrar.addEventListener('click', () => comEspera(registrar, async () => {
    try {
      await post(`/contratos/${c.id}/vistoria`, payload());
      m.fechar();
      toast('Vistoria registrada. Falta o encerramento financeiro.');
      aoConcluir();
    } catch (e) { f.mostrarErro(e); }
  }));
  registrarEncerrar.addEventListener('click', () => comEspera(registrarEncerrar, async () => {
    try {
      await post(`/contratos/${c.id}/vistoria`, payload());
    } catch (e) { f.mostrarErro(e); return; }
    try {
      const r = await post(`/contratos/${c.id}/encerramento`, { descontar_multa: temMulta ? descontar.checked : true });
      m.fechar();
      toast(`Contrato encerrado. Devolver ${brl(r.liquidacao.saldo_devolvido)} ao cliente.`);
    } catch (e) {
      m.fechar();
      toast(`Vistoria registrada, mas o encerramento falhou: ${e.message}`, 'erro');
    }
    aoConcluir();
  }));
}

async function abrirEncerramento(contrato, aoConcluir) {
  const c = await get(`/contratos/${contrato.id}`);
  const v = vistoriaSaida(c);
  const descontar = h('input', { type: 'checkbox', id: 'desc-multa-enc', checked: true });
  const alvo = h('div', { 'aria-live': 'polite' });
  const simular = simulador(c.id, alvo);
  const temMulta = c.valor_multa > 0;
  descontar.addEventListener('change', () => simular(v?.custo_avaria, descontar.checked));
  simular(v?.custo_avaria, true);

  const ok = h('button', { class: 'btn primary', type: 'button' }, 'Encerrar e liquidar caução');
  const m = modal({
    titulo: `Encerramento · contrato #${c.id}`,
    corpo: [
      resumo(c),
      h('p', {}, v?.tem_avaria ? `Avaria registrada: ${brl(v.custo_avaria)}. ${v.observacoes || ''}` : 'Vistoria sem avarias.'),
      temMulta ? h('label', { class: 'check', for: 'desc-multa-enc' }, descontar, `Descontar a multa por atraso (${brl(c.valor_multa)}) do caução`) : null,
      alvo,
    ],
    rodape: [h('button', { class: 'btn', type: 'button', onclick: () => m.fechar() }, 'Cancelar'), ok],
  });
  ok.addEventListener('click', () => comEspera(ok, async () => {
    try {
      const r = await post(`/contratos/${c.id}/encerramento`, { descontar_multa: temMulta ? descontar.checked : true });
      m.fechar();
      toast(`Contrato encerrado. Devolver ${brl(r.liquidacao.saldo_devolvido)} ao cliente.`);
      aoConcluir();
    } catch (e) { toast(e.message, 'erro'); }
  }));
}

// ---------- Fila ----------

const detalhes = (c) => h('button', { class: 'btn sm ghost', type: 'button', onclick: () => abrirDetalhe(c.id).catch((e) => toast(e.message, 'erro')) }, `#${c.id}`);

function fila(contratos, extra, acao, textoVazio) {
  return tabela([
    { titulo: 'Contrato', celula: detalhes },
    { titulo: 'Equipamento', celula: (c) => `${c.item_nome} (${c.numero_patrimonio})` },
    { titulo: 'Cliente', celula: (c) => c.cliente_nome },
    ...extra,
    { titulo: 'Situação', celula: (c) => badgeContrato(c.status) },
    { titulo: '', celula: acao },
  ], contratos.map((dado) => ({ dado, classe: dado.dias_atraso > 0 ? 'late' : '' })), { vazioTitulo: textoVazio[0], vazioTexto: textoVazio[1] });
}

export default async function operacaoView() {
  const raiz = h('div', { class: 'stack' });

  async function montar(aba = 0) {
    const todos = await get('/contratos');
    const reservados = todos.filter((c) => c.status === 'Reservado').sort((a, b) => a.data_retirada_prevista.localeCompare(b.data_retirada_prevista));
    const emCampo = todos.filter((c) => ['Retirado', 'Em Atraso'].includes(c.status) && !c.data_devolucao_real);
    const paraVistoria = todos.filter((c) => c.data_devolucao_real && ['Devolvido', 'Em Atraso'].includes(c.status));
    const paraEncerrar = todos.filter((c) => c.status === 'Vistoriado');

    const atualizar = (i) => () => montar(i).catch((e) => toast(e.message, 'erro'));
    const btn = (rotulo, fn, primario = true) => h('button', { class: `btn sm ${primario ? 'primary' : ''}`, type: 'button', onclick: fn }, rotulo);
    const hoje = hojeISO();

    const t = abas([
      { rotulo: 'Retiradas', contagem: reservados.length, conteudo: () => fila(reservados,
        [{ titulo: 'Retirada prevista', celula: (c) => dataBR(c.data_retirada_prevista) },
          { titulo: 'Caução a reter', num: true, celula: (c) => brl(c.caucao_estimado) }],
        (c) => (c.data_retirada_prevista <= hoje
          ? btn('Confirmar retirada', () => abrirRetirada(c, atualizar(0)))
          : h('span', { class: 'muted small' }, 'Aguardando a data')),
        ['Nenhuma retirada pendente', 'Reservas confirmadas aparecem aqui.']) },
      { rotulo: 'Em campo', contagem: emCampo.length, alerta: emCampo.some((c) => c.dias_atraso > 0), conteudo: () => fila(emCampo,
        [{ titulo: 'Devolução prevista', celula: (c) => dataBR(c.data_devolucao_prevista) },
          { titulo: 'Atraso', num: true, celula: (c) => (c.dias_atraso ? `${c.dias_atraso} d · ${brl(c.multa_acumulada)}` : '—') }],
        (c) => btn('Registrar devolução', () => abrirDevolucao(c, atualizar(1))),
        ['Nada em campo', 'Nenhum equipamento está com cliente agora.']) },
      { rotulo: 'Vistoria', contagem: paraVistoria.length, conteudo: () => fila(paraVistoria,
        [{ titulo: 'Devolvido em', celula: (c) => dataBR(c.data_devolucao_real) },
          { titulo: 'Multa', num: true, celula: (c) => brl(c.valor_multa) }],
        (c) => btn('Lançar vistoria', () => abrirVistoria(c, atualizar(2))),
        ['Nenhuma vistoria pendente', 'Devoluções registradas aguardam vistoria aqui.']) },
      { rotulo: 'Encerramento', contagem: paraEncerrar.length, conteudo: () => fila(paraEncerrar,
        [{ titulo: 'Caução retido', num: true, celula: (c) => brl(c.valor_caucao_retido) }],
        (c) => btn('Liquidar caução', () => abrirEncerramento(c, atualizar(3)).catch((e) => toast(e.message, 'erro'))),
        ['Nada para encerrar', 'Contratos vistoriados aguardam liquidação aqui.']) },
    ], { inicial: aba });

    raiz.replaceChildren(
      h('div', { class: 'page-head' }, h('div', {},
        h('h1', {}, 'Retirada e vistoria'),
        h('p', {}, 'Siga o contrato até o fim: retirada com retenção do caução, devolução, vistoria técnica e liquidação.'))),
      h('section', { class: 'panel flush' }, t.el));
  }

  await montar();
  return raiz;
}
