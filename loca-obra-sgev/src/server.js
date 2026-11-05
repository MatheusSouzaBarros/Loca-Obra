'use strict';

const env = require('./config/env');
const { db } = require('./config/database');
const { semearSeVazio } = require('./config/seed');
const criarApp = require('./app');

semearSeVazio();

const app = criarApp();
const servidor = app.listen(env.port, () => {
  console.log(`Loca Obra - SGEV em http://localhost:${env.port} (${env.nodeEnv})`);
});

function encerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
