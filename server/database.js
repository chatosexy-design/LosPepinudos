const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'health.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    streak INTEGER DEFAULT 0,
    last_log_date TEXT
  )`);

  // Food / Calories logs
  db.run(`CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    food_name TEXT,
    calories INTEGER,
    date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Habits tracker
  db.run(`CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    habit_name TEXT,
    completed BOOLEAN DEFAULT 0,
    date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Journal (Diario)
  db.run(`CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    entry TEXT,
    date TEXT,
    mood TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Seed some food data for the search engine (mock calorie database)
  db.run(`CREATE TABLE IF NOT EXISTS calorie_db (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    calories INTEGER
  )`);

  db.get("SELECT count(*) as count FROM calorie_db", (err, row) => {
    if (row.count <= 25) { // If it's the small initial seed
      const foods = [
        // --- Saludables ---
        ['Manzana', 52], ['Plátano', 89], ['Pechuga de Pollo', 165], ['Arroz Blanco', 130], 
        ['Huevo', 155], ['Avena', 389], ['Ensalada Mixta', 15], ['Salmón', 208], 
        ['Brócoli', 34], ['Aguacate', 160], ['Pasta', 131], ['Yogurt Griego', 59], 
        ['Almendras', 579], ['Lentejas', 116], ['Quinoa', 120], ['Espinacas', 23],
        
        // --- Comida Chatarra / Snacks ---
        ['Coca Cola 355ml', 140], ['Pepsi 355ml', 150], ['Papas Fritas Bolsa', 536], 
        ['Donas Glaseadas', 452], ['Hamburguesa con Queso', 295], ['Pizza Pepperoni', 266],
        ['Hot Dog', 290], ['Nuggets de Pollo (6pcs)', 280], ['Papas Fritas (M)', 312],
        ['Refresco de Naranja', 160], ['Gansito', 203], ['Papas Sabritas', 160],
        ['Doritos', 150], ['Cheetos', 160], ['Chocolate Hershey', 210],
        
        // --- Postres y Batidos ---
        ['Helado de Chocolate', 216], ['Helado de Vainilla', 201], ['Brownie', 466],
        ['Batido de Fresa', 250], ['Batido de Chocolate', 280], ['Malteada de Vainilla', 350],
        ['Pastel de Chocolate', 371], ['Pay de Limón', 280], ['Galletas Oreo (4)', 213],
        ['Muffin de Arándano', 426], ['Crepa con Nutella', 450],
        
        // --- Comidas Varias ---
        ['Tacos al Pastor (1)', 150], ['Sushi Roll (8pcs)', 300], ['Burrito de Carne', 430],
        ['Lasagna', 135], ['Ceviche', 120], ['Empanada de Carne', 250],
        ['Sándwich de Jamón y Queso', 350], ['Quesadilla', 220], ['Paella', 156],
        
        // --- Ingredientes para personalización ---
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
