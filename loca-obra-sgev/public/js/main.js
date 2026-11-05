// Ponto de entrada: sessão, casca da aplicação (menu por perfil) e roteamento por hash.

import { api, sessao } from './api.js';
import { h, carregando, erroPainel, toast } from './ui.js';
import authView, { marca } from './views/auth.js';
import dashboardView from './views/dashboard.js';
import disponibilidadeView from './views/disponibilidade.js';
import catalogoView from './views/catalogo.js';
import contratosView from './views/contratos.js';
import operacaoView from './views/operacao.js';
import relatoriosView from './views/relatorios.js';
import cadastrosView from './views/cadastros.js';

const TODOS = ['CLIENTE', 'ATENDENTE', 'ADMIN'];
const EQUIPE = ['ATENDENTE', 'ADMIN'];

const ROTAS = [
  { id: 'painel', rotulo: () => 'Painel', roles: TODOS, view: dashboardView },
  { id: 'disponibilidade', rotulo: () => 'Disponibilidade', roles: TODOS, view: disponibilidadeView },
  { id: 'catalogo', rotulo: () => 'Catálogo', roles: TODOS, view: catalogoView },
  { id: 'contratos', rotulo: (u) => (u.role === 'CLIENTE' ? 'Meus contratos' : 'Contratos'), roles: TODOS, view: contratosView },
  { id: 'operacao', rotulo: () => 'Retirada e vistoria', roles: EQUIPE, view: operacaoView, grupo: 'Operação' },
  { id: 'relatorios', rotulo: () => 'Relatórios', roles: EQUIPE, view: relatoriosView, grupo: 'Operação' },
  { id: 'cadastros', rotulo: () => 'Cadastros', roles: ['ADMIN'], view: cadastrosView, grupo: 'Administração' },
];

const NOME_PERFIL = { CLIENTE: 'Cliente', ATENDENTE: 'Atendente', ADMIN: 'Administrador' };

const app = document.getElementById('app');
let usuario = null;
let geracao = 0; // descarta respostas de navegações antigas

function rotaAtual() {
  const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'painel';
  const permitidas = ROTAS.filter((r) => r.roles.includes(usuario.role));
  return permitidas.find((r) => r.id === id) || permitidas[0];
}

function sair(mensagem) {
  sessao.limpar();
  usuario = null;
  location.hash = '';
  mostrarAuth(mensagem);
}

async function mostrarAuth(mensagem) {
  document.title = 'Entrar · Loca Obra - SGEV';
  app.replaceChildren(await authView({
    mensagem,
    aoEntrar: (u) => {
      usuario = u;
      location.hash = '#/painel';
      montarCasca();
    },
  }));
}

function montarCasca() {
  const itens = [];
  let grupoAtual = null;
  for (const r of ROTAS.filter((x) => x.roles.includes(usuario.role))) {
    if (r.grupo && r.grupo !== grupoAtual) {
      itens.push(h('div', { class: 'nav-group' }, r.grupo));
    }
    grupoAtual = r.grupo || null;
    itens.push(h('a', { href: `#/${r.id}`, 'data-rota': r.id }, r.rotulo(usuario)));
  }

  app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, marca(), h('div', {}, h('div', { class: 'brand-name' }, 'Loca Obra'), h('div', { class: 'brand-sub' }, 'SGEV'))),
      h('nav', { class: 'nav', 'aria-label': 'Principal' }, itens),
      h('div', { class: 'userbox' },
        h('div', {}, h('strong', {}, usuario.nome), h('span', {}, NOME_PERFIL[usuario.role])),
        h('button', { class: 'btn sm', type: 'button', onclick: () => sair() }, 'Sair'))),
    h('main', { class: 'main', id: 'conteudo', tabindex: '-1' })));
  navegar();
}

async function navegar() {
  if (!usuario) return;
  const rota = rotaAtual();
  const eu = ++geracao;
  document.title = `${rota.rotulo(usuario)} · Loca Obra - SGEV`;
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.rota === rota.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const alvo = document.getElementById('conteudo');
  if (!alvo) return;
  alvo.replaceChildren(carregando());
  try {
    const conteudo = await rota.view({ usuario, ir: (id) => { location.hash = `#/${id}`; } });
    if (eu !== geracao) return;
    alvo.replaceChildren(conteudo);
    alvo.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (eu !== geracao) return;
    alvo.replaceChildren(erroPainel(e, navegar));
  }
}

window.addEventListener('hashchange', navegar);
window.addEventListener('sgev:sessao-expirada', () => {
  if (usuario) sair('Sua sessão expirou. Entre novamente para continuar.');
});

async function iniciar() {
  if (sessao.token) {
    try {
      usuario = await api('GET', '/auth/me');
      montarCasca();
      return;
    } catch {
      sessao.limpar();
    }
  }
  await mostrarAuth();
}

iniciar().catch((e) => {
  app.replaceChildren(erroPainel(e, () => location.reload()));
  toast('Não foi possível iniciar o sistema', 'erro');
});
