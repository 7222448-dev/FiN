const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

async function start() {
  const db = await initDatabase();
  console.log('✅ База даних підключена');

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'memorial-heroes-ua-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true }
  }));

  app.use((req, res, next) => { req.db = db; next(); });

  app.use('/api', require('./routes/api'));
  app.use('/admin', require('./routes/admin'));

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.get('/hero/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  app.listen(PORT, () => {
    console.log(`\n🕯️  Книга Пам'яті: http://localhost:${PORT}`);
    console.log(`📋 Адмін-панель:   http://localhost:${PORT}/admin\n`);
  });
}

start().catch(e => { console.error('Помилка запуску:', e); process.exit(1); });
