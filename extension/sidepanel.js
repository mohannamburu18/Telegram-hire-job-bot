/**
 * TeleHire Copilot - Persistent Side Panel Controller
 * Real-Time Application Queue & Multi-Step Autofill Orchestrator
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const badgeAuth = document.getElementById('badge-auth');
  const cardAuth = document.getElementById('card-auth');
  const cardProfile = document.getElementById('card-profile');
  const cardActiveJob = document.getElementById('card-active-job');
  const cardQueueList = document.getElementById('card-queue-list');

  const inputEmail = document.getElementById('input-email');
  const inputLicense = document.getElementById('input-license');
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const loginStatus = document.getElementById('login-status');

  const profName = document.getElementById('prof-name');
  const profEmail = document.getElementById('prof-email');
  const profPlan = document.getElementById('prof-plan');
  const profQuota = document.getElementById('prof-quota');
  const profDaily = document.getElementById('prof-daily');

  const jobStatusBadge = document.getElementById('job-status-badge');
  const jobTitle = document.getElementById('job-title');
  const jobCompany = document.getElementById('job-company');
  const jobPlatform = document.getElementById('job-platform');
  const jobProgressBar = document.getElementById('job-progress-bar');
  const jobStepText = document.getElementById('job-step-text');
  const jobFieldsCount = document.getElementById('job-fields-count');
  const jobReasonBox = document.getElementById('job-reason-box');

  const btnFillCurrent = document.getElementById('btn-fill-current');
  const btnProcessNext = document.getElementById('btn-process-next');
  const btnMarkSubmitted = document.getElementById('btn-mark-submitted');
  const btnRefreshQueue = document.getElementById('btn-refresh-queue');
  const queueCount = document.getElementById('queue-count');
  const queueItemsContainer = document.getElementById('queue-items-container');
  const activityLog = document.getElementById('activity-log');
  const btnClearLog = document.getElementById('btn-clear-log');

  let activeSessionUser = null;
  let activeCurrentTask = null;

  function appendLog(msg, type = 'info') {
    const line = document.createElement('div');
    line.className = 'th-log-line';
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    line.innerHTML = `<span class="th-log-time">[${time}]</span> ${msg}`;
    activityLog.appendChild(line);
    activityLog.scrollTop = activityLog.scrollHeight;
  }

  // 1. Initial Session Restoration from chrome.storage.local
  async function restoreSession() {
    chrome.storage.local.get(['userEmail', 'userLicense', 'userProfile', 'activeTask'], async (data) => {
      if (data.userEmail && data.userLicense) {
        inputEmail.value = data.userEmail;
        inputLicense.value = data.userLicense;
        await verifyAndRenderSession(data.userEmail, data.userLicense);
      } else {
        showLoginCard();
      }

      if (data.activeTask) {
        renderActiveTask(data.activeTask);
      }
    });
  }

  function showLoginCard() {
    badgeAuth.innerText = 'Unverified';
    badgeAuth.className = 'th-badge th-badge-free';
    cardAuth.style.display = 'block';
    cardProfile.style.display = 'none';
    cardActiveJob.style.display = 'none';
    cardQueueList.style.display = 'none';
  }

  // 2. Authentication Verifier
  async function verifyAndRenderSession(email, license) {
    badgeAuth.innerText = 'Verifying...';
    badgeAuth.className = 'th-badge th-badge-neutral';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_SUBSCRIPTION', email, license });
      const usage = await chrome.runtime.sendMessage({ type: 'GET_DAILY_USAGE' });
      const profRes = await chrome.runtime.sendMessage({ type: 'GET_PROFILE', email, license });

      if (res && res.allowed) {
        activeSessionUser = {
          email,
          license,
          name: res.userName || res.name || profRes.profile?.name || email,
          plan: res.plan || 'POWER',
          quotaLeft: res.quotaLeft,
          dailyCount: usage?.count || 0,
        };

        chrome.storage.local.set({
          userEmail: email,
          userLicense: license,
          userProfile: profRes.profile || null,
        });

        badgeAuth.innerText = `Verified (${activeSessionUser.plan})`;
        badgeAuth.className = 'th-badge th-badge-paid';

        cardAuth.style.display = 'none';
        cardProfile.style.display = 'block';
        cardActiveJob.style.display = 'block';
        cardQueueList.style.display = 'block';

        profName.innerText = activeSessionUser.name;
        profEmail.innerText = activeSessionUser.email;
        profPlan.innerText = activeSessionUser.plan;
        profQuota.innerText = activeSessionUser.quotaLeft > 9999 ? 'Unlimited' : `${activeSessionUser.quotaLeft} left`;
        profDaily.innerText = `${activeSessionUser.dailyCount} / 40`;

        appendLog(`Authenticated: ${activeSessionUser.name} (${activeSessionUser.plan})`);
        await refreshQueueList();
      } else {
        showLoginCard();
        loginStatus.innerText = `⚠️ ${res?.reason || res?.message || 'Paid subscription required.'}`;
        appendLog(`Auth failed: ${res?.reason || 'Access denied'}`, 'error');
      }
    } catch (err) {
      showLoginCard();
      loginStatus.innerText = `Connection error: ${err.message}`;
    }
  }

  // 3. Login Button Click Handler
  btnLogin.addEventListener('click', async () => {
    const email = inputEmail.value.trim().toLowerCase();
    const license = inputLicense.value.trim().toUpperCase();

    if (!email || !license) {
      loginStatus.innerText = '⚠️ Please enter your email and license key.';
      return;
    }

    btnLogin.disabled = true;
    btnLogin.innerText = 'Verifying...';
    loginStatus.innerText = 'Connecting to TeleHire...';

    await verifyAndRenderSession(email, license);

    btnLogin.disabled = false;
    btnLogin.innerText = 'Verify & Activate Session';
  });

  // 4. Logout Button Click Handler
  btnLogout.addEventListener('click', async () => {
    await chrome.storage.local.remove(['userEmail', 'userLicense', 'userProfile', 'activeTask']);
    activeSessionUser = null;
    showLoginCard();
    appendLog('Logged out. Session cleared.');
  });

  // 5. Refresh Queue List
  async function refreshQueueList() {
    if (!activeSessionUser) return;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'FETCH_QUEUE_STATUS',
        email: activeSessionUser.email,
        license: activeSessionUser.license,
      });

      if (res && res.success) {
        queueCount.innerText = res.queuedCount || 0;
        renderQueueItems(res.tasks || []);
      }
    } catch (err) {
      console.error('Queue fetch error:', err);
    }
  }

  btnRefreshQueue.addEventListener('click', refreshQueueList);

  function renderQueueItems(tasks) {
    queueItemsContainer.innerHTML = '';
    const queued = tasks.filter(t => t.status === 'QUEUED' || t.status === 'OPENING' || t.status === 'FILLING');

    if (queued.length === 0) {
      queueItemsContainer.innerHTML = `
        <div class="th-empty-queue">
          No pending jobs in queue.<br>
          Search jobs in <a href="https://t.me/TeleHireJOB_bot" target="_blank" style="color: #38bdf8;">@TeleHireJOB_bot</a> and tap <b>[🚀 Queue for Extension]</b> to populate.
        </div>
      `;
      return;
    }

    queued.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = 'th-queue-item';
      item.innerHTML = `
        <div>
          <div class="th-queue-item-title">${i + 1}. ${t.title}</div>
          <div class="th-queue-item-company">${t.company} · ${t.platform || 'ATS'}</div>
        </div>
        <span class="th-badge ${t.status === 'QUEUED' ? 'th-badge-info' : 'th-badge-paid'}">${t.status}</span>
      `;
      queueItemsContainer.appendChild(item);
    });
  }

  // 6. Active Task Renderer
  function renderActiveTask(task) {
    activeCurrentTask = task;
    chrome.storage.local.set({ activeTask: task });

    if (!task) {
      jobTitle.innerText = 'No Active Job Selected';
      jobCompany.innerText = 'Direct Employer';
      jobPlatform.innerText = 'ATS Platform';
      jobStatusBadge.innerText = 'READY';
      jobStatusBadge.className = 'th-badge th-badge-neutral';
      jobProgressBar.style.width = '0%';
      jobStepText.innerText = 'Step: Idle';
      jobFieldsCount.innerText = 'Fields: 0 filled';
      jobReasonBox.style.display = 'none';
      btnMarkSubmitted.style.display = 'none';
      return;
    }

    jobTitle.innerText = task.title || 'Job Application';
    jobCompany.innerText = task.company || 'Employer';
    jobPlatform.innerText = task.platform || 'ATS';

    const statusMap = {
      QUEUED: { text: 'QUEUED', badge: 'th-badge-info', progress: '10%' },
      OPENING: { text: 'OPENING URL', badge: 'th-badge-info', progress: '25%' },
      DETECTED: { text: 'FORM DETECTED', badge: 'th-badge-info', progress: '40%' },
      FILLING: { text: 'FILLING FIELDS', badge: 'th-badge-paid', progress: '65%' },
      READY_FOR_MANUAL_SUBMIT: { text: 'READY FOR REVIEW', badge: 'th-badge-paid', progress: '100%' },
      SUBMITTED: { text: 'SUBMITTED', badge: 'th-badge-paid', progress: '100%' },
      MANUAL_REQUIRED: { text: 'MANUAL INPUT NEEDED', badge: 'th-badge-free', progress: '50%' },
      FAILED: { text: 'FAILED', badge: 'th-badge-free', progress: '0%' },
    };

    const conf = statusMap[task.status] || { text: task.status, badge: 'th-badge-neutral', progress: '50%' };
    jobStatusBadge.innerText = conf.text;
    jobStatusBadge.className = `th-badge ${conf.badge}`;
    jobProgressBar.style.width = conf.progress;

    jobStepText.innerText = `Step: ${task.step || 'Active'}`;
    jobFieldsCount.innerText = `Fields: ${task.fieldsFilled || 0} filled`;

    if (task.status === 'READY_FOR_MANUAL_SUBMIT') {
      jobReasonBox.style.display = 'block';
      jobReasonBox.innerHTML = `
        🎯 <strong>Review Screen Reached:</strong> All steps filled safely.<br>
        ⚠️ <strong>Safety Rule:</strong> Please manually review your application on the page and click <em>Submit</em> yourself.
      `;
      btnMarkSubmitted.style.display = 'block';
    } else if (task.reason) {
      jobReasonBox.style.display = 'block';
      jobReasonBox.innerText = `⚠️ ${task.reason}`;
    } else {
      jobReasonBox.style.display = 'none';
      btnMarkSubmitted.style.display = 'none';
    }
  }

  // 7. Process Next Queued Job Button Handler
  btnProcessNext.addEventListener('click', async () => {
    if (!activeSessionUser) {
      appendLog('Please authenticate first.', 'error');
      return;
    }

    btnProcessNext.disabled = true;
    btnProcessNext.innerText = 'Claiming Next Job...';
    appendLog('Requesting next queued task from backend...');

    const res = await chrome.runtime.sendMessage({
      type: 'START_QUEUE_RUNNER',
      email: activeSessionUser.email,
      license: activeSessionUser.license,
    });

    btnProcessNext.disabled = false;
    btnProcessNext.innerText = '🚀 Open & Process Next Queued Job';

    if (res && res.success && res.task) {
      renderActiveTask(res.task);
      appendLog(`Opened tab for: ${res.task.title} @ ${res.task.company}`);
      await refreshQueueList();
    } else {
      appendLog('No pending jobs in queue. Add jobs via @TeleHireJOB_bot.', 'warning');
    }
  });

  // 8. Fill Active Tab Application Button Handler
  btnFillCurrent.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      appendLog(`Triggered safe autofill on active tab (#${tab.id})`);
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FILL' }, (res) => {
        if (res && res.diagnostics) {
          appendLog(`Form fill complete. Status: ${res.diagnostics.status}`);
        }
      });
    }
  });

  // 9. Mark Submitted & Process Next Button Handler
  btnMarkSubmitted.addEventListener('click', async () => {
    if (!activeCurrentTask) return;
    appendLog(`Marked task ${activeCurrentTask.taskId} as complete.`);

    await chrome.runtime.sendMessage({
      type: 'UPDATE_TASK_STATUS',
      payload: {
        taskId: activeCurrentTask.taskId,
        status: 'SUBMITTED',
        reason: 'Candidate completed manual review and submission.',
      },
    });

    renderActiveTask(null);
    await refreshQueueList();

    // Automatically trigger next job in queue
    btnProcessNext.click();
  });

  // 10. Clear Log Button
  btnClearLog.addEventListener('click', () => {
    activityLog.innerHTML = '<div class="th-log-line"><span class="th-log-time">[Init]</span> Log cleared.</div>';
  });

  // 11. Listen for background & content script live updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'QUEUE_TASK_LIVE_UPDATE') {
      renderActiveTask(msg.task);
      appendLog(`[${msg.task.platform}] ${msg.task.status}: ${msg.task.step || ''}`);
      refreshQueueList();
    }
  });

  // Restore session on load and start auto-polling queue every 3 seconds
  await restoreSession();
  setInterval(() => {
    if (activeSessionUser) {
      refreshQueueList();
    }
  }, 3000);
});

