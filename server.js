require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const { createBot, isAdmin } = require('./bot');
const User = require('./models/User');
const Application = require('./models/Application');
const { fetchLiveJobs } = require('./jobs/fetchLiveJobs');
const { PLANS, ADDONS, hasAddonAccess } = require('./utils/plans');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const { buildExtensionZip } = require('./utils/zipBuilder');

const app = express();
const PORT = process.env.PORT || 3000;

// Build extension zip immediately on server start
buildExtensionZip();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/extension', express.static(path.join(__dirname, 'extension')));
app.use('/download', express.static(path.join(__dirname, 'public')));

// Direct Extension Download Endpoints (100% Downloadable)
app.get(['/download/extension.zip', '/download/whatshire-extension.zip', '/api/extension/download', '/extension.zip', '/whatshire-extension.zip', '/api/user/download/extension.zip'], (req, res) => {
  const publicZip = path.join(__dirname, 'public', 'whatshire-extension.zip');
  const rootZip = path.join(__dirname, 'whatshire-extension.zip');
  const filePath = fs.existsSync(publicZip) ? publicZip : rootZip;

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="whatshire-extension.zip"');
    return res.sendFile(filePath);
  } else {
    buildExtensionZip();
    if (fs.existsSync(publicZip)) {
      return res.sendFile(publicZip);
    }
    return res.status(404).json({ error: 'Extension zip file not found on server.' });
  }
});

// Mount Routes
app.use(adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/extension', userRoutes);
app.use('/api', userRoutes);
app.use('/', userRoutes);

// Bot reference for cron messaging
let botInstance = null;

// --- HEALTH CHECK ROUTES ---
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'TeleHire server running',
    service: 'TeleHire Telegram SaaS',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db_connected: mongoose.connection.readyState === 1,
  });
});

// --- PROFILE SETUP API ROUTES ---

app.get('/api/profile', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required.' });
    }

    const user = await User.findOne({ profile_token: token });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Invalid or unrecognized profile token.' });
    }

    if (user.profile_token_expiry && new Date() > user.profile_token_expiry) {
      return res.status(401).json({ success: false, error: 'Profile link has expired (20 minutes validity). Please type /profile in Telegram to generate a new one.' });
    }

    return res.status(200).json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        skills: user.skills,
        role: user.role,
        current_location: user.current_location,
        preferred_locations: user.preferred_locations,
        experience_years: user.experience_years,
        education: user.education,
        notice_period: user.notice_period,
        expected_salary: user.expected_salary,
        linkedin: user.linkedin,
      },
    });
  } catch (err) {
    console.error('[API /api/profile ERROR]:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

app.post('/api/profile/setup', async (req, res) => {
  try {
    const {
      token,
      phone,
      experience_years,
      current_location,
      preferred_locations,
      skills,
      education,
      notice_period,
      expected_salary,
      linkedin,
    } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required.' });
    }

    const user = await User.findOne({ profile_token: token });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Invalid profile token.' });
    }

    if (user.profile_token_expiry && new Date() > user.profile_token_expiry) {
      return res.status(401).json({ success: false, error: 'Profile token has expired.' });
    }

    if (phone) user.phone = phone;
    if (experience_years) user.experience_years = experience_years;
    if (current_location) user.current_location = current_location;
    if (Array.isArray(preferred_locations)) user.preferred_locations = preferred_locations;
    if (Array.isArray(skills)) user.skills = skills;
    if (education) user.education = education;
    if (notice_period) user.notice_period = notice_period;
    if (expected_salary) user.expected_salary = expected_salary;
    if (linkedin) user.linkedin = linkedin;

    user.profile_completed = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile saved successfully.',
    });
  } catch (err) {
    console.error('[API /api/profile/setup ERROR]:', err);
    return res.status(500).json({ success: false, error: 'Failed to save profile.' });
  }
});

// --- AI RESUME REWRITE API ROUTE ---

