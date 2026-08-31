/**
 * WhatsHire Safe Filler - Background Service Worker
 * Enforces Paid Subscription, Quota Decrement, and Daily Safety Limits
 */

const DEFAULT_BACKEND = 'http://localhost:3000';

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

async function handleCheckSubscription(email, license = '') {
  if (!email) return { allowed: false, message: 'Please enter your Telegram email' };

  try {
    const backend = await getBackendUrl();
    const res = await fetch(`${backend}/api/extension/verify?email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`);
    const data = await res.json();

    if (data.allowed) {
      chrome.storage.local.set({
        userEmail: email,
        userLicense: license,
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
    return { allowed: false, message: 'Could not connect to WhatsHire server. Please make sure the app is running.' };
  }
}

async function handleGetProfile(email) {
  try {
    const backend = await getBackendUrl();
    const res = await fetch(`${backend}/api/user/getProfile?email=${encodeURIComponent(email)}`);
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleUseQuota(payload) {
  try {
    const backend = await getBackendUrl();
    const res = await fetch(`${backend}/api/user/useQuota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    // Increment today's local fill counter
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

