const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const axios = require('axios');
const db = require('./database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'super_secret_green_key';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware to verify JWT (guest mode allowed)
const authenticate = (req, res, next) => {
  const header = req.headers['authorization'];

  // If no token, treat as guest (shared demo user)
  if (!header) {
    req.userId = 0;
    return next();
  }

  const parts = header.split(' ');
  const token = parts.length === 2 ? parts[1] : null;
  if (!token) {
    req.userId = 0;
    return next();
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      req.userId = 0;
      return next();
    }
    req.userId = decoded.id;
    next();
  });
};

function computeTDEE(profile) {
  const sex = (profile.sex || 'M').toUpperCase();
  const w = Number(profile.weight_kg || 60);
  const h = Number(profile.height_cm || 165);
  const a = Number(profile.age || 17);
  let bmr = sex === 'F' ? 10 * w + 6.25 * h - 5 * a - 161 : 10 * w + 6.25 * h - 5 * a + 5;
  let factor = 1.4;
  const act = (profile.activity || 'moderada').toLowerCase();
  if (act.includes('ligera')) factor = 1.375;
  else if (act.includes('moder')) factor = 1.55;
  else if (act.includes('intensa')) factor = 1.725;
  let tdee = Math.round(bmr * factor);
  const goal = (profile.goal || 'mantener').toLowerCase();
  if (goal.includes('bajar')) tdee -= 250;
  if (goal.includes('subir')) tdee += 250;
  if (tdee < 1200) tdee = 1200;
  return tdee;
}

function pick(items, target) {
  const result = [];
  let sum = 0;
  for (const it of items) {
    if (sum + it.calories <= target) {
      result.push(it);
      sum += it.calories;
    }
    if (sum >= target * 0.9) break;
  }
  return { list: result, total: sum };
}

function generatePlanFor(calTarget, rows) {
  const healthyPrefs = ['Avena','Yogurt Griego','Manzana','Plátano','Pechuga de Pollo','Arroz Blanco','Ensalada Mixta','Brócoli','Lentejas','Quinoa','Espinacas','Salmón','Aguacate','Pasta'];
  const healthy = rows.filter(r => healthyPrefs.some(p => r.name.includes(p)));
  const byCalories = arr => [...arr].sort((a,b)=>a.calories-b.calories);
  const bTarget = Math.round(calTarget * 0.25);
  const lTarget = Math.round(calTarget * 0.4);
  const dTarget = Math.round(calTarget * 0.25);
  const sTarget = Math.round(calTarget * 0.1);
  const breakfast = pick(byCalories(healthy), bTarget);
  const lunch = pick(byCalories([...healthy].reverse()), lTarget);
  const dinner = pick(byCalories(healthy), dTarget);
  const snacks = pick(byCalories(rows.filter(r => r.name.includes('Manzana') || r.name.includes('Yogurt') || r.name.includes('Plátano'))), sTarget);
  return [
    ...breakfast.list.map(i => ({ meal_type: 'Desayuno', item_name: i.name, calories: i.calories })),
    ...lunch.list.map(i => ({ meal_type: 'Almuerzo', item_name: i.name, calories: i.calories })),
    ...dinner.list.map(i => ({ meal_type: 'Cena', item_name: i.name, calories: i.calories })),
    ...snacks.list.map(i => ({ meal_type: 'Snack', item_name: i.name, calories: i.calories })),
  ];
}

// --- AUTH ROUTES ---
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  const hash = bcrypt.hashSync(password, 8);
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hash], function(err) {
    if (err) return res.status(400).json({ error: 'Username already exists' });
    res.json({ id: this.lastID });
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, streak: user.streak } });
  });
});