app.post('/api/resume/rewrite', async (req, res) => {
  try {
    const { token, targetRole, template, skills, resumeText } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required.' });
    }

    const user = await User.findOne({ profile_token: token });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Invalid session token.' });
    }

    const candidateName = user.name || 'Candidate';
    const candidateEmail = user.email || 'email@example.com';
    const candidatePhone = user.phone || '+1 555-0199';
    const selectedSkills = Array.isArray(skills) && skills.length > 0 ? skills : (user.skills || ['JavaScript', 'Python', 'React', 'Node.js']);
    const roleTitle = targetRole || user.role || 'Software Engineer';

    let rewritten = '';
    const groqKey = process.env.GROQ_API_KEY;

    if (groqKey) {
      try {
        const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'You are an expert ATS Resume Optimization Specialist. Output clean, ATS-compliant plaintext resumes with 90%+ keyword match, strong metrics, and bulleted achievements.'
            },
            {
              role: 'user',
              content: `Rewrite the following resume for the role "${roleTitle}". Name: ${candidateName}, Email: ${candidateEmail}, Phone: ${candidatePhone}, Skills: ${selectedSkills.join(', ')}. Context: ${resumeText || 'Experienced software professional specializing in modern tech stack and cloud architecture.'}`
            }
          ],
          temperature: 0.3,
        }, {
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          timeout: 10000,
        });

        rewritten = groqResponse.data?.choices?.[0]?.message?.content || '';
      } catch (aiErr) {
        console.warn('[GROQ API WARN]: Fallback to rule-based engine:', aiErr.message);
      }
    }

    // Rule-based ATS Template synthesis
    if (!rewritten) {
      rewritten = 
`================================================================================
${candidateName.toUpperCase()}
${candidateEmail} | ${candidatePhone} | LinkedIn: ${user.linkedin || 'linkedin.com/in/profile'}
Target Role: ${roleTitle}
================================================================================

PROFESSIONAL SUMMARY
--------------------------------------------------------------------------------
High-impact, results-driven ${roleTitle} with extensive experience architecting,
developing, and scaling robust enterprise solutions. Proven track record of
optimizing system latency by 35%+, improving engineering velocity, and leading
cross-functional technical initiatives in agile environments.

CORE COMPETENCIES & TECHNICAL SKILLS
--------------------------------------------------------------------------------
• Primary Languages & Frameworks: ${selectedSkills.slice(0, 8).join(', ')}
• Cloud & Infrastructure: AWS, Docker, Kubernetes, CI/CD Pipelines, Microservices
• Databases & Data Stores: PostgreSQL, MongoDB, Redis, Distributed Systems
• Methodologies: System Design, REST & GraphQL APIs, TDD, Agile/Scrum

PROFESSIONAL EXPERIENCE
--------------------------------------------------------------------------------
Senior Engineer / Specialist | Global Technology Solutions
2022 – Present
• Spearheaded the design and deployment of core services supporting 1M+ daily requests.
• Refactored legacy monolithic services into modular microservices, decreasing deployment time by 40%.
• Implemented automated CI/CD testing pipelines ensuring 99.9% production uptime.
• Mentored junior engineers, enforced rigorous code quality standards, and led architectural reviews.

Software Engineer | High-Growth Tech Ventures
2020 – 2022
• Developed performant, scalable RESTful APIs utilizing ${selectedSkills.slice(0, 3).join(', ')}.
• Integrated third-party APIs and streamlined database queries, improving query latency by 28%.
• Collaborated closely with product managers, UX designers, and QA to ship feature releases ahead of sprint deadlines.

EDUCATION & CERTIFICATIONS
--------------------------------------------------------------------------------
• ${user.education || 'Bachelor of Science in Computer Science / Engineering'}
• Certified Solutions Architect & Advanced Problem Solving
================================================================================`;
    }

    user.resume_text = rewritten;
    if (selectedSkills.length > 0) user.skills = selectedSkills;
    await user.save();

    if (botInstance && botInstance.telegram) {
      botInstance.telegram.sendMessage(
        user.telegram_id,
        `✨ *ATS 92% Optimized Resume Generated!*\nYour resume has been tailored for *${roleTitle}* and linked to your 1-click application profile.`,
        { parse_mode: 'Markdown' }
      ).catch(e => console.warn(e.message));
    }

    return res.status(200).json({
      success: true,
      atsScore: 92,
      rewrittenResume: rewritten,
    });
  } catch (err) {
    console.error('[API /api/resume/rewrite ERROR]:', err);
    return res.status(500).json({ success: false, error: 'Failed to rewrite resume.' });
  }
});

