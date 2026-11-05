// Tela de autenticação: entrar e cadastrar, com seletor de perfil quando o ambiente permite (testes).

import { api, sessao } from '../api.js';
import { h, formulario, comEspera, toast } from '../ui.js';

const CONTAS_TESTE = [
  { rotulo: 'Administrador', email: 'admin@locaobra.com', senha: 'Admin@123' },
  { rotulo: 'Atendente', email: 'atendente@locaobra.com', senha: 'Atendente@123' },
  { rotulo: 'Cliente', email: 'cliente@locaobra.com', senha: 'Cliente@123' },
];

const PERFIS = [
  { valor: 'CLIENTE', rotulo: 'Cliente' },
  { valor: 'ATENDENTE', rotulo: 'Atendente / operacional' },
  { valor: 'ADMIN', rotulo: 'Administrador' },
];

/**
 * @param {{aoEntrar:(usuario:object)=>void, mensagem?:string}} ctx
 * @returns {Promise<HTMLElement>}
 */
export default async function authView({ aoEntrar, mensagem }) {
  let selecaoPerfil = false;
  try {
    selecaoPerfil = (await api('GET', '/auth/config')).selecao_de_perfil;
  } catch { /* segue sem seletor */ }

  const painel = h('div', { class: 'auth-card' });
  let modo = 'entrar';

  const mostrar = (novo) => {
    modo = novo;
    painel.replaceChildren(
      h('div', { class: 'tabs', role: 'tablist' },
        h('button', { role: 'tab', type: 'button', 'aria-selected': String(modo === 'entrar'), onclick: () => mostrar('entrar') }, 'Entrar'),
        h('button', { role: 'tab', type: 'button', 'aria-selected': String(modo === 'cadastrar'), onclick: () => mostrar('cadastrar') }, 'Criar conta')),
      modo === 'entrar' ? formEntrar() : formCadastro());
  };

  function formEntrar() {
    const f = formulario([
      { nome: 'email', label: 'E-mail', tipo: 'email', obrigatorio: true, autocomplete: 'username', span: true },
      { nome: 'senha', label: 'Senha', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', span: true },
    ]);
    const botao = h('button', { class: 'btn primary', type: 'submit' }, 'Entrar');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      f.limparErros();
      await comEspera(botao, async () => {
        try {
          const r = await api('POST', '/auth/login', f.ler());
          sessao.salvar(r.token);
          aoEntrar(r.usuario);
        } catch (err) {
          f.mostrarErro(err);
        }
      });
    } }, f.el, botao);

    if (selecaoPerfil) {
      form.preencher = (conta) => {
        f.campo('email').input.value = conta.email;
        f.campo('senha').input.value = conta.senha;
        f.campo('senha').input.focus();
      };
    }
    formAtual = form;
    return form;
  }

  function formCadastro() {
    const specs = [
      { nome: 'nome', label: 'Nome completo', obrigatorio: true, autocomplete: 'name', span: true },
      { nome: 'email', label: 'E-mail', tipo: 'email', obrigatorio: true, autocomplete: 'email', span: true },
      { nome: 'senha', label: 'Senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', dica: 'Mínimo de 8 caracteres.', span: true },
    ];
    if (selecaoPerfil) {
      specs.push({ nome: 'role', label: 'Perfil (apenas para testes)', tipo: 'select', opcoes: PERFIS, span: true, valor: 'CLIENTE' });
    }
    const base = formulario(specs);
    const dadosCliente = formulario([
      { nome: 'cpf_cnpj', label: 'CPF ou CNPJ', obrigatorio: true, placeholder: 'Somente números ou com máscara' },
      { nome: 'telefone', label: 'Telefone', autocomplete: 'tel' },
      { nome: 'endereco', label: 'Endereço da obra ou da empresa', span: true, autocomplete: 'street-address' },
    ]);
    const blocoCliente = h('div', {}, dadosCliente.el);
    const sincronizar = () => {
      const perfil = base.campo('role') ? base.campo('role').input.value : 'CLIENTE';
      blocoCliente.hidden = perfil !== 'CLIENTE';
    };
    base.campo('role')?.input.addEventListener('change', sincronizar);

    const botao = h('button', { class: 'btn primary', type: 'submit' }, 'Criar conta');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      base.limparErros();
      dadosCliente.limparErros();
      const corpo = { ...base.ler(), ...(blocoCliente.hidden ? {} : dadosCliente.ler()) };
      await comEspera(botao, async () => {
        try {
          const r = await api('POST', '/auth/register', corpo);
          sessao.salvar(r.token);
          toast('Conta criada. Bem-vindo!');
          aoEntrar(r.usuario);
        } catch (err) {
          const campoCliente = err.detalhes && Object.keys(err.detalhes).some((k) => dadosCliente.campo(k));
          base.mostrarErro(err);
          if (campoCliente) dadosCliente.mostrarErro(err);
        }
      });
    } }, base.el, blocoCliente, botao);
    sincronizar();
    formAtual = null;
    return form;
  }

  let formAtual = null;
  const painelDemo = h('div', { class: 'auth-demo', hidden: !selecaoPerfil },
    h('h2', {}, 'Contas de teste'),
    h('p', { class: 'small', style: 'margin:0 0 10px' }, 'Preenche o formulário de entrada com uma conta de demonstração.'),
    h('div', { class: 'chips' }, CONTAS_TESTE.map((c) =>
      h('button', { class: 'chip', type: 'button', onclick: () => {
        if (modo !== 'entrar') mostrar('entrar');
        formAtual?.preencher?.(c);
      } }, c.rotulo))));

  mostrar('entrar');
  if (mensagem) painel.prepend(h('div', { class: 'form-erro', role: 'alert', style: 'margin-bottom:14px' }, mensagem));

  return h('div', { class: 'auth' },
    h('section', { class: 'auth-side' },
      h('div', {},
        h('div', { class: 'brand', style: 'padding:0 0 28px' }, marca(), h('div', {}, h('div', { class: 'brand-name' }, 'Loca Obra'), h('div', { class: 'brand-sub' }, 'SGEV'))),
        h('h1', {}, 'Cada equipamento, uma reserva por vez.'),
        h('p', {}, 'Consulte a agenda futura, reserve sem conflito e acompanhe retirada, vistoria e devolução do caução.')),
      h('div', { class: 'sample-board', 'aria-hidden': 'true' },
        h('div', { style: '--from:8%;--len:34%' }), h('div', { style: '--from:38%;--len:22%' }), h('div', { style: '--from:12%;--len:18%' }), h('div', { style: '--from:55%;--len:30%' })),
      painelDemo),
    h('main', { class: 'auth-main', id: 'conteudo' }, painel));
}

export function marca() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', 'brand-mark');
  svg.setAttribute('aria-hidden', 'true');
  const fundo = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ width: 32, height: 32, rx: 6, fill: '#f2a900' })) fundo.setAttribute(k, v);
  const traco = document.createElementNS(ns, 'path');
  traco.setAttribute('d', 'M4 24 L14 8 h6 L10 24z M16 24 L26 8 h2 v4 L22 24z');
  traco.setAttribute('fill', '#17232f');
  svg.append(fundo, traco);
  return svg;
}
