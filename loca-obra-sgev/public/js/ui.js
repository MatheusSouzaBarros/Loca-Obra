// Helpers de interface: criação segura de DOM (sem innerHTML), formatação, modal, toast e formulários.

/** Cria um elemento. Strings viram nós de texto, então nada vindo da API é interpretado como HTML. */
export function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  let valor;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') valor = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const anexar = (f) => {
    if (f === null || f === undefined || f === false) return;
    if (Array.isArray(f)) f.forEach(anexar);
    else el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  };
  filhos.forEach(anexar);
  if (valor !== undefined) el.value = valor; // select/inputs: após as opções existirem
  return el;
}

// ---------- Formatação ----------

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v) => moeda.format(Number(v) || 0);

/** '2026-10-08' -> '08/10/2026' (sem passar por Date, evitando deslocamento de fuso). */
export function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function somarDias(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDias(de, ate) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
}

export const pct = (fracao) => `${Math.round(Number(fracao) * 1000) / 10}%`;

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------- Badges ----------

const CLASSE_CONTRATO = {
  Reservado: 'info',
  Retirado: 'active',
  Devolvido: 'pending',
  Vistoriado: 'pending',
  'Em Atraso': 'danger',
  Encerrado: 'ok',
  'Encerrado com avaria': 'warn',
};
const CLASSE_ITEM = { Disponível: 'ok', 'Em Uso': 'active', 'Em Manutenção': 'warn' };

export const badgeContrato = (status) => h('span', { class: `badge ${CLASSE_CONTRATO[status] || ''}` }, status);
export const badgeItem = (status) => h('span', { class: `badge ${CLASSE_ITEM[status] || ''}` }, status);

// ---------- Blocos reutilizáveis ----------

export const carregando = (texto = 'Carregando…') => h('div', { class: 'vazio', role: 'status' }, texto);

export const vazio = (titulo, texto) => h('div', { class: 'vazio' }, h('strong', {}, titulo), texto);

export function erroPainel(erro, aoTentar) {
  return h('div', { class: 'panel' },
    h('div', { class: 'form-erro', role: 'alert' }, erro.message || 'Algo deu errado.'),
    aoTentar ? h('p', { style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: aoTentar }, 'Tentar de novo')) : null);
}

export function tabela(colunas, linhas, { vazioTitulo = 'Nada por aqui', vazioTexto = '' } = {}) {
  if (!linhas.length) return vazio(vazioTitulo, vazioTexto);
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {}, colunas.map((c) => h('th', { class: c.num ? 'num' : '' }, c.titulo)))),
      h('tbody', {}, linhas.map((l) =>
        h('tr', { class: l.classe || '' }, colunas.map((c) => h('td', { class: c.num ? 'num' : '' }, c.celula(l.dado))))))));
}

export function abas(itens, { inicial = 0, aoTrocar } = {}) {
  const lista = h('div', { class: 'tabs', role: 'tablist' });
  const painel = h('div', { role: 'tabpanel' });
  let atual = -1;
  const botoes = itens.map((it, i) => {
    const b = h('button', { type: 'button', role: 'tab', onclick: () => abrir(i) }, it.rotulo,
      it.contagem !== undefined ? h('span', { class: `count ${it.alerta ? 'alert' : ''}` }, it.contagem) : null);
    return b;
  });
  botoes.forEach((b) => lista.append(b));
  async function abrir(i) {
    atual = i;
    botoes.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    painel.replaceChildren(carregando());
    try {
      painel.replaceChildren(await itens[i].conteudo());
    } catch (e) {
      painel.replaceChildren(erroPainel(e, () => abrir(i)));
    }
    aoTrocar?.(i);
  }
  const recarregar = () => abrir(atual);
  queueMicrotask(() => abrir(inicial));
  return { el: h('div', {}, lista, painel), recarregar };
}

// ---------- Toast ----------

export function toast(mensagem, tipo = 'ok') {
  const el = h('div', { class: `toast ${tipo === 'erro' ? 'erro' : ''}` }, mensagem);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 4000);
}

// ---------- Modal (<dialog> nativo: foco preso, Esc fecha) ----------

/**
 * @param {{titulo:string, corpo:Node|Node[], rodape?:Node[], aoFechar?:Function}} opcoes
 * @returns {{fechar:Function, dialog:HTMLDialogElement}}
 */
