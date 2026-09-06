const { Pool } = require('pg');
const dbConfig  = require('./config');

const pool = new Pool({ ...dbConfig, max: 10, idleTimeoutMillis: 30000 });

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

module.exports = pool;
