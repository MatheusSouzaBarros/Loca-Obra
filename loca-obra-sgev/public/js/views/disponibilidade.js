// Consulta de disponibilidade futura: quadro de obra com uma linha por equipamento.
// Faixas hachuradas = período já comprometido. A consulta roda sozinha a cada mudança de filtro.

import { get, post } from '../api.js';
import { h, brl, dataBR, hojeISO, somarDias, diffDias, debounce, formulario, modal, toast, comEspera, vazio, carregando, erroPainel } from '../ui.js';

const MAX_JANELA = 42;

export default async function disponibilidadeView({ usuario, ir }) {
  const ehEquipe = usuario.role !== 'CLIENTE';
  const [categorias, clientes] = await Promise.all([get('/categorias'), ehEquipe ? get('/clientes') : []]);

  const hoje = hojeISO();
  const f = formulario([
    { nome: 'inicio', label: 'Retirada', tipo: 'date', min: hoje, valor: somarDias(hoje, 1), obrigatorio: true },
    { nome: 'fim', label: 'Devolução', tipo: 'date', min: somarDias(hoje, 1), valor: somarDias(hoje, 4), obrigatorio: true },
    { nome: 'categoria_id', label: 'Categoria', tipo: 'select', opcoes: [{ valor: '', rotulo: 'Todas' }, ...categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))] },
  ]);
  const inicio = f.campo('inicio').input;
  const fim = f.campo('fim').input;
  const categoria = f.campo('categoria_id').input;

  const soLivres = h('input', { type: 'checkbox', id: 'so-livres' });
  const resultado = h('div', { 'aria-live': 'polite' });
  let ultimo = null;

  const duracao = (dias) => () => {
    if (!inicio.value) return;
    fim.value = somarDias(inicio.value, dias);
    consultar();
  };
  const atalhos = h('div', { class: 'chips', role: 'group', 'aria-label': 'Duração' },
    [['1 diária', 1], ['3 dias', 3], ['1 semana', 7], ['2 semanas', 14], ['1 mês', 30]].map(([r, n]) =>
      h('button', { class: 'chip', type: 'button', onclick: duracao(n) }, r)));

  let seq = 0;
  async function consultar() {
    f.limparErros();
    if (!inicio.value || !fim.value) return;
    if (fim.value <= inicio.value) {
      resultado.replaceChildren(vazio('Confira o período', 'A devolução precisa ser depois da retirada.'));
      return;
    }
    if (inicio.value < hoje) {
      resultado.replaceChildren(vazio('Confira o período', 'A consulta considera apenas datas a partir de hoje.'));
      return;
    }
    fim.min = somarDias(inicio.value, 1);
    const eu = ++seq;
    resultado.replaceChildren(carregando('Consultando agenda…'));
    try {
      const dados = await get('/disponibilidade', { inicio: inicio.value, fim: fim.value, categoria_id: categoria.value });
      const agendas = await Promise.all(dados.itens.map((i) => get(`/itens/${i.id}/agenda`).catch(() => ({ periodos: [] }))));
      if (eu !== seq) return;
      ultimo = { dados, agendas: new Map(dados.itens.map((i, k) => [i.id, agendas[k].periodos])) };
      desenhar();
    } catch (e) {
      if (eu === seq) resultado.replaceChildren(erroPainel(e, consultar));
    }
  }
  const consultarSuave = debounce(consultar, 250);
  [inicio, fim, categoria].forEach((el) => el.addEventListener('change', consultarSuave));
  soLivres.addEventListener('change', () => ultimo && desenhar());

  function desenhar() {
    const { dados, agendas } = ultimo;
    const p = dados.periodo;
    const folga = 2;
    let ini = somarDias(p.inicio, -folga);
    let dias = p.dias + folga * 2;
    if (dias > MAX_JANELA) { ini = p.inicio; dias = Math.min(p.dias + folga, MAX_JANELA); }
    const pos = (iso) => Math.max(0, Math.min(100, (diffDias(ini, iso) / dias) * 100));

    const passo = dias <= 16 ? 1 : dias <= 30 ? 2 : 7;
    const marcas = [];
    for (let i = 0; i <= dias; i += passo) {
      const iso = somarDias(ini, i);
      marcas.push(h('span', { style: `left:${(i / dias) * 100}%` }, iso.slice(8) + (iso.slice(8) === '01' || i === 0 ? `/${iso.slice(5, 7)}` : '')));
    }

    const itens = dados.itens.filter((i) => !soLivres.checked || i.disponivel);
    const linhas = itens.map((i) => {
      const trilha = h('div', { class: `track ${i.disponivel ? 'free' : ''}`, role: 'img',
        'aria-label': `${i.nome}: ${i.disponivel ? 'livre' : i.motivo_indisponibilidade} de ${dataBR(p.inicio)} a ${dataBR(p.fim)}` },
      h('div', { class: 'want', style: `left:${pos(p.inicio)}%;width:${pos(p.fim) - pos(p.inicio)}%` }));
      if (i.motivo_indisponibilidade === 'Em manutenção') {
        trilha.append(h('div', { class: 'busy repair', style: 'left:0;width:100%', title: 'Em manutenção' }));
      }
      for (const per of agendas.get(i.id) || []) {
        if (per.fim < ini || per.inicio > somarDias(ini, dias)) continue;
        trilha.append(h('div', { class: 'busy', style: `left:${pos(per.inicio)}%;width:${Math.max(1.2, pos(per.fim) - pos(per.inicio))}%`,
          title: `Comprometido de ${dataBR(per.inicio)} a ${dataBR(per.fim)}` }));
      }
      const nota = i.disponivel
        ? h('div', { class: 'track-note pos' }, 'Livre no período')
        : h('div', { class: 'track-note neg' }, i.motivo_indisponibilidade);

      return h('div', { class: `board-row ${i.disponivel ? '' : 'off'}` },
        h('div', {}, h('div', { class: 'item-name' }, i.nome), h('div', { class: 'item-meta' }, `${i.numero_patrimonio} · ${i.categoria_nome}`)),
        h('div', {}, trilha, nota),
        h('div', { class: 'board-price' },
          h('strong', {}, brl(i.total_estimado)),
          h('span', { class: 'muted' }, `Caução ${brl(i.caucao_estimado)}`),
          i.disponivel ? h('button', { class: 'btn primary sm', type: 'button', onclick: () => abrirReserva(i, p) }, 'Reservar') : null));
    });

    resultado.replaceChildren(
      h('div', { class: 'row', style: 'margin-bottom:12px' },
        h('strong', {}, `${dados.disponiveis} de ${dados.total} equipamentos livres`),
        h('span', { class: 'muted' }, `de ${dataBR(p.inicio)} a ${dataBR(p.fim)} (${p.dias} ${p.dias === 1 ? 'diária' : 'diárias'})`)),
      itens.length
        ? h('div', { class: 'board' },
          h('div', { class: 'board-head' }, h('div', {}, 'Equipamento'), h('div', { class: 'axis', 'aria-hidden': 'true' }, marcas), h('div', { style: 'text-align:right' }, 'Total e caução')),
          linhas)
        : vazio('Nenhum equipamento livre', 'Tente outras datas ou outra categoria.'),
      h('div', { class: 'key', style: 'margin-top:12px' },
        h('span', {}, h('i', { style: 'background:var(--hatch)' }), 'Reservado ou em uso'),
        h('span', {}, h('i', { style: 'background:var(--hatch-amber)' }), 'Em manutenção'),
        h('span', {}, h('i', { style: 'background:var(--primary-soft);border:2px solid var(--primary)' }), 'Período consultado')));
  }

  function abrirReserva(item, periodo) {
    const clienteSel = ehEquipe
      ? formulario([{ nome: 'cliente_id', label: 'Cliente', tipo: 'select', obrigatorio: true,
        opcoes: [{ valor: '', rotulo: 'Selecione…' }, ...clientes.map((c) => ({ valor: c.id, rotulo: `${c.nome} (${c.cpf_cnpj})` }))] }])
      : null;
    const resumo = h('dl', { class: 'kv' },
      h('div', {}, h('dt', {}, 'Equipamento'), h('dd', {}, `${item.nome} (${item.numero_patrimonio})`)),
      h('div', {}, h('dt', {}, 'Período'), h('dd', {}, `${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)}`)),
      h('div', {}, h('dt', {}, `Diária × ${periodo.dias}`), h('dd', {}, `${brl(item.valor_diaria)} × ${periodo.dias} = ${brl(item.total_estimado)}`)),
      h('div', {}, h('dt', {}, 'Caução (retido na retirada)'), h('dd', {}, brl(item.caucao_estimado))));
    const aviso = h('p', { class: 'muted small' }, 'O caução só é cobrado na retirada e devolvido após a vistoria, descontados eventuais reparos e multas.');
    const confirmar = h('button', { class: 'btn primary', type: 'button' }, 'Confirmar reserva');
    const m = modal({
      titulo: 'Confirmar reserva',
      corpo: [resumo, clienteSel?.el, aviso],
      rodape: [h('button', { class: 'btn', type: 'button', onclick: () => m.fechar() }, 'Cancelar'), confirmar],
    });
    confirmar.addEventListener('click', () => comEspera(confirmar, async () => {
      try {
        const corpo = { item_id: item.id, data_retirada_prevista: periodo.inicio, data_devolucao_prevista: periodo.fim, ...(clienteSel ? clienteSel.ler() : {}) };
        const c = await post('/contratos', corpo);
        m.fechar();
        toast(`Reserva #${c.id} confirmada`);
        consultar();
      } catch (e) {
        if (e.codigo === 'CONFLITO_AGENDA') {
          m.fechar();
          toast('Esse equipamento acabou de ser reservado por outra pessoa. Atualizamos o quadro.', 'erro');
          consultar();
        } else if (clienteSel) clienteSel.mostrarErro(e);
        else toast(e.message, 'erro');
      }
    }));
  }

  consultar();

  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', {}, 'Disponibilidade futura'),
      h('p', {}, 'Escolha as datas e veja na hora o que está livre. Um equipamento só pode ser reservado se não houver outro contrato no mesmo período.'))),
    h('section', { class: 'panel stack' },
      h('div', { class: 'filters' }, f.el.firstChild.nextSibling ? f.el : f.el),
      atalhos,
      h('label', { class: 'check', for: 'so-livres' }, soLivres, 'Mostrar apenas equipamentos livres')),
    resultado);
}
