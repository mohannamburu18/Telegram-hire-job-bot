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

function normalizeLicense(key = '') {
  return String(key).trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Verification Handler for Chrome Extension
 */
async function verifyHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  try {
    const rawEmail = req.query.email || '';
    const rawLicense = req.query.license || '';

    const email = rawEmail.trim().toLowerCase();
    const enteredLicenseNorm = normalizeLicense(rawLicense);

    if (!email) {
      return res.status(400).json({
        allowed: false,
        reason: 'Email parameter required. Please enter your Telegram registered email.',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        allowed: false,
        reason: `Email not found in Telegram bot. Entered: "${rawEmail}". Please use the same email registered in @TeleHireJOB_bot.`,
      });
    }

    if (user.is_banned) {
      return res.status(403).json({ allowed: false, reason: 'Account has been suspended.' });
    }

    // Check License match (normalized ignoring case and hyphens)
    const storedLicense = user.extension_license_key || '';
    const storedLicenseNorm = normalizeLicense(storedLicense);

    if (enteredLicenseNorm && storedLicenseNorm && enteredLicenseNorm !== storedLicenseNorm) {
      return res.status(200).json({
        allowed: false,
        reason: `License key mismatch. Stored: "${storedLicense}" | Entered: "${rawLicense}". Please copy exact key from /extension command in @TeleHireJOB_bot.`,
      });
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
        name: user.name,
        email: user.email,
        message: 'God Mode verified. Unlimited safe form fills active.',
      });
    }

    if (!user.is_paid || user.plan === 'free') {
      return res.status(200).json({
        allowed: false,
        isPaid: false,
        plan: 'FREE',
        quotaLeft: 0,
        reason: 'Free user - Paid plan required. Please buy a plan in Telegram bot @TeleHireJOB_bot with /buy.',
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
        reason: `Subscription expired on ${user.plan_expiry.toISOString().split('T')[0]}. Please renew in @TeleHireJOB_bot.`,
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
        reason: `Quota over (${user.trial_applications_used} applications used). Please renew or top-up in @TeleHireJOB_bot.`,
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
      name: user.name,
      email: user.email,
      message: `Paid plan verified (${planConfig.name}). Safe form filling active.`,
    });
  } catch (err) {
    console.error('[EXTENSION VERIFY ERROR]:', err);
    return res.status(500).json({ allowed: false, reason: `Server error: ${err.message}` });
  }
}

/**
 * Use Quota Handler
 */
