const express = require('express');
const router = express.Router();

// Список героїв (з фільтрацією)
router.get('/heroes', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const { brigade, battalion, company } = req.query;

    let where = [];
    let params = [];
    if (brigade) { where.push('brigade = ?'); params.push(brigade); }
    if (battalion) { where.push('battalion = ?'); params.push(battalion); }
    if (company) { where.push('company = ?'); params.push(company); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const heroes = req.db.all(
      `SELECT id, name, callsign, rank, born, fallen, unit, brigade, battalion, company, city, photo, candles FROM heroes ${whereStr} ORDER BY name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const total = req.db.get(`SELECT COUNT(*) as count FROM heroes ${whereStr}`, params);
    res.json({ heroes, pagination: { page, limit, total: total?.count || 0, pages: Math.ceil((total?.count || 0) / limit) } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Помилка сервера' }); }
});

// Список підрозділів для фільтрів
router.get('/units', (req, res) => {
  try {
    const brigades = req.db.all("SELECT DISTINCT brigade FROM heroes WHERE brigade IS NOT NULL AND brigade != '' ORDER BY brigade");
    const battalions = req.db.all("SELECT DISTINCT battalion FROM heroes WHERE battalion IS NOT NULL AND battalion != '' ORDER BY battalion");
    const companies = req.db.all("SELECT DISTINCT company FROM heroes WHERE company IS NOT NULL AND company != '' ORDER BY company");

    // Каскадна фільтрація: якщо обрана бригада — показати тільки її батальйони
    const { brigade, battalion } = req.query;
    let filteredBattalions = battalions;
    let filteredCompanies = companies;

    if (brigade) {
      filteredBattalions = req.db.all("SELECT DISTINCT battalion FROM heroes WHERE brigade = ? AND battalion IS NOT NULL AND battalion != '' ORDER BY battalion", [brigade]);
      filteredCompanies = req.db.all("SELECT DISTINCT company FROM heroes WHERE brigade = ? AND company IS NOT NULL AND company != '' ORDER BY company", [brigade]);
    }
    if (battalion) {
      filteredCompanies = req.db.all("SELECT DISTINCT company FROM heroes WHERE battalion = ? AND company IS NOT NULL AND company != '' ORDER BY company", [battalion]);
    }

    res.json({
      brigades: brigades.map(r => r.brigade),
      battalions: filteredBattalions.map(r => r.battalion),
      companies: filteredCompanies.map(r => r.company)
    });
  } catch (err) { res.status(500).json({ error: 'Помилка' }); }
});

// Пошук
router.get('/heroes/search', (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2) return res.json({ heroes: [] });
    const p = `%${q}%`;
    const heroes = req.db.all('SELECT id, name, callsign, rank, city, photo FROM heroes WHERE name LIKE ? OR callsign LIKE ? OR city LIKE ? OR unit LIKE ? ORDER BY name ASC LIMIT 20', [p, p, p, p]);
    res.json({ heroes });
  } catch (err) { res.status(500).json({ error: 'Помилка пошуку' }); }
});

// Один герой
router.get('/heroes/:id', (req, res) => {
  try {
    const hero = req.db.get('SELECT * FROM heroes WHERE id = ?', [parseInt(req.params.id)]);
    if (!hero) return res.status(404).json({ error: 'Не знайдено' });
    hero.awards = req.db.all('SELECT * FROM awards WHERE hero_id = ?', [hero.id]);
    hero.gallery = req.db.all('SELECT * FROM gallery WHERE hero_id = ? ORDER BY sort_order', [hero.id]);
    hero.media = req.db.all('SELECT * FROM media WHERE hero_id = ? ORDER BY sort_order', [hero.id]);
    res.json(hero);
  } catch (err) { res.status(500).json({ error: 'Помилка сервера' }); }
});

// Свічка
router.post('/heroes/:id/candle', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    req.db.run('UPDATE heroes SET candles = candles + 1 WHERE id = ?', [id]);
    const hero = req.db.get('SELECT candles FROM heroes WHERE id = ?', [id]);
    res.json({ candles: hero?.candles || 0 });
  } catch (err) { res.status(500).json({ error: 'Помилка' }); }
});

// Статистика
router.get('/stats', (req, res) => {
  try {
    const heroes = req.db.get('SELECT COUNT(*) as count FROM heroes');
    const candles = req.db.get('SELECT COALESCE(SUM(candles), 0) as total FROM heroes');
    const stories = req.db.get("SELECT COUNT(*) as count FROM heroes WHERE story IS NOT NULL AND story != ''");
    const media = req.db.get('SELECT COUNT(*) as count FROM media');
    res.json({ heroes: heroes?.count || 0, candles: candles?.total || 0, stories: stories?.count || 0, media: media?.count || 0 });
  } catch (err) { res.status(500).json({ error: 'Помилка' }); }
});

module.exports = router;
