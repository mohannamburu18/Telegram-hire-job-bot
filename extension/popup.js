/**
 * WhatsHire Safe Filler - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const emailInput = document.getElementById('user-email');
  const licenseInput = document.getElementById('user-license');
  const syncBtn = document.getElementById('btn-sync');
  const syncStatus = document.getElementById('sync-status');
  const subCard = document.getElementById('sub-status-card');
  const fillBtn = document.getElementById('btn-trigger-fill');

  // 1. Load saved credentials from local storage
  chrome.storage.local.get(['userEmail', 'userLicense'], async (data) => {
    if (data.userEmail) {
      emailInput.value = data.userEmail;
      if (data.userLicense) licenseInput.value = data.userLicense;
      await verifySubscription(data.userEmail, data.userLicense || '');
    }
  });

  // 2. Sync Button Handler
  syncBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim().toLowerCase();
    const license = licenseInput.value.trim().toUpperCase();

    if (!email) {
      syncStatus.innerText = '⚠️ Please enter your Telegram registered email.';
      syncStatus.style.color = '#f87171';
      return;
    }

    syncBtn.disabled = true;
    syncBtn.innerText = 'Checking...';
    syncStatus.innerText = 'Verifying paid subscription...';
    syncStatus.style.color = '#94a3b8';

    await verifySubscription(email, license);

    syncBtn.disabled = false;
    syncBtn.innerText = 'Verify & Sync Profile';
  });

  // 3. Trigger Fill on Current Page Tab
  fillBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FILL' }, () => {
        window.close();
      });
    }
  });

  // 4. Verify Subscription Helper
  async function verifySubscription(email, license) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_SUBSCRIPTION', email, license });
      const usage = await chrome.runtime.sendMessage({ type: 'GET_DAILY_USAGE' });

      subCard.style.display = 'flex';

      if (res.allowed) {
        syncStatus.innerText = `✅ Verified Account: ${res.userName || email}`;
        syncStatus.style.color = '#4ade80';
        fillBtn.disabled = false;

        chrome.storage.local.set({ userEmail: email, userLicense: license });

        subCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="wh-badge-paid">⭐ Verified Paid (${res.plan})</span>
            <span style="font-size: 11px; color: #94a3b8;">Exp: ${res.expiry || 'Active'}</span>
          </div>
          <div class="wh-grid-stats">
            <div class="wh-stat-item">
              <span class="label">Quota Remaining</span>
              <span class="val" style="color: #38bdf8;">${res.quotaLeft} applies</span>
            </div>
            <div class="wh-stat-item">
              <span class="label">Today's Safety Fills</span>
              <span class="val" style="color: #fbbf24;">${usage.count} / 40</span>
            </div>
          </div>
        `;
      } else {
        syncStatus.innerText = '🔒 Paid subscriber status not verified';
        syncStatus.style.color = '#f87171';
        fillBtn.disabled = true;

        subCard.innerHTML = `
          <span class="wh-badge-free">🔒 ${res.plan || 'Free User / Expired'}</span>
          <p style="font-size: 11px; color: #cbd5e1; line-height: 1.4; margin-top: 4px;">
            ${res.message || 'This extension is exclusive to WhatsHire Paid Subscribers.'}
          </p>
          <a href="https://t.me/TeleHireJOB_bot" target="_blank" style="display: block; background: #2563eb; color: #fff; text-align: center; padding: 7px; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 11px; margin-top: 6px;">
            💎 Buy Paid Plan in Telegram Bot
          </a>
        `;
      }
    } catch (err) {
      syncStatus.innerText = '❌ Error connecting to server.';
      syncStatus.style.color = '#f87171';
      fillBtn.disabled = true;
    }
  }
});
