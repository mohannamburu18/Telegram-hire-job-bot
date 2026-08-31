const express = require('express');
const router = express.Router();
const path = require('path');
const User = require('../models/User');
const Application = require('../models/Application');
const { fetchLiveJobs } = require('../jobs/fetchLiveJobs');
const { PLANS, ADDONS } = require('../utils/plans');

/**
 * Admin Authentication Middleware
 * Checks header 'x-admin-secret' OR query param '?secret=xxx'
 */
function adminAuth(req, res, next) {
  const expectedSecret = process.env.ADMIN_SECRET || 'whatshire_admin_2026_secure';
  const providedSecret = req.headers['x-admin-secret'] || req.query.secret;

  if (providedSecret && providedSecret === expectedSecret) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized - use ?secret=ADMIN_SECRET or x-admin-secret header',
  });
}

// --- SERVE ADMIN DASHBOARD HTML ---
router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// --- ADMIN STATS ENDPOINT ---
router.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const total_users = await User.countDocuments();
    const paid_users = await User.countDocuments({ is_paid: true });
    const free_users = Math.max(0, total_users - paid_users);

    const total_applications = await Application.countDocuments();

    // Calculate sum of trial_links_used
    const linksAgg = await User.aggregate([
      { $group: { _id: null, total_links: { $sum: '$trial_links_used' } } }
    ]);
    const total_links = linksAgg[0]?.total_links || 0;

    // Calculate plan breakdowns and estimated revenue
    const allUsers = await User.find().select('plan is_paid addons createdAt updatedAt');
    let revenue_estimated = 0;
    const planCounts = { free: 0, starter: 0, popular: 0, power: 0 };

    for (const u of allUsers) {
      const p = u.plan || 'free';
      if (planCounts[p] !== undefined) planCounts[p]++;
      if (u.is_paid && PLANS[p]) {
        revenue_estimated += PLANS[p].price || 0;
      }
      // Add revenue from purchased standalone add-ons
      if (Array.isArray(u.addons)) {
        for (const addon of u.addons) {
          const addonConfig = ADDONS[addon.name];
          if (addonConfig) revenue_estimated += addonConfig.price || 0;
        }
      }
    }

    const plans_breakdown = Object.keys(planCounts).map(key => ({
      plan: key,
      name: PLANS[key]?.name || key.toUpperCase(),
      count: planCounts[key],
      price: PLANS[key]?.price || 0,
      revenue: planCounts[key] * (PLANS[key]?.price || 0),
    }));

    // Today signups & today paid calculations
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const today_signups = await User.countDocuments({ createdAt: { $gte: startOfToday } });
    const today_paid = await User.countDocuments({ is_paid: true, updatedAt: { $gte: startOfToday } });

    return res.status(200).json({
      success: true,
      total_users,
      paid_users,
      free_users,
      total_applications,
      total_links,
      revenue_estimated,
      plans_breakdown,
      today_signups,
      today_paid,
      server_time: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (err) {
    console.error('[ADMIN STATS ERROR]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- ADMIN USERS LIST & SEARCH ENDPOINT ---
router.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { search = '', plan = '', limit = 200 } = req.query;
    const filter = {};

    if (plan && plan !== 'all') {
      filter.plan = plan;
    }

    if (search && search.trim().length > 0) {
      const regex = new RegExp(search.trim(), 'i');
      const isNum = !isNaN(Number(search.trim()));

      const orConditions = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { referral_code: regex },
        { role: regex },
        { location: regex },
      ];

      if (isNum) {
        orConditions.push({ telegram_id: Number(search.trim()) });
      }

      filter.$or = orConditions;
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10) || 200)
      .select('telegram_id name email phone plan is_paid trial_applications_used trial_links_used role location referral_code referrals_count is_banned profile_completed createdAt plan_expiry addons bonus_auto_quota bonus_manual_quota');

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err) {
    console.error('[ADMIN USERS ERROR]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- ADMIN ACTION ENDPOINT ---
router.post('/api/admin/action', adminAuth, async (req, res) => {
  try {
    const { telegram_id, action, plan, amount, addon_name } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'telegram_id is required.' });
    }

    const user = await User.findOne({ telegram_id: Number(telegram_id) });
    if (!user && action !== 'delete') {
      return res.status(404).json({ success: false, error: `User with telegram_id ${telegram_id} not found.` });
    }

    switch (action) {
      case 'make_unlimited': {
        user.is_paid = true;
        user.plan = 'power';
        user.plan_expiry = new Date('2099-12-31T23:59:59.999Z');
        user.trial_applications_used = -999999;
        user.trial_links_used = -999999;
        user.bonus_auto_quota = 999999;
        user.bonus_manual_quota = 999999;
        await user.save();
        return res.status(200).json({ success: true, message: `User ${telegram_id} granted Unlimited God Mode access.` });
      }

      case 'activate_plan': {
        const targetPlan = plan || 'popular';
        const planData = PLANS[targetPlan] || PLANS.popular;
        user.is_paid = true;
        user.plan = targetPlan;
        user.plan_expiry = new Date(Date.now() + planData.days * 24 * 60 * 60 * 1000);
        user.trial_applications_used = 0;
        await user.save();
        return res.status(200).json({ success: true, message: `Plan ${targetPlan.toUpperCase()} activated for user ${telegram_id}.` });
      }

      case 'add_auto': {
        const amt = parseInt(amount, 10) || 50;
        user.trial_applications_used = (user.trial_applications_used || 0) - amt;
        await user.save();
        return res.status(200).json({ success: true, message: `Added ${amt} auto applications to user ${telegram_id}.` });
      }

      case 'add_manual': {
        const amt = parseInt(amount, 10) || 100;
        user.trial_links_used = (user.trial_links_used || 0) - amt;
        await user.save();
        return res.status(200).json({ success: true, message: `Added ${amt} manual links to user ${telegram_id}.` });
      }

      case 'ban': {
        user.is_banned = true;
        await user.save();
        return res.status(200).json({ success: true, message: `User ${telegram_id} has been banned.` });
      }

      case 'unban': {
        user.is_banned = false;
        await user.save();
        return res.status(200).json({ success: true, message: `User ${telegram_id} has been unbanned.` });
      }

      case 'delete': {
        await User.deleteOne({ telegram_id: Number(telegram_id) });
        await Application.deleteMany({ telegram_id: Number(telegram_id) });
        return res.status(200).json({ success: true, message: `User ${telegram_id} and associated applications deleted.` });
      }

      case 'give_addon': {
        const name = addon_name || 'resume_rewrite';
        if (!user.addons) user.addons = [];
        user.addons.push({
          name,
          purchased_at: new Date(),
          expiry: name === 'priority_apply' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        });
        await user.save();
        return res.status(200).json({ success: true, message: `Add-on ${name} granted to user ${telegram_id}.` });
      }

      default:
        return res.status(400).json({ success: false, error: `Unrecognized action: ${action}` });
    }
  } catch (err) {
    console.error('[ADMIN ACTION ERROR]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- ADMIN LIVE JOBS TESTER ENDPOINT ---
router.get('/api/admin/jobs/live', adminAuth, async (req, res) => {
  try {
    const role = req.query.role || 'Software Engineer';
    const location = req.query.location || 'Remote';
    const result = await fetchLiveJobs(role, location);
    return res.status(200).json({
      success: true,
      count: result.totalFound,
      autoCount: result.autoJobs.length,
      manualCount: result.manualJobs.length,
      role,
      location,
      jobs: [...result.autoJobs, ...result.manualJobs],
      autoJobs: result.autoJobs,
      manualJobs: result.manualJobs,
    });
  } catch (err) {
    console.error('[ADMIN JOBS LIVE ERROR]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

