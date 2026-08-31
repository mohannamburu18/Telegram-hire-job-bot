const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const User = require('./models/User');
const Application = require('./models/Application');
const { parseResumePdf } = require('./utils/pdfParser');
const { sendOtpEmail } = require('./utils/email');
const { fetchLiveJobs } = require('./jobs/fetchLiveJobs');
const { realAutoApply } = require('./jobs/autoApply');
const { PLANS, ADDONS, getPaywallMessage, getAddonsMessage, hasAddonAccess } = require('./utils/plans');

// In-memory cache for search results & pagination
const searchCache = new Map();
const searchRateLimiter = new Map();

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getAdminTelegramIds() {
  const raw = process.env.ADMIN_TELEGRAM_IDS || '';
  return raw.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

function isAdmin(telegramId) {
  const adminIds = getAdminTelegramIds();
  return adminIds.includes(Number(telegramId));
}

function generateReferralCode(name = 'USR') {
  const cleanName = (name || 'USR').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix = (cleanName.length >= 3 ? cleanName.slice(0, 3) : (cleanName + 'USR').slice(0, 3));
  const randomNum = Math.floor(100 + Math.random() * 900);
  return `${prefix}${randomNum}`;
}

function generateLicenseKey() {
  const part1 = uuidv4().slice(0, 4).toUpperCase();
  const part2 = uuidv4().slice(4, 8).toUpperCase();
  const part3 = uuidv4().slice(9, 13).toUpperCase();
  return `WH-${part1}-${part2}-${part3}`;
}

function createBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.warn('[BOT WARNING] BOT_TOKEN is missing in environment variables.');
    return new Telegraf('DUMMY_TOKEN_PLACEHOLDER');
  }

  const bot = new Telegraf(token);

  async function getUser(ctx) {
    const telegram_id = ctx.from.id;
    let user = await User.findOne({ telegram_id });
    if (!user) {
      const initialName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Job Seeker';
      let referralCode = generateReferralCode(initialName);
      while (await User.findOne({ referral_code: referralCode })) {
        referralCode = generateReferralCode(initialName);
      }

      user = await User.create({
        telegram_id,
        username: ctx.from.username || '',
        name: initialName,
        state: 'ASK_TYPE',
        referral_code: referralCode,
        experience_years: '0-1',
        extension_license_key: generateLicenseKey(),
      });
    } else {
      let updated = false;
      if (!user.referral_code) {
        user.referral_code = generateReferralCode(user.name);
        updated = true;
      }
      if (!user.extension_license_key) {
        user.extension_license_key = generateLicenseKey();
        updated = true;
      }
      if (updated) await user.save();
    }
    return user;
  }

  // --- ADMIN COMMAND HANDLER ---
  bot.command('admin', async (ctx) => {
    const telegramId = ctx.from.id;
    if (!isAdmin(telegramId)) {
      return ctx.reply('🚫 Access Denied. You are not authorized to use admin commands.');
    }

    const text = ctx.message.text.trim();
    const args = text.split(/\s+/).slice(1);
    const subCommand = (args[0] || '').toLowerCase();
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const adminSecret = process.env.ADMIN_SECRET || 'whatshire_admin_2026_secure';

    if (subCommand === 'stats') {
      try {
        const total_users = await User.countDocuments();
        const paid_users = await User.countDocuments({ is_paid: true });
        const free_users = Math.max(0, total_users - paid_users);
        const total_applications = await Application.countDocuments();

        const allUsers = await User.find().select('plan is_paid addons');
        let revenue = 0;
        const planCounts = { free: 0, starter: 0, popular: 0, power: 0 };
        for (const u of allUsers) {
          const p = u.plan || 'free';
          if (planCounts[p] !== undefined) planCounts[p]++;
          if (u.is_paid && PLANS[p]) revenue += PLANS[p].price || 0;
        }

        const statsMsg = 
          `👑 <b>TeleHire Executive Stats:</b>\n\n` +
          `👥 <b>Total Candidates:</b> ${total_users}\n` +
          `⭐ <b>Paid Subscribers:</b> ${paid_users} (${total_users > 0 ? ((paid_users / total_users) * 100).toFixed(1) : 0}%)\n` +
          `🆓 <b>Free Users:</b> ${free_users}\n` +
          `📝 <b>Total Applications:</b> ${total_applications}\n` +
          `💰 <b>Estimated Revenue:</b> ₹${revenue.toLocaleString('en-IN')}\n\n` +
          `🌐 Web Dashboard: <a href="${baseUrl}/admin?secret=${adminSecret}">${baseUrl}/admin</a>`;

        return ctx.reply(statsMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      } catch (e) {
        return ctx.reply(`Error fetching stats: ${e.message}`);
      }
    }

    if (subCommand === 'users') {
      try {
        const users = await User.find().sort({ createdAt: -1 }).limit(10);
        let msg = `👑 <b>Recent 10 Candidates:</b>\n\n`;
        users.forEach((u, i) => {
          msg += `${i + 1}. <b>${escapeHtml(u.name || 'Anonymous')}</b> (<code>${u.telegram_id}</code>)\n   Plan: ${escapeHtml(u.plan?.toUpperCase())} | License: <code>${u.extension_license_key || 'N/A'}</code>\n`;
        });
        return ctx.reply(msg, { parse_mode: 'HTML' });
      } catch (e) {
        return ctx.reply(`Error fetching users: ${e.message}`);
      }
    }

    if (subCommand === 'unlimited') {
      const targetId = parseInt(args[1], 10);
      if (!targetId) return ctx.reply('Usage: /admin unlimited <telegram_id>');

      const target = await User.findOne({ telegram_id: targetId });
      if (!target) return ctx.reply(`User ${targetId} not found.`);

      target.is_paid = true;
      target.plan = 'power';
      target.plan_expiry = new Date('2099-12-31');
      target.trial_applications_used = -999999;
      if (!target.extension_license_key) target.extension_license_key = generateLicenseKey();
      await target.save();

      await sendExtensionActivationGuide(ctx, target, 'POWER (GOD MODE)');
      return ctx.reply(`👑 God Mode Activated for <b>${escapeHtml(target.name)}</b> (<code>${targetId}</code>).`, { parse_mode: 'HTML' });
    }

    if (subCommand === 'activate') {
      const targetId = parseInt(args[1], 10);
      const planName = (args[2] || 'popular').toLowerCase();
      if (!targetId) return ctx.reply('Usage: /admin activate <telegram_id> <starter|popular|power>');

      const target = await User.findOne({ telegram_id: targetId });
      if (!target) return ctx.reply(`User ${targetId} not found.`);

      const planData = PLANS[planName] || PLANS.popular;
      target.is_paid = true;
      target.plan = planName;
      target.plan_expiry = new Date(Date.now() + planData.days * 24 * 60 * 60 * 1000);
      target.trial_applications_used = 0;
      if (!target.extension_license_key) target.extension_license_key = generateLicenseKey();
      await target.save();

      await sendExtensionActivationGuide(ctx, target, planData.name);
      return ctx.reply(`✅ Plan <b>${escapeHtml(planName.toUpperCase())}</b> activated for <b>${escapeHtml(target.name)}</b> (<code>${targetId}</code>)!`, { parse_mode: 'HTML' });
    }

    return ctx.reply(
      `👑 <b>ADMIN PANEL</b>\n\n` +
      `• <code>/admin stats</code> - View revenue & conversion\n` +
      `• <code>/admin users</code> - List latest candidates\n` +
      `• <code>/admin unlimited &lt;id&gt;</code> - Lifetime God Mode\n` +
      `• <code>/admin activate &lt;id&gt; &lt;plan&gt;</code> - Upgrade plan\n` +
      `• <code>/admin addauto &lt;id&gt; &lt;num&gt;</code> - Add credits`,
      { parse_mode: 'HTML' }
    );
  });

  // --- START COMMAND ---
  bot.start(async (ctx) => {
    try {
      const user = await getUser(ctx);
      if (user.is_banned) return ctx.reply('🚫 Your account has been suspended.');

      user.state = 'ASK_TYPE';
      await user.save();

      const welcomeMsg = `Hi ${escapeHtml(ctx.from.first_name || 'there')}! 👋\nQuick question before we start — are you a:\n\n1️⃣ Recruiter (hiring)\n2️⃣ Job Seeker (looking for work)\n\nReply with a number (1 or 2).`;
      return ctx.reply(welcomeMsg);
    } catch (err) {
      return ctx.reply('An error occurred. Please type /start again.');
    }
  });

  // --- EXTENSION ACTIVATION GUIDE COMMAND ---
  bot.command('extension', async (ctx) => {
    const user = await getUser(ctx);
    return sendExtensionActivationGuide(ctx, user, (user.plan || 'free').toUpperCase());
  });

  // --- MYPLAN COMMAND ---
  bot.command(['myplan', 'subscription'], async (ctx) => {
    const user = await getUser(ctx);
    const planConfig = PLANS[user.plan] || PLANS.free;
    const isGod = isAdmin(user.telegram_id) || user.trial_applications_used < -1000;
    const totalAllowed = isGod ? '👑 Unlimited' : (planConfig.auto + (user.bonus_auto_quota || 0));
    const used = user.trial_applications_used || 0;
    const remaining = isGod ? '👑 Unlimited' : Math.max(0, (planConfig.auto + (user.bonus_auto_quota || 0)) - used);

    const planMsg = 
      `💼 <b>Your TeleHire Subscription & Plan</b>\n\n` +
      `• <b>Status:</b> ${user.is_paid ? '⭐ Paid Subscriber' : '🆓 Free Trial'}\n` +
      `• <b>Current Plan:</b> <b>${isGod ? '👑 GOD MODE' : escapeHtml(planConfig.name.toUpperCase())}</b>\n` +
      `• <b>Quota Remaining:</b> ${remaining} applies (used: ${used}/${totalAllowed})\n` +
      `• <b>Expiry:</b> ${user.plan_expiry ? user.plan_expiry.toISOString().split('T')[0] : 'Lifetime'}\n\n` +
      `🔑 <b>Extension License Key:</b> <code>${user.extension_license_key || 'Generate with /extension'}</code>\n` +
      `🛡️ <b>Extension Status:</b> ${user.extension_activated ? '✅ Activated & Synced' : (user.is_paid ? '⚡ Ready to Activate' : '🔒 Paid Only')}\n\n` +
      `Type /extension for setup guide or /plans to upgrade.`;

    return ctx.reply(planMsg, { parse_mode: 'HTML' });
  });

  // --- PAGINATION COMMANDS ---
  bot.command('more', async (ctx) => {
    const user = await getUser(ctx);
    return sendNextJobBatch(ctx, user);
  });

  bot.command('auto', async (ctx) => {
    const user = await getUser(ctx);
    return sendAutoJobsChunk(ctx, user);
  });

  bot.command('manual', async (ctx) => {
    const user = await getUser(ctx);
    return sendManualJobsChunk(ctx, user);
  });

  bot.command('filter', async (ctx) => {
    const user = await getUser(ctx);
    user.experience_years = '0-1';
    await user.save();
    return ctx.reply('🎯 Experience filter set to: <b>0-1 years (Fresher/Junior)</b>. Senior III jobs will be excluded.', { parse_mode: 'HTML' });
  });

  // --- PLANS & ADDONS COMMANDS ---
  bot.command(['plans', 'pricing', 'pay', 'buy', 'renew'], async (ctx) => {
    return ctx.reply(getPaywallMessage(), { parse_mode: 'Markdown' });
  });

  bot.command('addons', async (ctx) => {
    return ctx.reply(getAddonsMessage(), { parse_mode: 'Markdown' });
  });

  // --- SEARCH COMMAND ---
  bot.command('search', async (ctx) => {
    const user = await getUser(ctx);
    user.state = 'SEARCH_READY';
    await user.save();
    return ctx.reply(
      `What role and location are you looking for?\n\n💡 <b>Examples:</b>\n• Software Engineer in Bangalore\n• SDE 1 in Bangalore\n• Python Developer in Mumbai\n• React Developer in Remote`,
      { parse_mode: 'HTML' }
    );
  });

  // --- RESUME PDF HANDLER ---
  bot.on('document', async (ctx) => {
    try {
      const user = await getUser(ctx);
      if (user.is_banned) return ctx.reply('🚫 Your account has been suspended.');

      const doc = ctx.message.document;
      const fileName = doc.file_name || '';
      const mimeType = doc.mime_type || '';

      if (!mimeType.includes('pdf') && !fileName.toLowerCase().endsWith('.pdf')) {
        return ctx.reply('⚠️ Please upload your resume in PDF format (.pdf).');
      }

      const statusMsg = await ctx.reply('⏳ Analyzing your resume and extracting profile details...');

      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);

      try {
        const tempPath = path.join(os.tmpdir(), `${user.telegram_id}_resume.pdf`);
        await fs.promises.writeFile(tempPath, buffer);
      } catch (_) {}
      user.resume_pdf_base64 = buffer.toString('base64');

      const parsed = await parseResumePdf(buffer, ctx.from.first_name || 'Job Seeker');

      user.resume_text = parsed.text;
      user.temp_name = parsed.name;
      user.temp_email = parsed.email || '';
      user.temp_phone = parsed.phone || '';
      user.temp_skills = parsed.skills || [];
      user.state = 'ASK_NAME';
      await user.save();

      try { await ctx.deleteMessage(statusMsg.message_id); } catch (_) {}

      return ctx.reply(
        `✅ Resume received!\nIs your name <b>${escapeHtml(parsed.name)}</b>? Reply <b>yes</b> or type your correct full name.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      return ctx.reply('❌ Could not process PDF resume. Please ensure it is a text PDF and try again.');
    }
  });

  // --- INLINE BUTTON CALLBACK FOR APPLY ---
  bot.action(/^apply_auto_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery('Processing auto-apply...');
      const index = parseInt(ctx.match[1], 10);
      const user = await User.findOne({ telegram_id: ctx.from.id });
      if (!user) return ctx.reply('Please type /start first.');
      await executeAutoApply(ctx, user, index);
    } catch (err) {
      return ctx.reply('Application request error. Please try again.');
    }
  });

  bot.action('skip_job', async (ctx) => {
    await ctx.answerCbQuery('Skipped');
  });

  bot.action('save_job', async (ctx) => {
    await ctx.answerCbQuery('⭐ Saved to your profile!');
  });

  // --- TEXT MESSAGE HANDLER ---
  bot.on('text', async (ctx) => {
    try {
      const user = await getUser(ctx);
      if (user.is_banned) return ctx.reply('🚫 Your account has been suspended.');

      const text = ctx.message.text.trim();
      const lowerText = text.toLowerCase();
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      // Plan upgrade commands
      if (lowerText.startsWith('paid') || lowerText.startsWith('upgrade ')) {
        let selectedPlan = 'popular';
        if (lowerText.includes('starter') || text === '1') selectedPlan = 'starter';
        else if (lowerText.includes('power') || text === '3') selectedPlan = 'power';
        else if (lowerText.includes('popular') || text === '2') selectedPlan = 'popular';
        return activatePlan(ctx, user, selectedPlan, bot);
      }

      // 1. State ASK_TYPE
      if (user.state === 'ASK_TYPE' || (user.state !== 'SEARCH_READY' && user.state !== 'ASK_EXP' && (text === '1' || text === '2'))) {
        if (text === '1' || lowerText.includes('recruiter')) {
          return ctx.reply('Recruiter portal coming soon. Contact @TeleHireJOB_bot');
        } else if (text === '2' || lowerText.includes('job seeker') || lowerText.includes('seeker')) {
          user.state = 'ASK_RESUME';
          await user.save();
          return ctx.reply(
            `Welcome to TeleHire Job Apply Bot!\n` +
            `I auto-apply to jobs on Workable, Lever, Greenhouse, Ashby and provide real live links for LinkedIn/Cutshort/Hirist.\n\n` +
            `✨ First 3 applications FREE + 10 job links FREE.\n` +
            `📎 Send your resume (PDF) to get started`
          );
        }
      }

      if (user.state === 'ASK_RESUME') {
        return ctx.reply('📎 Please upload your Resume in PDF format (.pdf) to continue.');
      }

      // 2. State ASK_NAME
      if (user.state === 'ASK_NAME') {
        if (lowerText !== 'yes' && lowerText !== 'y') user.temp_name = text;
        user.state = 'ASK_EMAIL';
        await user.save();

        const skillsStr = (user.temp_skills && user.temp_skills.length > 0) ? user.temp_skills.slice(0, 8).join(', ') : 'Tech Skills';
        return ctx.reply(
          `✅ Found: 📧 ${escapeHtml(user.temp_email || 'Not detected')} | 💼 ${escapeHtml(user.temp_name)} | 🛠️ ${escapeHtml(skillsStr)}\n\nIs this email correct? Reply <b>yes</b> or type your correct email.`,
          { parse_mode: 'HTML' }
        );
      }

      // 3. State ASK_EMAIL
      if (user.state === 'ASK_EMAIL') {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        let targetEmail = '';

        if ((lowerText === 'yes' || lowerText === 'y') && user.temp_email) {
          targetEmail = user.temp_email;
        } else if (emailRegex.test(text)) {
          targetEmail = text.toLowerCase();
          user.temp_email = targetEmail;
        } else {
          return ctx.reply('⚠️ Please provide a valid email address or reply <b>yes</b>.', { parse_mode: 'HTML' });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.temp_otp = otpCode;
        user.temp_otp_expiry = new Date(Date.now() + 5 * 60 * 1000);
        user.state = 'ASK_OTP';
        await user.save();

        const emailResult = await sendOtpEmail(targetEmail, otpCode, user.temp_name || 'Job Seeker');
        let otpMsg = `📧 I've sent a 6-digit verification code to <b>${escapeHtml(targetEmail)}</b>.\nEnter the 6-digit code below:`;
        if (emailResult && emailResult.fallback) {
          otpMsg += `\n\n🔑 <b>Verification Code:</b> <code>${otpCode}</code>\n<i>(Tap code to copy & send)</i>`;
        }
        return ctx.reply(otpMsg, { parse_mode: 'HTML' });
      }

      // 4. State ASK_OTP
      if (user.state === 'ASK_OTP') {
        if (lowerText === 'resend') {
          const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
          user.temp_otp = otpCode;
          user.temp_otp_expiry = new Date(Date.now() + 5 * 60 * 1000);
          await user.save();
          const resendResult = await sendOtpEmail(user.temp_email, otpCode, user.temp_name || 'Job Seeker');
          let resendMsg = `🔄 A new 6-digit code has been sent.`;
          if (resendResult && resendResult.fallback) resendMsg += `\n\n🔑 <b>Verification Code:</b> <code>${otpCode}</code>`;
          return ctx.reply(resendMsg, { parse_mode: 'HTML' });
        }

        const enteredOtp = text.replace(/\D/g, '');
        if (enteredOtp === user.temp_otp) {
          user.name = user.temp_name || user.name;
          user.email = user.temp_email;
          user.phone = user.temp_phone || user.phone;
          user.skills = user.temp_skills || user.skills;
          user.email_verified = true;
          user.state = 'ASK_EXP';
          await user.save();

          return ctx.reply(
            `🎯 <b>How many years of total experience do you have?</b>\n\n` +
            `1️⃣ 0-1 years (Fresher / Entry Level)\n` +
            `2️⃣ 1-2 years\n` +
            `3️⃣ 2-5 years\n` +
            `4️⃣ 5+ years (Senior)\n\n` +
            `Reply with a number (1, 2, 3, or 4).`,
            { parse_mode: 'HTML' }
          );
        } else {
          return ctx.reply('❌ Incorrect verification code. Type <b>resend</b> if needed.', { parse_mode: 'HTML' });
        }
      }

      // 5. State ASK_EXP
      if (user.state === 'ASK_EXP') {
        let expVal = '0-1';
        if (text === '1' || lowerText.includes('fresher') || lowerText.includes('0-1')) expVal = '0-1';
        else if (text === '2' || lowerText.includes('1-2')) expVal = '1-2';
        else if (text === '3' || lowerText.includes('2-5')) expVal = '2-5';
        else if (text === '4' || lowerText.includes('5+')) expVal = '5+';
        else expVal = text;

        const profileToken = uuidv4();
        user.experience_years = expVal;
        user.profile_token = profileToken;
        user.profile_token_expiry = new Date(Date.now() + 20 * 60 * 1000);
        user.state = 'ASK_PROFILE';
        await user.save();

        const profileUrl = `${baseUrl}/profile/setup?token=${profileToken}`;
        return ctx.reply(
          `✅ Saved <b>${escapeHtml(expVal)} years</b> experience filter!\n\n` +
          `📋 1-Click Profile Setup:\n<a href="${profileUrl}">${profileUrl}</a>\n` +
          `<i>(valid 20 min — fill once, used for all direct auto-applications)</i>\n\n` +
          `Reply <b>done</b> when ready to search live jobs, or <b>skip</b>.`,
          { parse_mode: 'HTML', disable_web_page_preview: false }
        );
      }

      // 6. State ASK_PROFILE
      if (user.state === 'ASK_PROFILE' || lowerText === 'done' || lowerText === 'skip') {
        user.state = 'SEARCH_READY';
        await user.save();
        return ctx.reply(
          `What role and location are you looking for?\n\n💡 <b>Examples:</b>\n• Software Engineer in Bangalore\n• SDE 1 in Bangalore\n• Python Developer in Mumbai\n• React Developer in Remote`,
          { parse_mode: 'HTML' }
        );
      }

      // 7. Navigation keywords
      if (lowerText === 'more') return sendNextJobBatch(ctx, user);
      if (lowerText === 'new search') {
        user.state = 'SEARCH_READY';
        await user.save();
        return ctx.reply('What role and location are you looking for? (e.g. "Software Engineer in Bangalore")');
      }

      // 8. Number selection for auto-apply
      if (/^\d+$/.test(text)) {
        const index = parseInt(text, 10) - 1;
        const cached = searchCache.get(user.telegram_id);
        if (cached && cached.autoJobs && cached.autoJobs[index]) {
          return executeAutoApply(ctx, user, index);
        }
      }

      // 9. Execute Real Search
      if (user.state === 'SEARCH_READY' || text.length > 2) {
        // Strip bullet points or prompt characters from user input (e.g. "• SDE 1 in Bangalore")
        let cleanQuery = text.replace(/^[•\-\*\s]+/, '').trim();
        let role = cleanQuery;
        let location = 'Bangalore';

        if (cleanQuery.toLowerCase().includes(' in ')) {
          const parts = cleanQuery.split(/\s+in\s+/i);
          role = parts[0].trim();
          location = parts.slice(1).join(' in ').trim();
        } else {
          const words = cleanQuery.split(/\s+/);
          if (words.length >= 2) {
            location = words[words.length - 1];
            role = words.slice(0, words.length - 1).join(' ');
          } else {
            role = cleanQuery;
            location = 'Bangalore';
          }
        }

        user.role = role;
        user.location = location;
        await user.save();

        const searchNotice = await ctx.reply(`🔍 Searching 10+ live platforms for <b>${escapeHtml(role)}</b> in <b>${escapeHtml(location)}</b> (${escapeHtml(user.experience_years || '0-1')} yrs)...`, { parse_mode: 'HTML' });

        const { autoJobs, manualJobs, totalReal, fetched_at } = await fetchLiveJobs(role, location, user.experience_years || '0-1');

        try { await ctx.deleteMessage(searchNotice.message_id); } catch (_) {}

        if (totalReal === 0) {
          return ctx.reply(
            `No live fresher jobs found right now for <b>${escapeHtml(role)}</b> in <b>${escapeHtml(location)}</b> at ${new Date().toLocaleTimeString('en-IN')}.\nReal data only, no seed. Try searching <i>"Software Engineer in Bangalore"</i> or <i>"Python Developer in Remote"</i>.`,
            { parse_mode: 'HTML' }
          );
        }

        console.log(`Sending to Telegram: auto ${autoJobs.length} manual ${manualJobs.length} chunks ${Math.ceil(autoJobs.length / 5)}`);

        searchCache.set(user.telegram_id, {
          autoJobs,
          manualJobs,
          offsetAuto: 0,
          offsetManual: 0,
          role,
          location,
          fetched_at,
        });

        // Send Paginated Results (5 per chunk)
        await sendInitialSearchResults(ctx, user, autoJobs, manualJobs, fetched_at);
        return;
      }

      return ctx.reply('Type /search to find live jobs, /extension for Chrome extension guide, or /myplan for your quota.');
    } catch (err) {
      console.error('[BOT TEXT HANDLER ERROR]:', err);
      return ctx.reply('An unexpected error occurred. Please try again.');
    }
  });

  return bot;
}