app.get('/api/profile', authenticate, (req, res) => {
  if (req.userId === 0) {
    return res.json({ full_name: 'Invitado', age: 17, sex: 'M', height_cm: 170, weight_kg: 65, activity: 'moderada', goal: 'mantener', allergies: '' });
  }
  db.get(`SELECT full_name, age, sex, height_cm, weight_kg, activity, goal, allergies FROM users WHERE id = ?`, [req.userId], (err, row) => {
    if (!row) return res.json({ full_name: '', age: null, sex: '', height_cm: null, weight_kg: null, activity: '', goal: '', allergies: '' });
    res.json(row);
  });
});

app.put('/api/profile', authenticate, (req, res) => {
  const { full_name, age, sex, height_cm, weight_kg, activity, goal, allergies } = req.body;
  if (req.userId === 0) return res.json({ success: true });
  db.run(`UPDATE users SET full_name = ?, age = ?, sex = ?, height_cm = ?, weight_kg = ?, activity = ?, goal = ?, allergies = ? WHERE id = ?`,
    [full_name || null, age || null, sex || null, height_cm || null, weight_kg || null, activity || null, goal || null, allergies || null, req.userId],
    function(err){ res.json({ success: true }); });
});

app.get('/api/meal-plan', authenticate, (req, res) => {
  const date = new Date().toISOString().split('T')[0];
  db.all(`SELECT * FROM meal_plans WHERE user_id = ? AND date = ?`, [req.userId, date], (err, rows) => {
    if (rows && rows.length > 0) return res.json(rows);
    const uid = req.userId;
    const getProfile = cb => {
      if (uid === 0) return cb({ sex:'M', weight_kg:65, height_cm:170, age:17, activity:'moderada', goal:'mantener' });
      db.get(`SELECT sex, weight_kg, height_cm, age, activity, goal FROM users WHERE id = ?`, [uid], (e, r)=> cb(r || {}));
    };
    getProfile(profile => {
      const target = computeTDEE(profile);
      db.all(`SELECT name, calories FROM calorie_db`, (e, foodRows) => {
        const plan = generatePlanFor(target, foodRows || []);
        const stmt = db.prepare(`INSERT INTO meal_plans (user_id, date, meal_type, item_name, calories, eaten) VALUES (?, ?, ?, ?, ?, 0)`);
        plan.forEach(p => stmt.run(uid, date, p.meal_type, p.item_name, p.calories));
        stmt.finalize(() => {
          db.all(`SELECT * FROM meal_plans WHERE user_id = ? AND date = ?`, [uid, date], (e2, rows2) => res.json(rows2 || []));
        });
      });
    });
  });
});

app.post('/api/meal-plan/:id/eat', authenticate, (req, res) => {
  const id = req.params.id;
  const date = new Date().toISOString().split('T')[0];
  db.get(`SELECT * FROM meal_plans WHERE id = ? AND user_id = ?`, [id, req.userId], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.run(`UPDATE meal_plans SET eaten = 1 WHERE id = ?`, [id], () => {
      db.run(`INSERT INTO food_logs (user_id, food_name, calories, date) VALUES (?, ?, ?, ?)`, [req.userId, row.item_name, row.calories, date], () => {
        res.json({ success: true });
      });
    });
  });
});

// --- FOOD & CALORIES ---
app.get('/api/search-food', async (req, res) => {
  const query = req.query.q;
  
  try {
    // Attempt to get from Edamam API (Real nutrition data)
    const edamamRes = await axios.get(`https://api.edamam.com/api/food-database/v2/parser`, {
      params: {
        app_id: process.env.EDAMAM_APP_ID,
        app_key: process.env.EDAMAM_APP_KEY,
        ingr: query,
        category: 'generic-foods' // To include snacks/junk
      }
    });

    const externalFoods = (edamamRes.data.hints || []).map(hint => ({
      name: hint.food.label,
      calories: Math.round(hint.food.nutrients.ENERC_KCAL),
      source: 'Edamam'
    }));

    // Also search local DB
    db.all(`SELECT * FROM calorie_db WHERE name LIKE ?`, [`%${query}%`], (err, rows) => {
      const localFoods = (rows || []).map(r => ({ ...r, source: 'Local' }));
      
      // Combine and remove duplicates (by name)
      const combined = [...localFoods, ...externalFoods];
      const unique = Array.from(new Map(combined.map(item => [item.name.toLowerCase(), item])).values());
      
      res.json(unique.slice(0, 20));
    });
  } catch (error) {
    console.error('API Error:', error.message);
    // Fallback to local DB if API fails
    db.all(`SELECT * FROM calorie_db WHERE name LIKE ?`, [`%${query}%`], (err, rows) => {
      res.json(rows || []);
    });
  }
});

