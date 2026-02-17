const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'health.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    streak INTEGER DEFAULT 0,
    last_log_date TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    food_name TEXT,
    calories INTEGER,
    date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    habit_name TEXT,
    completed BOOLEAN DEFAULT 0,
    date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    entry TEXT,
    date TEXT,
    mood TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS calorie_db (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    calories INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS meal_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT,
    meal_type TEXT,
    item_name TEXT,
    calories INTEGER,
    eaten BOOLEAN DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.all(`PRAGMA table_info(users)`, (err, rows) => {
    const cols = rows.map(r => r.name);
    const alters = [];
    if (!cols.includes('full_name')) alters.push(`ALTER TABLE users ADD COLUMN full_name TEXT`);
    if (!cols.includes('age')) alters.push(`ALTER TABLE users ADD COLUMN age INTEGER`);
    if (!cols.includes('sex')) alters.push(`ALTER TABLE users ADD COLUMN sex TEXT`);
    if (!cols.includes('height_cm')) alters.push(`ALTER TABLE users ADD COLUMN height_cm REAL`);
    if (!cols.includes('weight_kg')) alters.push(`ALTER TABLE users ADD COLUMN weight_kg REAL`);
    if (!cols.includes('activity')) alters.push(`ALTER TABLE users ADD COLUMN activity TEXT`);
    if (!cols.includes('goal')) alters.push(`ALTER TABLE users ADD COLUMN goal TEXT`);
    if (!cols.includes('allergies')) alters.push(`ALTER TABLE users ADD COLUMN allergies TEXT`);
    if (alters.length > 0) {
      db.serialize(() => {
        alters.forEach(s => db.run(s));
      });
    }
  });

  db.get("SELECT count(*) as count FROM calorie_db", (err, row) => {
    if (row.count <= 25) { // If it's the small initial seed
      const foods = [
        ['Manzana', 52], ['Plátano', 89], ['Pechuga de Pollo', 165], ['Arroz Blanco', 130], 
        ['Huevo', 155], ['Avena', 389], ['Ensalada Mixta', 15], ['Salmón', 208], 
        ['Brócoli', 34], ['Aguacate', 160], ['Pasta', 131], ['Yogurt Griego', 59], 
        ['Almendras', 579], ['Lentejas', 116], ['Quinoa', 120], ['Espinacas', 23],
        ['Coca Cola 355ml', 140], ['Pepsi 355ml', 150], ['Papas Fritas Bolsa', 536], 
        ['Donas Glaseadas', 452], ['Hamburguesa con Queso', 295], ['Pizza Pepperoni', 266],
        ['Hot Dog', 290], ['Nuggets de Pollo (6pcs)', 280], ['Papas Fritas (M)', 312],
        ['Refresco de Naranja', 160], ['Gansito', 203], ['Papas Sabritas', 160],
        ['Doritos', 150], ['Cheetos', 160], ['Chocolate Hershey', 210],
        ['Helado de Chocolate', 216], ['Helado de Vainilla', 201], ['Brownie', 466],
        ['Batido de Fresa', 250], ['Batido de Chocolate', 280], ['Malteada de Vainilla', 350],
        ['Pastel de Chocolate', 371], ['Pay de Limón', 280], ['Galletas Oreo (4)', 213],
        ['Muffin de Arándano', 426], ['Crepa con Nutella', 450],
        ['Tacos al Pastor (1)', 150], ['Sushi Roll (8pcs)', 300], ['Burrito de Carne', 430],
        ['Lasagna', 135], ['Ceviche', 120], ['Empanada de Carne', 250],
        ['Sándwich de Jamón y Queso', 350], ['Quesadilla', 220], ['Paella', 156],
        ['Pan de Torta', 150], ['Jamón (rebanada)', 30], ['Queso Panela (30g)', 80],
        ['Aguacate (1/4)', 60], ['Lechuga (taza)', 5], ['Jitomate (rebanada)', 4],
        ['Cebolla (rebanada)', 4], ['Mayonesa (cucharada)', 90], ['Mostaza (cucharada)', 10],
        ['Chiles en vinagre', 10], ['Frijoles Refritos (cucharada)', 45],
        ['Tortilla de Maíz', 52], ['Carne al Pastor (100g)', 170], ['Cilantro y Cebolla', 5],
        ['Salsa Roja/Verde', 10], ['Piña (trozo)', 5]
      ];
      const stmt = db.prepare("INSERT INTO calorie_db (name, calories) VALUES (?, ?)");
      foods.forEach(f => stmt.run(f));
      stmt.finalize();
    }
  });
});

module.exports = db;