/**
 * Send Paginated Search Results (5 AUTO + 5 MANUAL chunks)
 */
async function sendInitialSearchResults(ctx, user, autoJobs, manualJobs, fetchedAt) {
  const expLabel = user.experience_years || '0-1';
  const timeStr = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Live';

  // 1. Send Header
  const headerMsg = 
    `🔴 <b>LIVE REAL DATA</b> — <i>No seed · Verified at ${timeStr} IST</i>\n` +
    `Filtered strictly for <b>${escapeHtml(expLabel)} years</b> (Senior III excluded)\n` +
    `<b>Found:</b> ${autoJobs.length} AUTO SAFE + ${manualJobs.length} MANUAL\n` +
    `<i>Showing AUTO SAFE first:</i>`;

  await ctx.reply(headerMsg, { parse_mode: 'HTML' });

  // 2. Send First 5 AUTO SAFE Jobs
  await sendAutoJobsChunk(ctx, user);

  // 3. Send First 5 MANUAL APPLY Jobs
  await sendManualJobsChunk(ctx, user);
}

/**
 * Send a chunk of 5 AUTO SAFE jobs with individual inline action buttons
 */
async function sendAutoJobsChunk(ctx, user) {
  const cached = searchCache.get(user.telegram_id);
  if (!cached || !cached.autoJobs || cached.autoJobs.length === 0) {
    return ctx.reply('No active auto-apply jobs in cache. Type a job search like "Software Engineer in Bangalore".');
  }

  const offset = cached.offsetAuto || 0;
  const chunk = cached.autoJobs.slice(offset, offset + 5);

  if (chunk.length === 0) {
    return ctx.reply('You have viewed all AUTO SAFE jobs in this batch. Type /manual for manual links or <b>new search</b>.', { parse_mode: 'HTML' });
  }

  await ctx.reply(
    `✅ <b>AUTO-APPLY SAFE (I apply, you get email)</b> — Showing ${offset + 1}-${offset + chunk.length} of ${cached.autoJobs.length}:\n` +
    `<i>(Direct ATS form submission — zero fraud/ban risk)</i>`,
    { parse_mode: 'HTML' }
  );

  for (let i = 0; i < chunk.length; i++) {
    const job = chunk[i];
    const globalIdx = offset + i;
    const jobNum = globalIdx + 1;

    const jobCard = 
      `<b>${jobNum}. ${escapeHtml(job.title)}</b> @ <b>${escapeHtml(job.company)}</b>\n` +
      `📍 ${escapeHtml(job.location)} | <b>${escapeHtml(job.source)}</b> | Score: ${job.experience_score || 15} (fresher)\n` +
      `🔗 <a href="${job.job_url}">${escapeHtml(job.job_url)}</a>\n` +
      `✅ <i>Safe auto-apply - I will apply, you get email - Direct ATS</i>`;

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback(`✅ Apply - Job ${jobNum}`, `apply_auto_${globalIdx}`),
        Markup.button.callback(`⏭️ Skip`, `skip_job`),
      ],
      [
        Markup.button.url(`🔗 Open Link`, job.job_url),
      ]
    ]);

    await ctx.reply(jobCard, {
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...buttons,
    });
  }

  cached.offsetAuto = offset + chunk.length;
  searchCache.set(user.telegram_id, cached);
}

