# TeleHire 🚀 — Automated Telegram Job Bot SaaS & Executive Admin God Mode

TeleHire is a production-grade Telegram Job Bot SaaS that discovers live, verified jobs across global tech companies and ATS platforms (Greenhouse, Lever, Ashby, RemoteOK, Arbeitnow) and manages the end-to-end candidate onboarding, ATS resume optimization, prioritized drip auto-applications, viral referral mechanics, Add-Ons Store, and a full-featured **Executive Web Admin Dashboard with God Mode**.

---

## 🌟 Core System Highlights

1. **Zero Paid APIs / 100% Free Public Sources**:
   - **Greenhouse** (80 top tech company boards)
   - **Lever** (40 top tech company postings)
   - **Ashby** (Public GraphQL endpoint)
   - **RemoteOK** (Live remote tags API)
   - **Arbeitnow** (European & Global remote board API)

2. **Live HTTP Verification Engine**:
   - Parallel fetch via `Promise.allSettled` (5s timeout).
   - 20-concurrency worker pool for HTTP `HEAD` checks (fallback to `GET`).
   - Discards postings older than 10 days.
   - Dedupes by URL and sorts newest first.

3. **Executive Web Admin Dashboard (`/admin?secret=xxx`)**:
   - Real-time conversion metrics (Total candidates, Paid conversion %, Free users, Estimated revenue, Total auto-applications submitted).
   - Subscription breakdown table (Plan volume, active count, gross revenue).
   - Candidate management with search, plan filters, and CSV export.
   - God Mode controls: 👑 Unlimited Access, Instant Plan Activations, +50 Auto Credits, +100 Links, Ban/Unban, and Raw JSON Inspector.
   - Real-time Live Jobs Crawler Tester.

4. **Bot Admin God Mode**:
   - Admin users (defined via `ADMIN_TELEGRAM_IDS`) bypass all quotas and auto-apply infinitely without consuming credits.
   - In-bot admin commands: `/admin stats`, `/admin users`, `/admin unlimited <id>`, `/admin activate <id> <plan>`, `/admin addauto <id> <num>`.

5. **Web Portals**:
   - `/profile/setup?token=xxx` — 1-Click Candidate Profile setup.
   - `/resume/rewrite?token=xxx` — AI-Powered ATS 90%+ Resume Optimization.
   - `/pay` or `/plans` — Responsive Plans & Add-Ons Comparison Portal.
   - `/admin?secret=xxx` — Executive Admin Dashboard & God Mode.

6. **Monetization & Plans**:
   - **FREE** (₹0) — 3 Auto-Applies + 10 Live Links Lifetime.
   - **Starter** (₹249 / 30 days) — 20 Auto-Applies + 100 Links (~7/day).
   - **Popular ⭐** (₹471 / 60 days) — 100 Auto-Applies + 1,000 Links (~20/day) + FREE Resume Rewrite + Priority Apply.
   - **Power** (₹1,179 / 90 days) — 250 Auto-Applies + 2,500 Links (~28/day) + Resume Rewrite + Priority Apply + Country Pack.

7. **Add-Ons Store**:
   - **Resume Rewrite ATS 90%** (₹99 one-time) — AI optimization for 92%+ ATS match score.
   - **Priority Apply** (₹79/month) — Dispatches applications in the Super Priority batch at 8:30 AM before standard users.
   - **Country Pack** (₹200 one-time) — Unlocks regional remote filters: "Remote US", "Remote EU", and "Worldwide".

8. **Viral Referral Program**:
   - Unique 6-character referral code (e.g. `RAJ582`) and link (`https://t.me/TeleHireJOB_bot?start=RAJ582`).
   - When a friend joins: Friend gets **+2 extra auto-applies**.
   - When a friend purchases ANY plan: Referrer gets **+7 extra auto-applies + 50 manual live links** free.

9. **3-Tier Prioritized Drip Autopilot**:
   - **8:30 AM IST (03:00 UTC)**: Super Priority (Priority Apply Add-on / Power Plan).
   - **9:00 AM IST (03:30 UTC)**: Standard Paid Plans (Popular, Starter).
   - **9:30 AM IST (04:00 UTC)**: Free Trial Queue.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Web Framework**: Express.js