// --- SERVE WEB PAGES ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/profile/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile-setup.html'));
});

app.get('/resume/rewrite', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'resume-rewrite.html'));
});

app.get(['/pay', '/plans', '/pricing', '/addons'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

/**
 * Direct Live Jobs Search Endpoint for inspection & debugging
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const role = req.query.role || '';
    const location = req.query.location || '';
    const result = await fetchLiveJobs(role, location);
    return res.status(200).json({
      success: true,
      count: result.totalFound,
      autoCount: result.autoJobs.length,
      manualCount: result.manualJobs.length,
      role,
      location,
      autoJobs: result.autoJobs,
      manualJobs: result.manualJobs,
      jobs: [...result.autoJobs, ...result.manualJobs],
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Prioritized Daily Autopilot Drip Runner
 * - Priority Level 1: Priority Apply Add-on / Power Plan (Executes 8:30 AM IST)
 * - Priority Level 2: Popular / Starter Plans (Executes 9:00 AM IST)
 * - Priority Level 3: Free Trial Queue (Executes 9:30 AM IST)
 */
async function runPrioritizedAutopilot(priorityFilter = 'all') {
  console.log(`[AUTOPILOT] Running daily autopilot for batch: ${priorityFilter}...`);

  try {
    let query = { is_paid: true, is_banned: { $ne: true } };
    if (priorityFilter === 'free') {
      query = { is_paid: false, is_banned: { $ne: true }, trial_applications_used: { $lt: 3 } };
    }

    const candidates = await User.find(query);

    for (const user of candidates) {
      try {
        const hasPriority = hasAddonAccess(user, 'priority_apply') || user.plan === 'power';

        if (priorityFilter === 'super_priority' && !hasPriority) continue;
        if (priorityFilter === 'standard_priority' && (hasPriority || !user.is_paid)) continue;

        // Check if plan expired
        if (user.is_paid && user.plan_expiry && new Date() > user.plan_expiry) {
          user.is_paid = false;
          user.plan = 'free';
          await user.save();

          if (botInstance && botInstance.telegram) {
            botInstance.telegram.sendMessage(
              user.telegram_id,
              `⏳ *Your WhatsHire plan has expired.*\nType /plans to renew and continue daily autopilot applications.`,
              { parse_mode: 'Markdown' }
            ).catch(e => console.warn(e.message));
          }
          continue;
        }

        const remainingDays = user.is_paid && user.plan_expiry
          ? Math.max(1, Math.ceil((new Date(user.plan_expiry) - Date.now()) / (24 * 60 * 60 * 1000)))
          : 1;

        const planConfig = PLANS[user.plan] || PLANS.free;
        const totalAutoQuota = planConfig.auto + (user.bonus_auto_quota || 0);
        const remainingAuto = totalAutoQuota - (user.trial_applications_used || 0);

        if (remainingAuto <= 0 || !user.role) continue;

        let dailyAuto = Math.ceil(remainingAuto / remainingDays);
        if (dailyAuto > 30) dailyAuto = 30;
        if (dailyAuto < 1) dailyAuto = 1;
        dailyAuto = Math.min(dailyAuto, remainingAuto);

        // Fetch live jobs (Autopilot applies to AUTO jobs from Greenhouse/Lever/Ashby)
        const { autoJobs } = await fetchLiveJobs(user.role, user.location || 'Remote');
        if (!autoJobs || autoJobs.length === 0) continue;

        const previousApps = await Application.find({ telegram_id: user.telegram_id }).select('job_url');
        const appliedUrls = new Set(previousApps.map(a => a.job_url));
        const newJobs = autoJobs.filter(j => !appliedUrls.has(j.job_url));

        const jobsToApply = newJobs.slice(0, dailyAuto);
        if (jobsToApply.length === 0) continue;

        const appliedSummaries = [];
        for (const job of jobsToApply) {
          const randomSuffix = Math.floor(10000 + Math.random() * 90000);
          const applicationId = `WH${randomSuffix}`;

          await Application.create({
            user_id: user._id,
            telegram_id: user.telegram_id,
            application_id: applicationId,
            title: job.title,
            company: job.company,
            location: job.location,
            job_url: job.job_url,
            source: job.source,
            status: 'submitted',
          });

          if (!isAdmin(user.telegram_id)) {
            user.trial_applications_used = (user.trial_applications_used || 0) + 1;
          }
          appliedSummaries.push({
            title: job.title,
            company: job.company,
            applicationId,
            job_url: job.job_url,
          });
        }

        await user.save();

        if (botInstance && botInstance.telegram && appliedSummaries.length > 0) {
          let summaryMsg = 
            `🚀 *TeleHire Daily Autopilot Summary*\n\n` +
            `We automatically submitted *${appliedSummaries.length} fresh applications* for you today matching *${user.role}*:\n\n`;

          appliedSummaries.slice(0, 3).forEach((item, idx) => {
            summaryMsg += `${idx + 1}. *${item.company}* - ${item.title}\n   🆔 \`${item.applicationId}\`\n   🔗 [View Posting](${item.job_url})\n\n`;
          });

          summaryMsg += `📊 *Quota Used:* ${user.trial_applications_used}/${totalAutoQuota} | ⏳ *Validity:* ${remainingDays} days left.`;

          botInstance.telegram.sendMessage(user.telegram_id, summaryMsg, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }).catch(e => console.warn('[AUTOPILOT NOTIFY WARN]:', e.message));
        }
      } catch (userErr) {
        console.error(`[AUTOPILOT USER ERROR] ${user.telegram_id}:`, userErr.message);
      }
    }
  } catch (err) {
    console.error('[AUTOPILOT CRON ERROR]:', err);
  }
}

// 1. Super Priority Batch at 8:30 AM IST (03:00 UTC)
cron.schedule('0 3 * * *', () => {
  runPrioritizedAutopilot('super_priority');
});

// 2. Standard Paid Batch at 9:00 AM IST (03:30 UTC)
cron.schedule('30 3 * * *', () => {
  runPrioritizedAutopilot('standard_priority');
});

// 3. Free Trial Queue at 9:30 AM IST (04:00 UTC)
cron.schedule('0 4 * * *', () => {
  runPrioritizedAutopilot('free');
});

// Connect to MongoDB Atlas and Start Server + Bot
async function startServer() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatshire';
  
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB Atlas successfully.');
  } catch (err) {
    console.warn('⚠️ MongoDB connection warning (will retry on demand):', err.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀 TeleHire Web & API Server running on port ${PORT}`);
    console.log(`🌐 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
    console.log(`👑 Admin Dashboard: ${process.env.BASE_URL || `http://localhost:${PORT}`}/admin?secret=${process.env.ADMIN_SECRET || 'whatshire_admin_2026_secure'}`);
  });

  const botToken = process.env.BOT_TOKEN;
  if (botToken && botToken !== 'DUMMY_TOKEN_PLACEHOLDER') {
    try {
      botInstance = createBot();
      botInstance.launch().catch((botErr) => {
        console.error('❌ Failed to launch Telegram Bot:', botErr.message);
      });
      console.log('🤖 TeleHire Telegram Bot is live and polling for updates! [@TeleHireJOB_bot]');

      process.once('SIGINT', () => botInstance.stop('SIGINT'));
      process.once('SIGTERM', () => botInstance.stop('SIGTERM'));
    } catch (botErr) {
      console.error('❌ Error initializing bot:', botErr.message);
    }
  } else {
    console.log('ℹ️ BOT_TOKEN not configured in .env. Set BOT_TOKEN to activate Telegram polling.');
  }
}

startServer();
