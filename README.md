# 💳 FamPay Gateway

UPI Payment Gateway with Admin Panel — FamPay email verification via Gmail IMAP.

## ✨ Features

- 💰 UPI QR Code + Deep Link payments
- 📧 Gmail IMAP auto-verification
- 🎛️ Full Admin Panel
- 📊 Dashboard with stats
- 📦 Order management (search/filter/pagination)
- ⬇️ CSV export
- 🔐 Bcrypt password auth
- 💾 SQLite database
- 📱 Mobile responsive

## 🚀 Quick Start

### 1. Install
\`\`\`bash
npm install
\`\`\`

### 2. Configure
\`\`\`bash
cp .env.example .env
# Edit .env with your Gmail App Password + UPI ID
\`\`\`

### 3. Run
\`\`\`bash
npm start
\`\`\`

### 4. Access
- **Customer:** http://localhost:3000
- **Admin:** http://localhost:3000/admin
- **Login:** `admin` / `admin123`

## 🔑 Gmail App Password Setup

1. Google Account → Security → 2-Step Verification (enable)
2. App Passwords → Generate
3. Copy 16-digit password → paste in `.env` as `EMAIL_PASS`

## 📁 Project Structure

\`\`\`
fampay-gateway/
├── server.js          # Main backend
├── database.js        # SQLite setup
├── public/
│   ├── index.html     # Customer page
│   ├── admin.html     # Admin panel
│   └── ...
└── .env
\`\`\`

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite
- **Auth:** bcryptjs, express-session
- **Email:** imap-simple, mailparser
- **Frontend:** Vanilla HTML/CSS/JS

## 📝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/create-order` | Create new order |
| GET | `/api/order/:id` | Get order status |
| POST | `/api/verify-payment` | Verify via Gmail |
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/orders` | List orders |
| POST | `/api/admin/orders/:id/mark-paid` | Manual verify |
| GET | `/api/admin/orders/export/csv` | Export CSV |

## ⚠️ Production Notes

- Change default admin password
- Use HTTPS
- Add rate limiting
- Migrate to PostgreSQL/MongoDB
- Set secure session cookies
- Follow RBI payment gateway norms

## 📄 License

MIT