- **Telegram Bot**: Telegraf v4
- **Database**: MongoDB Atlas via Mongoose
- **Resume Parser**: pdf-parse
- **HTTP Engine**: Axios & Cheerio
- **Email Delivery**: Nodemailer (Free Gmail App Password)
- **Scheduler**: node-cron
- **Admin UI**: Vanilla HTML5, CSS3 & JavaScript (No React build needed)
- **Deployment**: Single-process architecture optimized for Render Free Tier

---

## 📁 Project Structure

```
TeleHire/
├── jobs/
│   └── fetchLiveJobs.js      # 5-source parallel fetcher & 20-concurrency live verifier
├── models/
│   ├── User.js               # Mongoose schema for candidate profile, OTP, plans, referrals, add-ons, bans
│   └── Application.js        # Mongoose schema for job applications & tracking IDs
├── public/
│   ├── index.html            # Landing page highlighting features, add-ons & referral program
│   ├── profile-setup.html    # Responsive web UI for profile setup
│   ├── resume-rewrite.html   # Responsive AI resume rewrite & ATS optimizer portal
│   ├── pay.html              # Responsive plans & pricing comparison page
│   └── admin.html            # Executive Admin Web Dashboard & God Mode portal
├── routes/
│   └── admin.js              # Protected backend admin REST API routes
├── utils/
│   ├── email.js              # Nodemailer Gmail OTP sender + console fallback
│   ├── pdfParser.js          # Resume PDF parser & skill extractor
│   └── plans.js              # Plan configurations, add-ons, quotas & paywall messages
├── bot.js                    # Telegraf bot conversation state machine, commands & Admin God Mode
├── server.js                 # Unified Express server, API routes, cron & bot polling
├── package.json
├── .env.example
└── README.md
```

---

## 🚀 Local Setup & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```env
BOT_TOKEN=your_telegram_bot_token_from_botfather
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/whatshire?retryWrites=true&w=majority
BASE_URL=http://localhost:3000
SMTP_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
ADMIN_TELEGRAM_IDS=123456789,987654321
ADMIN_SECRET=whatshire_admin_2026_secure
GROQ_API_KEY=optional_free_groq_api_key
PORT=3000
```

### 3. Start Server
```bash
npm start
```

### 4. Access Admin Web Portal
Visit: `http://localhost:3000/admin?secret=whatshire_admin_2026_secure`

---

## ☁️ Deploying to Render (Free Tier)

1. Push this repository to GitHub or GitLab.
2. Go to [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Web Service**.
3. Connect your repository.
4. Set the configuration:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Under **Environment Variables**, configure:
   - `BOT_TOKEN`
   - `MONGODB_URI`
   - `BASE_URL` (e.g. `https://whatshire.onrender.com`)
   - `SMTP_EMAIL`
   - `SMTP_PASSWORD`
   - `ADMIN_TELEGRAM_IDS`
   - `ADMIN_SECRET`
   - `PORT` = `3000`
6. Click **Deploy Web Service**.

---

## 🤖 Telegram Bot Commands & Admin Shortcuts

### Candidate Commands:
- `/start` — Onboarding & role selection (supports referral payloads like `/start RAJ582`)
- `/search` — Live job search across 80+ boards
- `/profile` — Regenerate 20-min profile setup link
- `/status` — Dashboard with active plan, used/bonus quota, and application log
- `/plans` or `/pricing` — View all plans and pricing breakdown
- `/addons` — View Add-Ons store (Resume Rewrite, Priority Apply, Country Pack)
- `/referral` — Get unique referral link and count of referred friends
- `buy resume` / `bought resume` — Unlock ATS 90%+ AI Resume Rewrite
- `buy priority` / `bought priority` — Activate Super Priority 8:30 AM execution
- `buy country` / `bought country` — Unlock Remote US/EU/Worldwide filter
- `paid starter` / `paid popular` / `paid power` — Instant plan upgrade
- `more` — Display next 10 jobs from search results
- `new search` — Reset query and search for new roles

### Admin God Mode Commands:
- `/admin` — Show admin help menu and direct web dashboard link
- `/admin stats` — Real-time user metrics, conversions, and estimated revenue
- `/admin users` — Quick view of the 10 most recent candidates
- `/admin unlimited <telegram_id>` — Grant lifetime God Mode with infinite auto-applications
- `/admin activate <telegram_id> <starter|popular|power>` — Upgrade a candidate's plan
- `/admin addauto <telegram_id> <amount>` — Credit bonus auto-applications