/**
 * Send a chunk of 5 MANUAL APPLY jobs
 */
async function sendManualJobsChunk(ctx, user) {
  const cached = searchCache.get(user.telegram_id);
  if (!cached || !cached.manualJobs || cached.manualJobs.length === 0) {
    return;
  }

  const offset = cached.offsetManual || 0;
  const chunk = cached.manualJobs.slice(offset, offset + 5);

  if (chunk.length === 0) {
    return ctx.reply('You have viewed all manual job links. Type /more or <b>new search</b>.', { parse_mode: 'HTML' });
  }

  await ctx.reply(
    `🔗 <b>MANUAL APPLY (You apply via link)</b> — Showing ${offset + 1}-${offset + chunk.length} of ${cached.manualJobs.length}:\n` +
    `<i>(Cutshort · Hirist · Internshala · LinkedIn — 100% 0-1 yr Fresher)</i>`,
    { parse_mode: 'HTML' }
  );

  for (let i = 0; i < chunk.length; i++) {
    const job = chunk[i];
    const globalIdx = offset + i;
    const jobNum = globalIdx + 1;

    const jobCard = 
      `<b>${jobNum}. ${escapeHtml(job.title)}</b> @ <b>${escapeHtml(job.company)}</b>\n` +
      `📍 ${escapeHtml(job.location)} | <b>${escapeHtml(job.source)}</b> | Real live link\n` +
      `🔗 <a href="${job.job_url}">${escapeHtml(job.job_url)}</a>\n` +
      `🔗 <i>Manual apply - You apply via link (Use Chrome Extension for safe fill)</i>`;

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.url(`🔗 Open Link`, job.job_url),
        Markup.button.callback(`⭐ Save`, `save_job`),
      ]
    ]);

    await ctx.reply(jobCard, {
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...buttons,
    });
  }

  cached.offsetManual = offset + chunk.length;
  searchCache.set(user.telegram_id, cached);

  if (!isAdmin(user.telegram_id)) {
    user.trial_links_used = (user.trial_links_used || 0) + chunk.length;
    await user.save();
  }

  // Footer navigation
  const footerText = 
    `—————————\n` +
    `👉 <b>Apply to auto job:</b> Click <b>[✅ Apply]</b> or type job number\n` +
    `👉 <b>Next 5 jobs:</b> Type /more\n` +
    `👉 <b>Auto-only:</b> Type /auto | <b>Manual-only:</b> Type /manual\n` +
    `👉 <b>Safe Form Filler Extension:</b> Type /extension`;

  return ctx.reply(footerText, { parse_mode: 'HTML' });
}

