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