app.post('/api/log-food', authenticate, (req, res) => {
  const { food_name, calories } = req.body;
  const date = new Date().toISOString().split('T')[0];
  db.run(`INSERT INTO food_logs (user_id, food_name, calories, date) VALUES (?, ?, ?, ?)`, 
    [req.userId, food_name, calories, date], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // If it's a guest session, do not attempt streak logic
      if (req.userId === 0) {
        return res.json({ success: true, streak: 0 });
      }

      // Update streak logic (simplified: if logged today, and was logged yesterday, increase streak)
      db.get(`SELECT last_log_date, streak FROM users WHERE id = ?`, [req.userId], (err, user) => {
        if (err || !user) {
          return res.json({ success: true, streak: 0 });
        }

        let newStreak = user.streak;
        const lastDate = user.last_log_date;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastDate === yesterdayStr) {
          newStreak++;
        } else if (lastDate !== date) {
          newStreak = 1;
        }

        db.run(`UPDATE users SET streak = ?, last_log_date = ? WHERE id = ?`, [newStreak, date, req.userId]);
        res.json({ success: true, streak: newStreak });
      });
  });
});

app.get('/api/daily-logs', authenticate, (req, res) => {
  const date = new Date().toISOString().split('T')[0];
  db.all(`SELECT * FROM food_logs WHERE user_id = ? AND date = ?`, [req.userId, date], (err, rows) => {
    res.json(rows);
  });
});

// --- HABITS ---
app.get('/api/habits', authenticate, (req, res) => {
  const date = new Date().toISOString().split('T')[0];
  db.all(`SELECT * FROM habits WHERE user_id = ? AND date = ?`, [req.userId, date], (err, rows) => {
    res.json(rows);
  });
});

app.post('/api/habits', authenticate, (req, res) => {
  const { habit_name } = req.body;
  const date = new Date().toISOString().split('T')[0];
  db.run(`INSERT INTO habits (user_id, habit_name, completed, date) VALUES (?, ?, 0, ?)`, 
    [req.userId, habit_name, date], function(err) {
      res.json({ id: this.lastID });
  });
});

app.put('/api/habits/:id', authenticate, (req, res) => {
  const { completed } = req.body;
  db.run(`UPDATE habits SET completed = ? WHERE id = ? AND user_id = ?`, 
    [completed ? 1 : 0, req.params.id, req.userId], (err) => {
      res.json({ success: true });
  });
});

// --- JOURNAL ---
app.post('/api/journal', authenticate, (req, res) => {
  const { entry, mood } = req.body;
  const date = new Date().toISOString().split('T')[0];
  db.run(`INSERT INTO journal (user_id, entry, mood, date) VALUES (?, ?, ?, ?)`, 
    [req.userId, entry, mood, date], function(err) {
      res.json({ success: true });
  });
});

app.get('/api/journal', authenticate, (req, res) => {
  db.all(`SELECT * FROM journal WHERE user_id = ? ORDER BY date DESC`, [req.userId], (err, rows) => {
    res.json(rows);
  });
});

// --- STATS / PATTERNS ---
app.get('/api/stats', authenticate, (req, res) => {
  db.all(`SELECT date, SUM(calories) as total FROM food_logs WHERE user_id = ? GROUP BY date ORDER BY date DESC LIMIT 7`, 
    [req.userId], (err, rows) => {
      res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
