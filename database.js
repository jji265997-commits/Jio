const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./fampay.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      utr TEXT,
      email_proof TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);

  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, row) => {
    if (!row) {
      db.run('INSERT INTO admins (username, password) VALUES (?, ?)', [username, hash]);
      console.log(`✅ Default admin created: ${username} / ${password}`);
    }
  });
});

module.exports = db;