const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Application = require('../models/Application');
const { PLANS } = require('../utils/plans');

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * 1. GET /api/extension/verify?email=...&license=...
 * Authenticates paid user and license key for Chrome Extension
 */
router.get('/extension/verify', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    const license = (req.query.license || '').trim().toUpperCase();

    if (!email) {
      return res.status(400).json({ allowed: false, message: 'Email parameter required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        allowed: false,
        message: 'No Telegram account found with this email. Please start @TeleHireJOB_bot on Telegram first.',
      });
    }

    if (user.is_banned) {
      return res.status(403).json({ allowed: false, message: 'Account suspended.' });
    }

    const isGod = user.trial_applications_used < -1000;
    if (isGod) {
      user.extension_activated = true;
      await user.save();
      return res.status(200).json({
        allowed: true,
        isPaid: true,
        plan: 'GOD MODE (Unlimited)',
        quotaLeft: 999999,
        expiry: '2099-12-31',
        dailyLimit: 40,
        userName: user.name || 'Admin',
        message: 'God Mode verified. Unlimited safe form fills active.',
      });
    }

    if (!user.is_paid || user.plan === 'free') {
      return res.status(200).json({
        allowed: false,
        isPaid: false,
        plan: 'FREE',
        quotaLeft: 0,
        message: 'You are a Free user. This extension is for Paid users only. Please buy a plan in Telegram bot @TeleHireJOB_bot to unlock.',
      });
    }

    if (user.plan_expiry && new Date() > new Date(user.plan_expiry)) {
      user.is_paid = false;
      user.plan = 'free';
      await user.save();
      return res.status(200).json({
        allowed: false,
        isPaid: false,
        plan: 'EXPIRED',
        quotaLeft: 0,
        message: 'Subscription expired. Please renew your plan in Telegram bot @TeleHireJOB_bot.',
      });
    }

    // Check license match if user has license set
    if (license && user.extension_license_key && user.extension_license_key.toUpperCase() !== license) {
      return res.status(200).json({
        allowed: false,
        isPaid: true,
        message: 'Invalid license key. Please check your license key in Telegram bot with /extension or /myplan.',
      });
    }

    const planConfig = PLANS[user.plan] || PLANS.starter;
    const totalAllowed = planConfig.auto + (user.bonus_auto_quota || 0);
    const quotaLeft = Math.max(0, totalAllowed - (user.trial_applications_used || 0));

    if (quotaLeft <= 0) {
      return res.status(200).json({
        allowed: false,
        isPaid: true,
        plan: planConfig.name,
        quotaLeft: 0,
        message: 'Application quota exhausted. Please renew or top-up in Telegram bot @TeleHireJOB_bot.',
      });
    }

    user.extension_activated = true;
    await user.save();

    return res.status(200).json({
      allowed: true,
      isPaid: true,
      plan: planConfig.name,
      quotaLeft,
      totalQuota: totalAllowed,
      usedQuota: user.trial_applications_used || 0,
      expiry: user.plan_expiry ? user.plan_expiry.toISOString().split('T')[0] : '30 Days',
      dailyLimit: 40,
      userName: user.name || 'Subscriber',
      message: `Paid plan verified (${planConfig.name}). Safe form filling active.`,
    });
  } catch (err) {
    console.error('[EXTENSION VERIFY ERROR]:', err);
    return res.status(500).json({ allowed: false, message: 'Server error checking subscription.' });
  }
});

/**
 * 2. POST /api/extension/useQuota
 */
router.post('/extension/useQuota', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const platform = req.body.platform || 'Extension Form Fill';
    const jobTitle = req.body.jobTitle || 'Job Application';
    const company = req.body.company || 'Direct Employer';
    const jobUrl = req.body.jobUrl || '';

    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const isGod = user.trial_applications_used < -1000;
    const planConfig = PLANS[user.plan] || PLANS.free;
    const totalAllowed = isGod ? 999999 : (planConfig.auto + (user.bonus_auto_quota || 0));

    if (!isGod) {
      user.trial_applications_used = (user.trial_applications_used || 0) + 1;
    }

    // Daily count tracking
    const todayStr = getTodayStr();
    if (user.daily_fills_date !== todayStr) {
      user.daily_fills_date = todayStr;
      user.daily_fills_count = 1;
    } else {
      user.daily_fills_count = (user.daily_fills_count || 0) + 1;
    }
    await user.save();

    const applicationId = `EXT-${Math.floor(10000 + Math.random() * 90000)}`;
    await Application.create({
      user_id: user._id,
      telegram_id: user.telegram_id,
      application_id: applicationId,
      title: jobTitle,
      company: company,
      location: user.current_location || 'India',
      job_url: jobUrl || 'https://linkedin.com',
      source: platform,
      status: 'submitted',
    });

    const quotaLeft = isGod ? 999999 : Math.max(0, totalAllowed - user.trial_applications_used);
    return res.status(200).json({
      success: true,
      quotaLeft,
      todayCount: user.daily_fills_count,
      applicationId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. GET /api/extension/dailyCount?email=...
 */
router.get('/extension/dailyCount', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ count: 0, limit: 40 });

    const todayStr = getTodayStr();
    const count = user.daily_fills_date === todayStr ? (user.daily_fills_count || 0) : 0;
    return res.status(200).json({ count, limit: 40, date: todayStr });
  } catch (err) {
    return res.status(500).json({ count: 0, limit: 40 });
  }
});

/**
 * 4. GET /api/user/checkSubscription (alias)
 */
router.get('/checkSubscription', async (req, res) => {
  req.url = '/extension/verify';
  return router.handle(req, res);
});

/**
 * 5. GET /api/user/getProfile?email=...
 */
router.get('/getProfile', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const fullName = (user.name || '').trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    return res.status(200).json({
      success: true,
      profile: {
        name: fullName,
        firstName,
        lastName,
        email: user.email,
        phone: user.phone || '+91 ',
        current_location: user.current_location || user.location || 'Bangalore, India',
        experience_years: user.experience_years || '0-1',
        skills: user.skills || [],
        skillsString: (user.skills || []).join(', '),
        linkedin: user.linkedin || '',
        github: user.github || '',
        notice_period: user.notice_period || 'Immediate / 15 Days',
        expected_ctc: user.expected_salary || user.expected_ctc || 'As per industry standards',
        education: user.education || 'Bachelor of Technology',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. POST /api/user/useQuota (alias)
 */
router.post('/useQuota', async (req, res) => {
  req.url = '/extension/useQuota';
  return router.handle(req, res);
});

/**
 * 7. Download Extension Zip File Endpoint
 */
router.get('/download/extension.zip', (req, res) => {
  const zipPath = path.join(__dirname, '..', 'whatshire-extension.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'whatshire-extension.zip');
  } else {
    res.status(404).json({ error: 'Extension zip file not found on server.' });
  }
});

module.exports = router;
