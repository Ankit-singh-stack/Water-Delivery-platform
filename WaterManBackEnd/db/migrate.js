#!/usr/bin/env node
/**
 * db/migrate.js — Run schema.sql against the database configured in .env
 *
 * Usage:
 *   node db/migrate.js          (applies schema.sql)
 *   node db/migrate.js --check  (test connection only)
 */

const { Client } = require('pg');
const dbConfig   = require('./config');
const fs   = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');

// migrate uses a plain Client; ssl: undefined → convert to false for Client compat
const config = { ...dbConfig, ssl: dbConfig.ssl || false };

const LINE = '─'.repeat(52);

async function migrate() {
  console.log('\n' + LINE);
  console.log('  WaterMan DB Migration');
  console.log(LINE);
  console.log(`  Host     : ${config.host}:${config.port}`);
  console.log(`  Database : ${config.database}`);
  console.log(`  User     : ${config.user}`);
  console.log(LINE + '\n');

  const client = new Client(config);

  try {
    process.stdout.write('  Connecting…  ');
    await client.connect();
    console.log('✓ Connected\n');

    if (CHECK_ONLY) {
      console.log('  --check mode: connection OK, skipping migration.\n');
      return;
    }

    const sqlPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`schema.sql not found at ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    process.stdout.write('  Applying schema.sql…  ');
    await client.query(sql);
    console.log('✓ Done\n');

    // Report table counts
    const { rows } = await client.query(`
      SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('  Tables in database:\n');
    rows.forEach(r => console.log(`    ✓  ${r.table_name.padEnd(28)} ${r.size}`));
    console.log('\n' + LINE);
    console.log('  Migration complete.');
    console.log(LINE + '\n');

  } catch (err) {
    console.error('\n  ✗ Migration failed:\n');
    console.error(' ', err.message);
    if (err.detail)   console.error('  Detail:', err.detail);
    if (err.hint)     console.error('  Hint  :', err.hint);
    console.error('\n' + LINE + '\n');
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