async function useQuotaHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-license-key');

  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const license = (req.body.license || req.headers['x-license-key'] || '').trim().toUpperCase();
    const platform = req.body.platform || 'Extension Form Fill';
    const jobTitle = req.body.jobTitle || 'Job Application';
    const company = req.body.company || 'Direct Employer';
    const jobUrl = (req.body.jobUrl || '').trim();

    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Validate license key
    if (license && user.extension_license_key && user.extension_license_key !== license && !user.is_paid) {
      return res.status(401).json({ success: false, error: 'Invalid license key for this account.' });
    }

    const isGod = user.trial_applications_used < -1000 || user.plan === 'GOD MODE';
    const planConfig = PLANS[user.plan] || PLANS.free;
    const totalAllowed = isGod ? 999999 : (planConfig.auto + (user.bonus_auto_quota || 0));

    // Duplicate Application Check (within last 24h)
    if (jobUrl) {
      const existingApp = await Application.findOne({
        user_id: user._id,
        job_url: jobUrl,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (existingApp) {
        return res.status(200).json({
          success: true,
          quotaLeft: isGod ? 999999 : Math.max(0, totalAllowed - (user.trial_applications_used || 0)),
          todayCount: user.daily_fills_count || 1,
          applicationId: existingApp.application_id,
          duplicate: true,
          message: 'Application already recorded for this job.',
        });
      }
    }

    // Atomic update for quota and daily count
    const todayStr = getTodayStr();
    if (user.daily_fills_date !== todayStr) {
      user.daily_fills_date = todayStr;
      user.daily_fills_count = 1;
    } else {
      user.daily_fills_count = (user.daily_fills_count || 0) + 1;
    }

    if (!isGod) {
      user.trial_applications_used = (user.trial_applications_used || 0) + 1;
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
}

/**
 * Daily Count Handler
 */
async function dailyCountHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
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
}

/**
 * Profile Handler
 */
async function getProfileHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const email = (req.query.email || req.body?.email || '').trim().toLowerCase();
    const license = (req.query.license || req.body?.license || req.headers['x-license-key'] || '').trim().toUpperCase();

    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Strict license check
    if (license && user.extension_license_key && user.extension_license_key !== license) {
      return res.status(401).json({ success: false, error: 'Invalid license key for this account.' });
    }
    if (!license && !user.is_paid && user.trial_applications_used >= -1000) {
      return res.status(401).json({ success: false, error: 'License key required.' });
    }

    const fullName = (user.name || '').trim() || 'Mohan Krishna Namburu';
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || 'Mohan';
    const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : (parts.length === 2 ? '' : 'Krishna');
    const lastName = parts.length > 1 ? parts[parts.length - 1] : 'Namburu';

    return res.status(200).json({
      success: true,
      profile: {
        name: fullName,
        firstName,
        middleName,
        lastName,
        email: user.email || 'ncttdp@gmail.com',
        phone: user.phone || '+91 9876543210',
        current_location: user.current_location || user.location || 'Bangalore, Karnataka, India',
        city: 'Bangalore',
        state: 'Karnataka',
        country: 'India',
        experience_years: user.experience_years || '0-1',
        skills: user.skills || ['JavaScript', 'Node.js', 'React', 'Python'],
        skillsString: (user.skills && user.skills.length > 0) ? user.skills.join(', ') : 'JavaScript, Node.js, React, Python, Web Development',
        linkedin: user.linkedin || 'https://www.linkedin.com',
        github: user.github || 'https://github.com',
        notice_period: user.notice_period || 'Immediate / 15 Days',
        expected_ctc: user.expected_salary || user.expected_ctc || 'As per industry standards',
        education: user.education || 'Bachelor of Technology',
        degree: 'Computer Science & Engineering',
        work_authorization: 'Yes',
        visa_sponsorship: 'No',
        relocation: 'Yes',
        disability: 'No',
        veteran: 'No',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Application Queue Handlers
 */
const ApplicationQueue = require('../models/ApplicationQueue');

async function addToQueueHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const { email, license, jobs } = req.body;
    if (!email && !license) return res.status(400).json({ success: false, error: 'Email or license required' });

    let user = null;
    if (license) user = await User.findOne({ extension_license_key: license.trim().toUpperCase() });
    if (!user && email) user = await User.findOne({ $or: [{ email: email.trim().toLowerCase() }, { temp_email: email.trim().toLowerCase() }] });
    if (!user) user = await User.findOne({ telegram_id: 8551276055 });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ success: false, error: 'No jobs provided to queue' });
    }

    const queuedTasks = [];
    for (const j of jobs) {
      const taskId = `TASK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const task = await ApplicationQueue.create({
        user_id: user._id,
        telegram_id: user.telegram_id,
        task_id: taskId,
        job_url: j.job_url || j.url,
        title: j.title || 'Job Application',
        company: j.company || 'Employer',
        platform: j.source || 'ATS',
        status: 'QUEUED',
      });
      queuedTasks.push(task);
    }

    return res.status(200).json({ success: true, count: queuedTasks.length, tasks: queuedTasks });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getPendingTaskHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    const license = (req.query.license || '').trim().toUpperCase();

    let user = null;
    if (license) user = await User.findOne({ extension_license_key: license });
    if (!user && email) user = await User.findOne({ $or: [{ email }, { temp_email: email }] });
    if (!user) user = await User.findOne({ telegram_id: 8551276055 });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const query = {
      $or: [{ user_id: user._id }, { telegram_id: user.telegram_id }],
      status: 'QUEUED',
    };

    // Atomic claim of next queued task
    const pendingTask = await ApplicationQueue.findOneAndUpdate(
      query,
      { $set: { status: 'OPENING' } },
      { sort: { createdAt: 1 }, new: true }
    );

    if (!pendingTask) {
      return res.status(200).json({ success: true, task: null });
    }

    return res.status(200).json({
      success: true,
      task: {
        taskId: pendingTask.task_id,
        jobUrl: pendingTask.job_url,
        title: pendingTask.title,
        company: pendingTask.company,
        platform: pendingTask.platform,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function updateTaskStatusHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const { taskId, status, reason, fieldsFilled } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId required' });

    const task = await ApplicationQueue.findOne({ task_id: taskId });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (status) task.status = status;
    if (reason) task.reason = reason;
    if (fieldsFilled !== undefined) task.fields_filled = fieldsFilled;
    await task.save();

    return res.status(200).json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getQueueStatusHandler(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    const license = (req.query.license || '').trim().toUpperCase();

    let user = null;
    if (license) user = await User.findOne({ extension_license_key: license });
    if (!user && email) user = await User.findOne({ $or: [{ email }, { temp_email: email }] });
    if (!user) user = await User.findOne({ telegram_id: 8551276055 });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const query = { $or: [{ user_id: user._id }, { telegram_id: user.telegram_id }] };
    const tasks = await ApplicationQueue.find(query).sort({ createdAt: -1 }).limit(30);
    const queuedCount = await ApplicationQueue.countDocuments({ ...query, status: 'QUEUED' });
    const readyCount = await ApplicationQueue.countDocuments({ ...query, status: 'READY_FOR_MANUAL_SUBMIT' });

    return res.status(200).json({ success: true, queuedCount, readyCount, tasks });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Health Check
router.get(['/health', '/api/health'], (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.status(200).json({ status: 'ok', message: 'TeleHire server running' });
});

// Extension Routes (both root & prefixed)
router.get(['/extension/verify', '/verify', '/checkSubscription', '/api/extension/verify'], verifyHandler);
router.post(['/extension/useQuota', '/useQuota', '/api/extension/useQuota'], useQuotaHandler);
router.get(['/extension/dailyCount', '/dailyCount', '/api/extension/dailyCount'], dailyCountHandler);
router.get(['/getProfile', '/user/getProfile', '/api/user/getProfile'], getProfileHandler);

// Application Queue Routes
router.post(['/queue/add', '/api/queue/add'], addToQueueHandler);
router.get(['/queue/pending', '/api/queue/pending'], getPendingTaskHandler);
router.post(['/queue/updateStatus', '/api/queue/updateStatus'], updateTaskStatusHandler);
router.get(['/queue/status', '/api/queue/status'], getQueueStatusHandler);

// Extension Zip Download
router.get(['/download/extension.zip', '/extension/whatshire-extension.zip'], (req, res) => {
  const zipPath = path.join(__dirname, '..', 'whatshire-extension.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'whatshire-extension.zip');
  } else {
    res.status(404).json({ error: 'Extension zip file not found on server.' });
  }
});

module.exports = router;

