/**
 * TeleHire Safe Job Form Filler - Content Script
 * 99% Safe · Human-like typing · Manual Submit · Paid Users Only
 */

(function () {
  let isFilling = false;
  window.__whatshire_dismissed = false;

  // 1. Human-Like Typing Engine
  async function humanType(element, text) {
    if (!element || !text) return;
    element.focus();
    element.value = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const keyDelay = Math.floor(Math.random() * (190 - 80 + 1)) + 80;

      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      element.value += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

      await new Promise(r => setTimeout(r, keyDelay));
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  }

  function isVisible(el) {
    return el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) && window.getComputedStyle(el).visibility !== 'hidden';
  }

  // 2. Identify Job Application Fields
  function matchField(el) {
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const label = (el.closest('label, div, .fb-dash-form-element')?.innerText || '').toLowerCase();
    const combined = `${name} ${id} ${placeholder} ${aria} ${label}`;

    if (combined.includes('first name') || combined.includes('firstname') || name === 'fname') return 'firstName';
    if (combined.includes('last name') || combined.includes('lastname') || name === 'lname') return 'lastName';
    if (combined.includes('full name') || combined.includes('name') || name === 'name') return 'fullName';
    if (combined.includes('email') || el.type === 'email') return 'email';
    if (combined.includes('phone') || combined.includes('mobile') || combined.includes('contact') || el.type === 'tel') return 'phone';
    if (combined.includes('city') || combined.includes('location') || combined.includes('address')) return 'location';
    if (combined.includes('linkedin')) return 'linkedin';
    if (combined.includes('github') || combined.includes('portfolio') || combined.includes('website')) return 'github';
    if (combined.includes('notice') || combined.includes('how soon')) return 'notice';
    if (combined.includes('salary') || combined.includes('ctc') || combined.includes('compensation') || combined.includes('expectation')) return 'salary';
    if (combined.includes('experience') || combined.includes('years of')) return 'experience';
    if (combined.includes('skills') || combined.includes('summary')) return 'skills';

    return null;
  }

  // 3. Main Safe Filling Engine
  async function fillFormSafely() {
    if (isFilling) return;
    isFilling = true;

    // A. Check Email & License in Storage
    const storage = await new Promise(r => chrome.storage.local.get(['userEmail', 'userLicense'], r));
    const email = storage.userEmail;
    const license = storage.userLicense || '';

    if (!email) {
      showNotification('⚠️ Please click the TeleHire extension icon and enter your Telegram email & license key to sync profile first.', 'warning');
      isFilling = false;
      return;
    }

    // B. Check Subscription via Background
    const subCheck = await chrome.runtime.sendMessage({ type: 'CHECK_SUBSCRIPTION', email, license });
    if (!subCheck.allowed) {
      showNotification(`🔒 ${subCheck.reason || subCheck.message || 'Paid subscription required.'}`, 'error');
      isFilling = false;
      return;
    }

    // C. Check Daily Limit 40
    const usage = await chrome.runtime.sendMessage({ type: 'GET_DAILY_USAGE' });
    if (usage.count >= 40) {
      showNotification(`⚠️ Daily safety limit reached (${usage.count}/40). LinkedIn/portals may flag if you apply too fast. Come back tomorrow to protect your account.`, 'warning');
      isFilling = false;
      return;
    }

    // D. Fetch Profile
    const profRes = await chrome.runtime.sendMessage({ type: 'GET_PROFILE', email });
    if (!profRes.success || !profRes.profile) {
      showNotification('❌ Could not load profile details. Please re-sync in extension popup.', 'error');
      isFilling = false;
      return;
    }

    const p = profRes.profile;
    showNotification('⚡ Filling form with human-like typing... Please do not touch keyboard.', 'info');

    // E. Find inputs & textareas
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select'));
    let filledCount = 0;

    for (const input of inputs) {
      if (!isVisible(input) || input.disabled || input.readOnly) continue;

      const fieldType = matchField(input);
      if (!fieldType) continue;

      let valueToType = '';
      if (fieldType === 'firstName') valueToType = p.firstName || p.name.split(' ')[0];
      else if (fieldType === 'lastName') valueToType = p.lastName || p.name.split(' ').slice(1).join(' ') || p.firstName;
      else if (fieldType === 'fullName') valueToType = p.name;
      else if (fieldType === 'email') valueToType = p.email;
      else if (fieldType === 'phone') valueToType = p.phone;
      else if (fieldType === 'location') valueToType = p.current_location;
      else if (fieldType === 'linkedin') valueToType = p.linkedin;
      else if (fieldType === 'github') valueToType = p.github;
      else if (fieldType === 'notice') valueToType = p.notice_period;
      else if (fieldType === 'salary') valueToType = p.expected_ctc;
      else if (fieldType === 'experience') valueToType = `${p.experience_years} years`;
      else if (fieldType === 'skills') valueToType = p.skillsString || 'Software Development';

      if (valueToType && input.value !== valueToType) {
        if (input.tagName.toLowerCase() === 'select') {
          input.value = input.options[1]?.value || input.options[0]?.value;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          await humanType(input, valueToType);
        }

        filledCount++;
        // Random human delay between fields (200-500ms)
        const fieldDelay = Math.floor(Math.random() * (500 - 200 + 1)) + 200;
        await new Promise(r => setTimeout(r, fieldDelay));
      }
    }

    // F. Deduct Quota via Background
    const useRes = await chrome.runtime.sendMessage({
      type: 'USE_QUOTA',
      payload: {
        email,
        license,
        platform: window.location.hostname.replace('www.', ''),
        jobTitle: document.title.split('|')[0].split('-')[0].trim() || 'Job Application',
        company: window.location.hostname,
        jobUrl: window.location.href,
      },
    });

    const newDaily = useRes.todayCount || (usage.count + 1);
    const newQuota = useRes.quotaLeft !== undefined ? useRes.quotaLeft : (subCheck.quotaLeft - 1);

    // G. Safety Success Alert
    showSuccessModal(filledCount, newDaily, newQuota);
    isFilling = false;
  }

  // 4. Injected Top Banner UI (Pinned & Persistent)
  function injectTopBanner() {
    if (window.__whatshire_dismissed) return;
    if (document.getElementById('whatshire-floating-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'whatshire-floating-banner';
    banner.innerHTML = `
      <div class="wh-banner-content">
        <div class="wh-banner-left">
          <span class="wh-logo-badge">⚡ TeleHire</span>
          <span class="wh-banner-text">Safe Form Filler detected. Fill form with your verified profile?</span>
        </div>
        <div class="wh-banner-actions">
          <button id="wh-btn-fill" class="wh-btn-primary">⚡ Fill Form Safely</button>
          <button id="wh-btn-close" class="wh-btn-ghost" title="Dismiss">✕</button>
        </div>
      </div>
    `;

    // Append directly to body / documentElement outside SPA container
    (document.body || document.documentElement).appendChild(banner);

    document.getElementById('wh-btn-fill')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fillFormSafely();
    });

    document.getElementById('wh-btn-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.__whatshire_dismissed = true;
      banner.remove();
    });
  }

  // 5. Toast Notification
  function showNotification(text, type = 'info') {
    let toast = document.getElementById('whatshire-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'whatshire-toast';
      (document.body || document.documentElement).appendChild(toast);
    }

    toast.className = `wh-toast wh-toast-${type}`;
    toast.innerText = text;
    toast.style.display = 'block';

    setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 6000);
  }

  // 6. Success & Manual Submit Reminder Modal
  function showSuccessModal(filledCount, todayCount, quotaLeft) {
    let modal = document.getElementById('whatshire-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'whatshire-modal';
    modal.innerHTML = `
      <div class="wh-modal-overlay">
        <div class="wh-modal-card">
          <div class="wh-modal-header">
            <span class="wh-icon-check">✅</span>
            <h3>Form Filled Safely!</h3>
          </div>
          <p class="wh-modal-body">
            <strong>${filledCount} fields</strong> filled with human-like typing.<br><br>
            ⚠️ <strong>Safety Rule:</strong> Please manually review all fields, select your resume file, and click <em>Submit / Continue</em> yourself.<br><br>
            <span class="wh-badge-safety">🛡️ Manual Submit protects your account (<1% ban risk)</span>
          </p>
          <div class="wh-modal-footer">
            <div class="wh-modal-stats">
              <span>Today: <strong>${todayCount} / 40</strong> fills</span>
              <span>Quota left: <strong>${quotaLeft}</strong></span>
            </div>
            <button id="wh-modal-ok" class="wh-btn-primary">Got it, I will click Submit</button>
          </div>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(modal);

    document.getElementById('wh-modal-ok')?.addEventListener('click', () => {
      modal.remove();
    });
  }

  // Listen for manual trigger from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'TRIGGER_FILL') {
      fillFormSafely().then(() => sendResponse({ success: true }));
      return true;
    }
  });

  // Persistent Injection: Check periodically and observe DOM changes
  setTimeout(injectTopBanner, 1000);

  setInterval(() => {
    if (!window.__whatshire_dismissed && !document.getElementById('whatshire-floating-banner')) {
      injectTopBanner();
    }
  }, 1500);

  const observer = new MutationObserver(() => {
    if (!window.__whatshire_dismissed && !document.getElementById('whatshire-floating-banner')) {
      injectTopBanner();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true });
  }
})();