export function modal({ titulo, corpo, rodape = [], aoFechar }) {
  const dialog = h('dialog', { 'aria-labelledby': 'dlg-titulo' },
    h('div', { class: 'dlg-head' },
      h('h2', { id: 'dlg-titulo' }, titulo),
      h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Fechar', onclick: () => dialog.close() }, 'Fechar')),
    h('div', { class: 'dlg-body' }, corpo),
    rodape.length ? h('div', { class: 'dlg-foot' }, rodape) : null);
  dialog.addEventListener('close', () => {
    dialog.remove();
    aoFechar?.();
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, fechar: () => dialog.close() };
}

export function confirmar({ titulo, texto, rotulo = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    let resposta = false;
    const ok = h('button', { class: `btn ${perigo ? 'danger' : 'primary'}`, type: 'button', onclick: () => { resposta = true; m.fechar(); } }, rotulo);
    const cancelar = h('button', { class: 'btn', type: 'button', onclick: () => m.fechar() }, 'Cancelar');
    const m = modal({ titulo, corpo: h('p', {}, texto), rodape: [cancelar, ok], aoFechar: () => resolve(resposta) });
  });
}

// ---------- Formulários ----------

let seq = 0;

/**
 * Constrói um formulário a partir de especificações de campos.
 * @param {Array<object>} specs {nome,label,tipo,opcoes,obrigatorio,dica,min,step,span,placeholder,autocomplete,valor}
 * @param {object} [valores]
 */
export function formulario(specs, valores = {}) {
  const mapa = new Map();
  const grade = h('div', { class: 'form-grid' });
  const erroGeral = h('div', { class: 'form-erro', role: 'alert', hidden: true });

  for (const s of specs) {
    const id = `f${++seq}`;
    const inicial = valores[s.nome] ?? s.valor ?? '';
    let input;
    if (s.tipo === 'select') {
      input = h('select', { id, name: s.nome, required: s.obrigatorio }, s.opcoes.map((o) => h('option', { value: o.valor }, o.rotulo)));
      input.value = String(inicial);
    } else if (s.tipo === 'textarea') {
      input = h('textarea', { id, name: s.nome, required: s.obrigatorio, placeholder: s.placeholder }, String(inicial));
    } else {
      input = h('input', {
        id, name: s.nome, type: s.tipo || 'text', required: s.obrigatorio, min: s.min, max: s.max, step: s.step,
        placeholder: s.placeholder, autocomplete: s.autocomplete, value: inicial,
      });
    }
    const erro = h('span', { class: 'erro', id: `${id}-erro` });
    input.setAttribute('aria-describedby', `${id}-erro`);
    const dica = s.dica ? h('span', { class: 'hint' }, s.dica) : null;
    const el = h('div', { class: `field ${s.span ? 'span-all' : ''}` }, h('label', { for: id }, s.label), input, dica, erro);
    mapa.set(s.nome, { spec: s, input, erro, el });
    grade.append(el);
  }

  function limparErros() {
    erroGeral.hidden = true;
    for (const c of mapa.values()) { c.erro.textContent = ''; c.el.classList.remove('invalid'); c.input.removeAttribute('aria-invalid'); }
  }

  return {
    el: h('div', { class: 'stack' }, erroGeral, grade),
    campo: (nome) => mapa.get(nome),
    ler() {
      const dados = {};
      for (const [nome, c] of mapa) {
        const bruto = c.input.value.trim();
        if (bruto === '') continue;
        dados[nome] = c.spec.tipo === 'number' ? Number(bruto) : bruto;
      }
      return dados;
    },
    mostrarErro(e) {
      limparErros();
      let sobrou = e.detalhes ? [] : [e.message];
      for (const [nome, msg] of Object.entries(e.detalhes || {})) {
        const c = mapa.get(nome);
        if (c) {
          c.erro.textContent = msg;
          c.el.classList.add('invalid');
          c.input.setAttribute('aria-invalid', 'true');
        } else sobrou.push(`${nome}: ${msg}`);
      }
      if (e.detalhes && sobrou.length === 0) sobrou = [];
      if (sobrou.length) {
        erroGeral.textContent = sobrou.join(' ');
        erroGeral.hidden = false;
      }
      const primeiro = [...mapa.values()].find((c) => c.el.classList.contains('invalid'));
      (primeiro?.input || erroGeral).focus?.();
    },
    limparErros,
  };
}

/** Desabilita o botão durante a ação assíncrona. */
export async function comEspera(botao, fn) {
  botao.disabled = true;
  try {
    return await fn();
  } finally {
    botao.disabled = false;
  }
}
