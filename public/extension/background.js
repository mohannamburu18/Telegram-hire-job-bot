/**
 * Lucres AI & TeleHire - Background Service Worker
 * Persistent Session Management · 120s Queue Poller · Tab Navigation Handshake
 */

const BACKEND_URL = 'https://telegram-hire-job-bot.onrender.com';
const LOCAL_BACKEND_URL = 'http://localhost:3000';

let activeQueueSession = null;

// Enable Side Panel opening on action click
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// 120s Autonomous Queue Poller
setInterval(async () => {
  try {
    const storage = await new Promise(r => chrome.storage.local.get(['userEmail', 'telegramId', 'userLicense', 'autoProcessQueue'], r));
    if (!storage.autoProcessQueue) return;

    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/queue?telegramId=${storage.telegramId || ''}&email=${encodeURIComponent(storage.userEmail || '')}`;
    const res = await fetchWithRetry(targetUrl);

    if (res && res.success && res.job && res.job.url) {
      console.log('[Lucres Poller] Found queued job:', res.job.title, res.job.url);
      const tab = await chrome.tabs.create({ url: res.job.url });
      activeQueueSession = {
        taskId: res.job.id,
        jobUrl: res.job.url,
        title: res.job.title,
        company: res.job.company,
        platform: res.job.platform,
        status: 'OPENING',
        tabId: tab.id,
      };
      chrome.storage.local.set({ activeTask: activeQueueSession });
    }
  } catch (_) {}
}, 120000);

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customBackendUrl'], (data) => {
      resolve(data.customBackendUrl || LOCAL_BACKEND_URL);
    });
  });
}

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
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'LINK_BY_TOKEN') {
    handleLinkByToken(request.token).then(sendResponse);
    return true;
  }

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

  if (request.type === 'FETCH_QUEUE_STATUS') {
    handleFetchQueueStatus(request.email, request.license).then(sendResponse);
    return true;
  }

  if (request.type === 'START_QUEUE_RUNNER') {
    handleStartQueueRunner(request.email, request.license).then(sendResponse);
    return true;
  }

  if (request.type === 'UPDATE_TASK_STATUS') {
    handleUpdateTaskStatus(request.payload).then(sendResponse);
    return true;
  }

  if (request.type === 'REPORT_TASK_PROGRESS') {
    handleReportTaskProgress(request.payload).then(sendResponse);
    return true;
  }
});

// 1. Subscription & Session Verification
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
      reason: `Could not connect to TeleHire server. (Error: ${err.message})`,
    };
  }
}

// 2. Profile Fetcher
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

// 3. Quota Decrement
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

// 4. Fetch Queue Status
async function handleFetchQueueStatus(email, license) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/queue/status?email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`;
    return await fetchWithRetry(targetUrl);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 5. Start Queue Runner: Claims task, creates tab, and initiates execution
async function handleStartQueueRunner(email, license) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/queue/pending?email=${encodeURIComponent(email)}&license=${encodeURIComponent(license)}`;
    const res = await fetchWithRetry(targetUrl);

    if (res && res.success && res.task) {
      const task = res.task;
      const tab = await chrome.tabs.create({ url: task.jobUrl });

      activeQueueSession = {
        taskId: task.taskId,
        jobUrl: task.jobUrl,
        title: task.title,
        company: task.company,
        platform: task.platform,
        status: 'OPENING',
        tabId: tab.id,
        email,
        license,
      };

      chrome.storage.local.set({ activeTask: activeQueueSession });
      broadcastTaskUpdate(activeQueueSession);

      return { success: true, task: activeQueueSession };
    }

    return { success: false, message: 'No pending tasks in queue' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 6. Update Task Status
async function handleUpdateTaskStatus(payload) {
  try {
    const backend = await getBackendUrl();
    const targetUrl = `${backend}/api/queue/updateStatus`;
    const res = await fetchWithRetry(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (activeQueueSession && activeQueueSession.taskId === payload.taskId) {
      activeQueueSession = { ...activeQueueSession, ...payload };
      chrome.storage.local.set({ activeTask: activeQueueSession });
      broadcastTaskUpdate(activeQueueSession);
    }

    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 7. Report Task Progress from Content Script
async function handleReportTaskProgress(payload) {
  if (activeQueueSession && activeQueueSession.taskId === payload.taskId) {
    activeQueueSession = { ...activeQueueSession, ...payload };
    chrome.storage.local.set({ activeTask: activeQueueSession });
    broadcastTaskUpdate(activeQueueSession);

    // Sync to backend
    handleUpdateTaskStatus(payload);
  }
  return { success: true };
}

function broadcastTaskUpdate(task) {
  chrome.runtime.sendMessage({ type: 'QUEUE_TASK_LIVE_UPDATE', task }).catch(() => {});
}

// 8. Tab Navigation Listener: Detects loaded tab and dispatches autofill trigger
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (activeQueueSession && activeQueueSession.tabId === tabId && changeInfo.status === 'complete') {
    console.log(`[TeleHire Background] Tab #${tabId} complete. Triggering autofill on ${tab.url}...`);

    // Retry sending message to content script to allow DOM initialization
    const delays = [600, 1500, 3000];
    delays.forEach(delay => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          type: 'AUTO_START_QUEUE_TASK',
          task: activeQueueSession,
        }, (res) => {
          if (chrome.runtime.lastError) {
            // Content script may still be loading
          } else if (res && res.started) {
            console.log(`[TeleHire Background] Autofill started on tab #${tabId}`);
          }
        });
      }, delay);
    });
  }
});

async function handleLinkByToken(token) {
  try {
    const backend = await getBackendUrl();
    const res = await fetchWithRetry(`${backend}/api/user-by-token?token=${encodeURIComponent(token)}`);
    if (res && res.success) {
      chrome.storage.local.set({
        telegramId: res.telegramId,
        userEmail: res.email,
        userProfile: res,
        isPaid: true,
        plan: res.plan,
        atsScore: res.atsScore || 95,
      });
      return { success: true, user: res };
    }
    return { success: false, error: res?.error || 'Token verification failed' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {};
