const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'memorial.db');
let db = null;

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  const schema = [
    `CREATE TABLE IF NOT EXISTS heroes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, callsign TEXT,
      rank TEXT, born TEXT, fallen TEXT, unit TEXT, 
      brigade TEXT, battalion TEXT, company TEXT,
      city TEXT, story TEXT,
      photo TEXT, candles INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hero_id INTEGER NOT NULL,
      title TEXT NOT NULL, FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hero_id INTEGER NOT NULL,
      filename TEXT NOT NULL, caption TEXT, sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hero_id INTEGER NOT NULL,
      type TEXT NOT NULL, filename TEXT NOT NULL, title TEXT, duration TEXT,
      sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  schema.forEach(s => db.run(s));

  try {
    db.run('CREATE INDEX IF NOT EXISTS idx_heroes_name ON heroes(name)');
    db.run('CREATE INDEX IF NOT EXISTS idx_heroes_brigade ON heroes(brigade)');
    db.run('CREATE INDEX IF NOT EXISTS idx_heroes_battalion ON heroes(battalion)');
    db.run('CREATE INDEX IF NOT EXISTS idx_heroes_company ON heroes(company)');
    db.run('CREATE INDEX IF NOT EXISTS idx_awards_hero ON awards(hero_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_gallery_hero ON gallery(hero_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_media_hero ON media(hero_id)');
  } catch(e) {}

  // Міграція: додати нові колонки якщо їх нема
  try { db.run('ALTER TABLE heroes ADD COLUMN brigade TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE heroes ADD COLUMN battalion TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE heroes ADD COLUMN company TEXT'); } catch(e) {}

  // Адмін за замовчуванням
  const r = db.exec('SELECT COUNT(*) FROM admins');
  if ((r[0]?.values[0]?.[0] || 0) === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('✅ Адмін створений: admin / admin123');
    console.log('⚠️  Змініть пароль після першого входу!');
  }

  saveDb();

  // Автозбереження
  setInterval(saveDb, 30000);

  return createWrapper();
}

function createWrapper() {
  return {
    all(sql, params = []) {
      try {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      } catch(e) { console.error('DB all:', e.message); return []; }
    },
    get(sql, params = []) {
      try {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        let row = null;
        if (stmt.step()) row = stmt.getAsObject();
        stmt.free();
        return row;
      } catch(e) { console.error('DB get:', e.message); return null; }
    },
    run(sql, params = []) {
      try {
        db.run(sql, params);
        const changes = db.getRowsModified();
        const r = db.exec('SELECT last_insert_rowid()');
        const lastId = r[0]?.values[0]?.[0] || 0;
        saveDb();
        return { changes, lastInsertRowid: lastId };
      } catch(e) { console.error('DB run:', e.message); return { changes: 0, lastInsertRowid: 0 }; }
    },
    exec(sql) { db.run(sql); saveDb(); }
  };
}

module.exports = { initDatabase };
