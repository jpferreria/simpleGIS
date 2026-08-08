const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'simplegis.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Initialize the schema
    db.run(`CREATE TABLE IF NOT EXISTS features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,          -- e.g., 'Feature'
      geometry_type TEXT NOT NULL, -- e.g., 'Point', 'LineString', 'Polygon'
      geometry TEXT NOT NULL,      -- JSON representation of coordinates
      properties TEXT,             -- JSON representation of properties
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('Error creating features table', err.message);
      } else {
        console.log('Features table is ready.');
      }
    });
  }
});

module.exports = db;
