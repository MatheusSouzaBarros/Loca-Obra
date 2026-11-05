// Cliente HTTP da API. Guarda o JWT e padroniza os erros.

const CHAVE = 'sgev.token';

export class ApiError extends Error {
  constructor(status, corpo) {
    super(corpo?.mensagem || 'Não foi possível concluir a operação');
    this.status = status;
    this.codigo = corpo?.codigo;
    this.detalhes = corpo?.detalhes;
  }
}

export const sessao = {
  get token() {
    try { return localStorage.getItem(CHAVE); } catch { return null; }
  },
  salvar(token) {
    try { localStorage.setItem(CHAVE, token); } catch { /* armazenamento indisponível */ }
  },
  limpar() {
    try { localStorage.removeItem(CHAVE); } catch { /* armazenamento indisponível */ }
  },
};

/** Monta query string ignorando valores vazios. */
export function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api(metodo, caminho, corpo) {
  const headers = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (sessao.token) headers.Authorization = `Bearer ${sessao.token}`;

  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, { method: metodo, headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  } catch {
    throw new ApiError(0, { mensagem: 'Sem conexão com o servidor. Verifique sua rede e tente novamente.' });
  }
  if (resposta.status === 204) return null;

  let json = null;
  try { json = await resposta.json(); } catch { /* corpo vazio */ }

  if (!resposta.ok) {
    if (resposta.status === 401 && sessao.token && !caminho.startsWith('/auth/login')) {
      sessao.limpar();
      window.dispatchEvent(new CustomEvent('sgev:sessao-expirada'));
    }
    throw new ApiError(resposta.status, json?.erro);
  }
  return json;
}

export const get = (caminho, params) => api('GET', caminho + (params ? qs(params) : ''));
export const post = (caminho, corpo = {}) => api('POST', caminho, corpo);
export const put = (caminho, corpo) => api('PUT', caminho, corpo);
export const patch = (caminho, corpo) => api('PATCH', caminho, corpo);
export const del = (caminho) => api('DELETE', caminho);
