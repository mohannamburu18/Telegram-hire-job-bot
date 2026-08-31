/**
 * WhatsHire Safe Filler - Background Service Worker (Phase 5.1 Fixed)
 * Enforces Paid Subscription, Quota Decrement, and Daily Safety Limits
 */

const DEFAULT_BACKEND = 'http://localhost:3000';
const PRODUCTION_FALLBACK = 'https://telegram-hire-job-bot.onrender.com';

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customBackendUrl'], (data) => {
      resolve(data.customBackendUrl || DEFAULT_BACKEND);
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_SUBSCRIPTION') {
    handleCheckSubscription(request.email, request.license).then(sendResponse);
    return true; // async
  }

  if (request.type === 'GET_PROFILE') {
    handleGetProfile(request.email).then(sendResponse);
    return true;
  }

  if (request.type === 'USE_QUOTA') {
    handleUseQuota(request.payload).then(sendResponse);
    return true;
  }

  if (request.type === 'GET_DAILY_USAGE') {
    getDailyUsage().then(sendResponse);
    return true;
  }
});

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function handleCheckSubscription(email, license = '') {
  if (!email) return { allowed: false, reason: 'Please enter your Telegram registered email.' };

  const cleanEmail = email.trim().toLowerCase();
  const cleanLicense = license.trim().toUpperCase();

  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/extension/verify?email=${encodeURIComponent(cleanEmail)}&license=${encodeURIComponent(cleanLicense)}`;

    let data;
    try {
      data = await fetchWithRetry(targetUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    } catch (primaryErr) {
      // If primary failed and was localhost, try production fallback or vice-versa
      if (backend !== PRODUCTION_FALLBACK && !backend.includes('onrender.com')) {
        const fallbackUrl = `${PRODUCTION_FALLBACK}/api/extension/verify?email=${encodeURIComponent(cleanEmail)}&license=${encodeURIComponent(cleanLicense)}`;
        data = await fetchWithRetry(fallbackUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
        chrome.storage.local.set({ customBackendUrl: PRODUCTION_FALLBACK });
      } else {
        throw primaryErr;
      }
    }

    if (data && data.allowed) {
      chrome.storage.local.set({
        userEmail: cleanEmail,
        userLicense: cleanLicense,
        isPaid: true,
        plan: data.plan,
        quotaLeft: data.quotaLeft,
        expiryDate: data.expiry,
        lastVerified: Date.now(),
      });
    } else {
      chrome.storage.local.set({
        isPaid: false,
        quotaLeft: 0,
      });
    }

    return data;
  } catch (err) {
    return {
      allowed: false,
      reason: `Could not connect to WhatsHire server. Please verify: 1) Server is running, 2) Internet connection is active. (Error: ${err.message})`,
    };
  }
}

async function handleGetProfile(email) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/user/getProfile?email=${encodeURIComponent(email.trim().toLowerCase())}`;
    return await fetchWithRetry(targetUrl);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleUseQuota(payload) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/user/useQuota`;
    const data = await fetchWithRetry(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const todayKey = getTodayKey();
    const usage = await getDailyUsage();
    const newCount = usage.count + 1;

    chrome.storage.local.set({
      [`fills_${todayKey}`]: newCount,
      quotaLeft: data.quotaLeft,
    });

    return { ...data, todayCount: newCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getDailyUsage() {
  return new Promise((resolve) => {
    const todayKey = getTodayKey();
    chrome.storage.local.get([`fills_${todayKey}`], (data) => {
      resolve({
        date: todayKey,
        count: data[`fills_${todayKey}`] || 0,
        limit: 40,
      });
    });
  });
}
