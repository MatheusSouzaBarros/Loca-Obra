'use strict';

/**
 * @file Conexão com o banco (SQLite via better-sqlite3), criação do schema e helper de transação.
 *
 * O driver é síncrono: cada transação roda de ponta a ponta sem intercalar outras requisições
 * no mesmo processo, o que torna "checar conflito + inserir" atômico. Como defesa em
 * profundidade, um TRIGGER no banco também recusa reservas sobrepostas.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');

const ATIVOS_AGENDA_SQL = "('Reservado','Retirado','Em Atraso')";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('CLIENTE','ATENDENTE','ADMIN')),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  percentual_caucao_base  REAL NOT NULL CHECK (percentual_caucao_base > 0 AND percentual_caucao_base <= 1),
  valor_diaria_base       REAL NOT NULL CHECK (valor_diaria_base > 0)
);

CREATE TABLE IF NOT EXISTS itens (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_patrimonio  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  categoria_id       INTEGER NOT NULL REFERENCES categorias(id),
  nome               TEXT NOT NULL,
  valor_item         REAL NOT NULL CHECK (valor_item > 0),
  status             TEXT NOT NULL DEFAULT 'Disponível'
                     CHECK (status IN ('Disponível','Em Uso','Em Manutenção'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  cpf_cnpj    TEXT NOT NULL UNIQUE,
  telefone    TEXT,
  endereco    TEXT
);

CREATE TABLE IF NOT EXISTS contratos (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id                INTEGER NOT NULL REFERENCES clientes(id),
  item_id                   INTEGER NOT NULL REFERENCES itens(id),
  data_reserva              TEXT NOT NULL,
  data_retirada_prevista    TEXT NOT NULL,
  data_devolucao_prevista   TEXT NOT NULL,
  data_retirada_real        TEXT,
  data_devolucao_real       TEXT,
  valor_diaria              REAL NOT NULL CHECK (valor_diaria > 0),
  valor_caucao_retido       REAL NOT NULL DEFAULT 0 CHECK (valor_caucao_retido >= 0),
  valor_multa               REAL NOT NULL DEFAULT 0 CHECK (valor_multa >= 0),
  status                    TEXT NOT NULL DEFAULT 'Reservado' CHECK (status IN
    ('Reservado','Retirado','Devolvido','Vistoriado','Encerrado','Em Atraso','Encerrado com avaria')),
  -- Campos de liquidação (extensão do modelo base, necessários p/ relatórios de caução)
  valor_caucao_devolvido    REAL,
  valor_cobranca_adicional  REAL NOT NULL DEFAULT 0,
  multa_descontada          INTEGER NOT NULL DEFAULT 0,
  data_encerramento         TEXT,
  CHECK (data_devolucao_prevista > data_retirada_prevista)
);

CREATE INDEX IF NOT EXISTS idx_contratos_item_status ON contratos(item_id, status);
CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON contratos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_itens_categoria ON itens(categoria_id);

CREATE TABLE IF NOT EXISTS vistorias (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_id    INTEGER NOT NULL REFERENCES contratos(id),
  tipo           TEXT NOT NULL CHECK (tipo IN ('Entrada','Saída')),
  tem_avaria     INTEGER NOT NULL DEFAULT 0 CHECK (tem_avaria IN (0,1)),
  custo_avaria   REAL NOT NULL DEFAULT 0 CHECK (custo_avaria >= 0),
  observacoes    TEXT,
  data_vistoria  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vistorias_contrato ON vistorias(contrato_id);

-- Defesa em profundidade contra double booking: mesma regra de sobreposição da camada de serviço.
CREATE TRIGGER IF NOT EXISTS trg_contratos_sem_sobreposicao
BEFORE INSERT ON contratos
WHEN NEW.status IN ${ATIVOS_AGENDA_SQL}
BEGIN
  SELECT RAISE(ABORT, 'CONFLITO_AGENDA')
  WHERE EXISTS (
    SELECT 1 FROM contratos
    WHERE item_id = NEW.item_id
      AND status IN ${ATIVOS_AGENDA_SQL}
      AND data_retirada_prevista < NEW.data_devolucao_prevista
      AND data_devolucao_prevista > NEW.data_retirada_prevista
  );
END;
`;

/**
 * Abre a conexão e aplica o schema (idempotente).
 * @returns {import('better-sqlite3').Database}
 */
function abrir() {
  if (env.dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
  }
  const conexao = new Database(env.dbPath);
  conexao.pragma('journal_mode = WAL');
  conexao.pragma('foreign_keys = ON');
  conexao.exec(SCHEMA);
  return conexao;
}

const db = abrir();

/**
 * Executa `fn` dentro de uma transação (commit se retornar, rollback se lançar).
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function emTransacao(fn) {
  return db.transaction(fn)();
}

module.exports = { db, emTransacao };
