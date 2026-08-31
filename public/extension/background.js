/**
 * TeleHire Safe Filler & Auto-Apply Background Service Worker (Phase 7 Real-Time Repaired)
 * Handles Subscription Verification, Profile Fetching, Quota Decrement, and Application Task Queue
 */

const BACKEND_URL = 'https://telegram-hire-job-bot.onrender.com';
const LOCAL_BACKEND_URL = 'http://localhost:3000';

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customBackendUrl'], (data) => {
      resolve(data.customBackendUrl || BACKEND_URL);
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_SUBSCRIPTION') {
    handleCheckSubscription(request.email, request.license).then(sendResponse);
    return true;
  }

  if (request.type === 'GET_PROFILE') {
    handleGetProfile(request.email, request.license).then(sendResponse);
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

  if (request.type === 'FETCH_APPLICATION_TASK') {
    handleFetchTask(request.email, request.license).then(sendResponse);
    return true;
  }

  if (request.type === 'UPDATE_TASK_STATUS') {
    handleUpdateTaskStatus(request.payload).then(sendResponse);
    return true;
  }
});

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
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
      if (!backend.includes('localhost') && !backend.includes('127.0.0.1')) {
        const fallbackUrl = `${LOCAL_BACKEND_URL}/api/extension/verify?email=${encodeURIComponent(cleanEmail)}&license=${encodeURIComponent(cleanLicense)}`;
        try {
          data = await fetchWithRetry(fallbackUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
        } catch (secErr) {
          throw primaryErr;
        }
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
      reason: `Could not connect to TeleHire server. Please verify: 1) Server is running, 2) Internet connection is active. (Error: ${err.message})`,
    };
  }
}

async function handleGetProfile(email, license = '') {
  try {
    const backend = await getBackendUrl();
    let cleanLicense = license;
    if (!cleanLicense) {
      const storage = await new Promise(r => chrome.storage.local.get(['userLicense'], r));
      cleanLicense = storage.userLicense || '';
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanLic = (cleanLicense || '').trim().toUpperCase();
    const targetUrl = `${backend}/api/user/getProfile?email=${encodeURIComponent(cleanEmail)}&license=${encodeURIComponent(cleanLic)}`;

    let res;
    try {
      res = await fetchWithRetry(targetUrl);
    } catch (err) {
      if (!backend.includes('localhost') && !backend.includes('127.0.0.1')) {
        const fallbackUrl = `${LOCAL_BACKEND_URL}/api/user/getProfile?email=${encodeURIComponent(cleanEmail)}&license=${encodeURIComponent(cleanLic)}`;
        res = await fetchWithRetry(fallbackUrl);
      } else {
        throw err;
      }
    }

    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleUseQuota(payload) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/user/useQuota`;

    let data;
    try {
      data = await fetchWithRetry(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (!backend.includes('localhost') && !backend.includes('127.0.0.1')) {
        const fallbackUrl = `${LOCAL_BACKEND_URL}/api/user/useQuota`;
        data = await fetchWithRetry(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        throw err;
      }
    }

    const todayKey = getTodayKey();
    const usage = await getDailyUsage();
    const newCount = usage.count + 1;

    chrome.storage.local.set({
      [`fills_${todayKey}`]: newCount,
      quotaLeft: data?.quotaLeft,
    });

    return { ...data, todayCount: newCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleFetchTask(email, license) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/queue/pending?email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`;
    return await fetchWithRetry(targetUrl);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleUpdateTaskStatus(payload) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/queue/updateStatus`;
    return await fetchWithRetry(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getDailyUsage() {
  return new Promise((resolve) => {
    const todayKey = getTodayKey();
    chrome.storage.local.get([`fills_${todayKey}`], (data) => {
      resolve({
        count: data[`fills_${todayKey}`] || 0,
        limit: 40,
        date: todayKey,
      });
    });
  });
}