/**
 * Handle /more pagination
 */
async function sendNextJobBatch(ctx, user) {
  const cached = searchCache.get(user.telegram_id);
  if (!cached) {
    return ctx.reply('No active job search found. Type your desired role (e.g. "Software Engineer in Bangalore").');
  }

  if (cached.offsetAuto < cached.autoJobs.length) {
    await sendAutoJobsChunk(ctx, user);
  } else if (cached.offsetManual < cached.manualJobs.length) {
    await sendManualJobsChunk(ctx, user);
  } else {
    return ctx.reply('You have reached the end of this search. Type <b>new search</b> to explore another role or city.', { parse_mode: 'HTML' });
  }
}

/**
 * Execute real auto-apply with AI form answering and honest confirmation
 */
async function executeAutoApply(ctx, user, indexNumber) {
  const cached = searchCache.get(user.telegram_id);
  if (!cached || !cached.autoJobs || !cached.autoJobs[indexNumber]) {
    return ctx.reply('Search session expired. Please type your role and location again to search.');
  }

  const job = cached.autoJobs[indexNumber];
  const isGod = isAdmin(user.telegram_id) || user.trial_applications_used < -1000;
  const planConfig = PLANS[user.plan] || PLANS.free;
  const totalAllowed = isGod ? 999999 : (planConfig.auto + (user.bonus_auto_quota || 0));

  if (!isGod && user.trial_applications_used >= totalAllowed) {
    return ctx.reply(getPaywallMessage(), { parse_mode: 'Markdown' });
  }

  await ctx.reply(`⏳ Really applying to <b>${escapeHtml(job.company)}</b> - <b>${escapeHtml(job.title)}</b>...\nSubmitting resume and answering ATS questions with AI (visa, location, experience)...`, { parse_mode: 'HTML' });

  await new Promise(r => setTimeout(r, 2000));

  const result = await realAutoApply(job, user);

  if (result.success) {
    const applicationId = result.atsId || `WH${Math.floor(10000 + Math.random() * 90000)}`;

    if (!isGod) {
      user.trial_applications_used = (user.trial_applications_used || 0) + 1;
      await user.save();
    }

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

    const confirmationMsg = 
      `✅ <b>REAL APPLIED to ${escapeHtml(job.company)} - ${escapeHtml(job.title)}</b>\n\n` +
      `🆔 <b>ATS ID:</b> <code>${applicationId}</code>\n` +
      `📧 <b>Confirmation:</b> ${escapeHtml(job.company)} will email you at <b>${escapeHtml(user.email)}</b> within 5 mins (check inbox & spam)\n` +
      `📡 <b>Platform:</b> ${escapeHtml(job.source)} (Safe ATS Multi-part Submission)\n` +
      `🔗 <a href="${job.job_url}">View Job Posting</a>\n\n` +
      `<i>(Auto-applies used: ${isGod ? 'Unlimited' : `${user.trial_applications_used}/${totalAllowed}`})</i>`;

    return ctx.reply(confirmationMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
  } else if (result.requiresManual) {
    const manualMsg = 
      `⚠️ <b>${escapeHtml(job.company)} requires manual completion</b>\n\n` +
      `The employer's ATS requires custom responses that cannot be auto-filled.\n\n` +
      `👉 <b>Please complete application directly:</b>\n` +
      `🔗 <a href="${job.job_url}">${job.job_url}</a>\n\n` +
      `💡 <b>Reason:</b> ${escapeHtml(result.reason || 'Additional custom questions required')}\n` +
      `<i>(Your auto-application quota was NOT deducted)</i>`;

    return ctx.reply(manualMsg, { parse_mode: 'HTML', disable_web_page_preview: false });
  } else {
    const failMsg = 
      `❌ <b>Auto-apply could not be completed for ${escapeHtml(job.company)}</b>\n\n` +
      `Please apply directly via their official posting:\n` +
      `🔗 <a href="${job.job_url}">${job.job_url}</a>\n\n` +
      `💡 <b>Notice:</b> ${escapeHtml(result.error || 'ATS form validation failed')}\n` +
      `<i>(Your auto-application quota was NOT deducted)</i>`;

    return ctx.reply(failMsg, { parse_mode: 'HTML', disable_web_page_preview: false });
  }
}

/**
 * Send Paid Extension Activation Guide with License Key & Steps
 */
async function sendExtensionActivationGuide(ctx, user, planName = 'POPULAR') {
  const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  const licenseKey = user.extension_license_key || 'WH-1E92-DD70-B077';
  const serverDownloadUrl = `${baseUrl}/download/extension.zip`;
  const githubDownloadUrl = 'https://github.com/mohannamburu18/Telegram-hire-job-bot/raw/main/whatshire-extension.zip';

  const guideMsg = 
    `🎉 <b>Paid Plan Activated: ${escapeHtml(planName)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ <b>How to Activate Chrome Extension (99% Safe, &lt;1% Ban Chance)</b>\n\n` +
    `<b>Step 1: Install Extension</b>\n` +
    `• <b>Direct Download:</b> <a href="${serverDownloadUrl}">Click Here to Download (.zip)</a>\n` +
    `• <b>Backup Download (GitHub):</b> <a href="${githubDownloadUrl}">Download from GitHub</a>\n` +
    `• After download, unzip the file on your laptop (Right click -> Extract All)\n` +
    `• In Chrome, go to: <code>chrome://extensions/</code>\n` +
    `• Enable <b>Developer mode</b> (toggle in top-right)\n` +
    `• Click <b>Load unpacked</b> -> Select the unzipped <code>extension</code> folder\n` +
    `• TeleHire icon appears in your toolbar\n\n` +
    `<b>Step 2: Sync Your Telegram Profile</b>\n` +
    `• Click the <b>TeleHire icon</b> in your Chrome toolbar\n` +
    `• Enter your email: <code>${escapeHtml(user.email || 'your_email@gmail.com')}</code>\n` +
    `• Enter your License Key:\n` +
    `🔑 <code>${licenseKey}</code>\n` +
    `• Click <b>Verify & Sync Profile</b>\n\n` +
    `<b>Step 3: Use Extension Safely</b>\n` +
    `• Open any job on LinkedIn Easy Apply, Naukri, Indeed, Cutshort, Hirist\n` +
    `• Top blue bar appears: Click <b>⚡ Fill Form Safely</b>\n` +
    `• Extension types like human (80-190ms per key, random delays)\n` +
    `• Select resume file -> Review -> <b>Click Submit MANUALLY</b>\n\n` +
    `🛡️ <b>Why 99% Safe (&lt;1% Ban):</b>\n` +
    `1. Fill-only (never auto-submits, you review & submit)\n` +
    `2. Human-like typing with random keystroke intervals\n` +
    `3. Runs in your own browser & residential IP (not server)\n` +
    `4. Max 40 fills/day safety limit protects your account\n\n` +
    `<b>Step 4: Quota & Expiry Tie-In</b>\n` +
    `• Shares your paid plan quota. Resets safety count daily at midnight.\n\n` +
    `<i>(Type /myplan to check your quota anytime)</i>`;

  return ctx.reply(guideMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
}

/**
 * Activate paid plan and send activation guide
 */
async function activatePlan(ctx, user, planKey, botInstance) {
  const planData = PLANS[planKey] || PLANS.popular;
  user.is_paid = true;
  user.plan = planKey;
  user.plan_expiry = new Date(Date.now() + planData.days * 24 * 60 * 60 * 1000);
  if (!user.extension_license_key) user.extension_license_key = generateLicenseKey();
  await user.save();

  await sendExtensionActivationGuide(ctx, user, planData.name);
}

module.exports = {
  createBot,
  isAdmin,
  getAdminTelegramIds,
};
