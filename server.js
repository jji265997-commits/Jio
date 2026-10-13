require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const QRCode = require('qrcode');
const path = require('path');
const db = require('./database');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function generateUPILink(amount, orderId) {
  const upiId = process.env.UPI_ID;
  const name = encodeURIComponent(process.env.PAYEE_NAME);
  const note = encodeURIComponent(`Order ${orderId}`);
  return `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR&tn=${note}&tr=${orderId}`;
}

/* CUSTOMER APIs */
app.post('/api/create-order', (req, res) => {
  const { amount, customerName, customerEmail } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const orderId = 'ORD' + Date.now();
  const stmt = db.prepare(`
    INSERT INTO orders (order_id, customer_name, customer_email, amount)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run([orderId, customerName, customerEmail, parseFloat(amount)], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      orderId,
      amount,
      upiLink: generateUPILink(amount, orderId),
      upiId: process.env.UPI_ID,
      payeeName: process.env.PAYEE_NAME,
      qrData: generateUPILink(amount, orderId)
    });
  });
  stmt.finalize();
});

app.get('/api/order/:orderId', (req, res) => {
  db.get('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
});

/* GMAIL IMAP VERIFY */
async function checkPaymentEmail(amount) {
  const config = {
    imap: {
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASS,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    }
  };

  const connection = await imaps.connect(config);
  await connection.openBox('INBOX');

  const delay = 24 * 3600 * 1000;
  const since = new Date(Date.now() - delay);
  const searchCriteria = ['UNSEEN', ['SINCE', since.toISOString()], ['FROM', 'fam']];
  const fetchOptions = { bodies: [''], markSeen: false };
  const messages = await connection.search(searchCriteria, fetchOptions);

  let matched = null;
  for (const item of messages) {
    const all = item.parts.find(p => p.which === '');
    const parsed = await simpleParser(all.body);
    const text = (parsed.text || parsed.subject || '').toLowerCase();
    if (text.includes(String(amount))) {
      const utrMatch = text.match(/\b\d{12}\b/);
      matched = {
        subject: parsed.subject,
        from: parsed.from?.text,
        date: parsed.date,
        utr: utrMatch ? utrMatch[0] : null,
        snippet: text.substring(0, 300)
      };
      break;
    }
  }
  connection.end();
  return matched;
}

app.post('/api/verify-payment', (req, res) => {
  const { orderId } = req.body;
  db.get('SELECT * FROM orders WHERE order_id = ?', [orderId], async (err, order) => {
    if (err || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'paid') return res.json({ status: 'paid', order });

    try {
      const match = await checkPaymentEmail(order.amount);
      if (match) {
        db.run(
          `UPDATE orders SET status='paid', paid_at=CURRENT_TIMESTAMP, utr=?, email_proof=? WHERE order_id=?`,
          [match.utr, JSON.stringify(match), orderId]
        );
        return res.json({ status: 'paid', order: { ...order, status: 'paid' } });
      }
      res.json({ status: 'pending', message: 'Payment pending' });
    } catch (e) {
      res.status(500).json({ error: 'Email check failed', details: e.message });
    }
  });
});

/* ADMIN AUTH */
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, admin) => {
    if (err || !admin) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.adminId = admin.id;
    req.session.username = admin.username;
    res.json({ success: true, username: admin.username });
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username });
});

/* ADMIN DASHBOARD */
app.get('/api/admin/stats', requireAuth, (req, res) => {
  db.get(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_orders,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending_orders,
      COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END), 0) as total_revenue
    FROM orders
  `, (err, stats) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`
      SELECT COALESCE(SUM(amount),0) as today_revenue
      FROM orders WHERE status='paid' AND DATE(paid_at)=DATE('now')
    `, (err2, today) => {
      res.json({ ...stats, today_revenue: today?.today_revenue || 0 });
    });
  });
});

app.get('/api/admin/orders', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const status = req.query.status || 'all';
  const search = req.query.search || '';
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];
  if (status !== 'all') { where += ' AND status = ?'; params.push(status); }
  if (search) {
    where += ' AND (order_id LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  db.get(`SELECT COUNT(*) as total FROM orders ${where}`, params, (err, cnt) => {
    db.all(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({
          orders: rows,
          total: cnt.total,
          page,
          totalPages: Math.ceil(cnt.total / limit)
        });
      }
    );
  });
});

app.post('/api/admin/orders/:orderId/mark-paid', requireAuth, (req, res) => {
  const { utr } = req.body;
  db.run(
    `UPDATE orders SET status='paid', paid_at=CURRENT_TIMESTAMP, utr=? WHERE order_id=?`,
    [utr || 'MANUAL-' + Date.now(), req.params.orderId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changed: this.changes });
    }
  );
});

app.post('/api/admin/orders/:orderId/mark-pending', requireAuth, (req, res) => {
  db.run(
    `UPDATE orders SET status='pending', paid_at=NULL WHERE order_id=?`,
    [req.params.orderId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changed: this.changes });
    }
  );
});

app.delete('/api/admin/orders/:orderId', requireAuth, (req, res) => {
  db.run('DELETE FROM orders WHERE order_id=?', [req.params.orderId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changed: this.changes });
  });
});

app.get('/api/admin/orders/export/csv', requireAuth, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const headers = ['order_id','customer_name','customer_email','amount','status','utr','created_at','paid_at'];
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  });
});

app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password min 6 chars' });
  }
  db.get('SELECT * FROM admins WHERE id=?', [req.session.adminId], (err, admin) => {
    if (!bcrypt.compareSync(oldPassword, admin.password)) {
      return res.status(401).json({ error: 'Old password wrong' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE admins SET password=? WHERE id=?', [hash, admin.id], (e) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true });
    });
  });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server: http://localhost:${process.env.PORT || 3000}`);
  console.log(`👤 Admin:  http://localhost:${process.env.PORT || 3000}/admin`);
});