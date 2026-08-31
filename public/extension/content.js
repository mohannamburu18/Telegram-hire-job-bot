/**
 * TeleHire Safe Job Form Filler - Core Autofill Engine (Phase 2 Repaired)
 * 99% Safe · React/Angular Native Setters · Combobox · Radios · Selects · Verification
 */

(function () {
  let isFilling = false;
  window.__telehire_dismissed = false;
  const filledSignatures = new Set();

  // Diagnostics state
  window.__telehire_diagnostics = {
    platform: window.location.hostname.replace('www.', ''),
    timestamp: new Date().toISOString(),
    fieldsDetected: 0,
    fieldsFilled: 0,
    fieldsSkipped: 0,
    fieldsFailed: 0,
    fields: [],
  };

  function logDiag(type, fieldName, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      fieldName,
      ...details,
    };
    window.__telehire_diagnostics.fields.push(entry);
    console.log(`%c[TeleHire] [${type.toUpperCase()}] ${fieldName}:`, 'color: #0284c7; font-weight: bold;', details);
  }

  // 1. Text Normalization Utility
  function normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // 2. React Native Value Setter (Bypasses React _valueTracker bug)
  function setNativeValue(element, value) {
    if (!element || !element.isConnected) return;
    try {
      const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : (element instanceof HTMLSelectElement
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype);

      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }

      // Update React value tracker if present
      if (element._valueTracker) {
        element._valueTracker.setValue(value);
      }

      // Dispatch comprehensive synthetic events
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } catch (err) {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
  }

  // 3. Human-Like Keystroke Simulator (React-Compatible)
  async function humanType(element, text) {
    if (!element || !element.isConnected || text === undefined || text === null) return false;
    element.focus();
    setNativeValue(element, '');
    await new Promise(r => setTimeout(r, 40));

    let accumulated = '';
    const str = String(text);
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      accumulated += char;
      const keyDelay = Math.floor(Math.random() * (50 - 20 + 1)) + 20;

      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, composed: true }));
      setNativeValue(element, accumulated);
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, composed: true }));

      await new Promise(r => setTimeout(r, keyDelay));
    }

    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.blur();
    return true;
  }

  // 4. Safe Label Extractor
  function getFieldLabel(el) {
    if (!el) return '';
    let labelText = '';

    // A. aria-labelledby
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const labelEl = document.getElementById(labelledby);
      if (labelEl && labelEl.innerText.trim()) labelText += ' ' + labelEl.innerText.trim();
    }

    // B. Explicit <label for="...">
    if (el.id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelFor && labelFor.innerText.trim()) labelText += ' ' + labelFor.innerText.trim();
    }

    // C. Wrapping <label>
    const wrappingLabel = el.closest('label');
    if (wrappingLabel && wrappingLabel.innerText.trim()) {
      labelText += ' ' + wrappingLabel.innerText.trim();
    }

    // D. Container Question (LinkedIn Easy Apply form item, fieldset, legend)
    const container = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section, fieldset, .form-group, .t-14, .artdeco-text-input--container');
    if (container) {
      const legend = container.querySelector('legend, label, .fb-dash-form-element__label, h3, span[aria-hidden="true"]');
      if (legend && legend.innerText.trim()) {
        labelText += ' ' + legend.innerText.trim();
      }
    }

    // E. Attributes
    const ariaLabel = el.getAttribute('aria-label') || '';
    const placeholder = el.placeholder || '';
    const name = el.name || '';
    const id = el.id || '';

    const combined = `${labelText} ${ariaLabel} ${placeholder} ${name} ${id}`;
    return normalizeText(combined);
  }

  // 5. Strict Profile Mapper
  function mapFieldToProfile(labelText, el, profile) {
    const norm = normalizeText(labelText);
    const type = (el.type || '').toLowerCase();

    // 1. First Name
    if (
      (norm.includes('first name') || norm.includes('firstname') || norm.includes('given name') || norm.includes('forename') || el.name === 'fname' || el.name === 'firstName') &&
      !norm.includes('last name')
    ) {
      return { key: 'firstName', value: profile.firstName || (profile.name || '').split(' ')[0] };
    }

    // 2. Last Name
    if (
      norm.includes('last name') || norm.includes('lastname') || norm.includes('surname') || norm.includes('family name') || el.name === 'lname' || el.name === 'lastName'
    ) {
      return { key: 'lastName', value: profile.lastName || (profile.name || '').split(' ').slice(1).join(' ') || profile.firstName };
    }

    // 3. Full Name
    if (
      norm.includes('full name') || (norm.includes('name') && !norm.includes('company') && !norm.includes('first') && !norm.includes('last') && !norm.includes('user') && !norm.includes('file'))
    ) {
      return { key: 'name', value: profile.name };
    }

    // 4. Email
    if (type === 'email' || norm.includes('email') || norm.includes('e mail')) {
      return { key: 'email', value: profile.email };
    }

    // 5. Phone / Mobile
    if (type === 'tel' || norm.includes('phone') || norm.includes('mobile') || norm.includes('contact number') || norm.includes('telephone')) {
      return { key: 'phone', value: profile.phone };
    }

    // 6. City / Location / Address
    if (
      norm.includes('city') || norm.includes('current location') || norm.includes('current city') || norm.includes('location') || norm.includes('address') || norm.includes('where are you based')
    ) {
      return { key: 'location', value: profile.current_location || profile.location || 'Bangalore, India' };
    }

    // 7. LinkedIn
    if (norm.includes('linkedin') || norm.includes('linked in')) {
      return { key: 'linkedin', value: profile.linkedin || 'https://linkedin.com' };
    }

    // 8. GitHub / Portfolio / Website
    if (norm.includes('github') || norm.includes('git hub') || norm.includes('portfolio') || norm.includes('website') || norm.includes('personal url')) {
      return { key: 'github', value: profile.github || profile.linkedin || '' };
    }

    // 9. Notice Period / Availability
    if (norm.includes('notice') || norm.includes('how soon') || norm.includes('availability') || norm.includes('start date') || norm.includes('joining period')) {
      return { key: 'notice', value: profile.notice_period || 'Immediate / 15 Days' };
    }

    // 10. Expected CTC / Salary
    if (norm.includes('expected salary') || norm.includes('expected ctc') || norm.includes('ctc') || norm.includes('salary expectation') || norm.includes('compensation expectation')) {
      return { key: 'salary', value: profile.expected_ctc || profile.expected_salary || 'As per industry standards' };
    }

    // 11. Years of Experience
    if (norm.includes('years of experience') || norm.includes('total experience') || norm.includes('how many years') || norm.includes('experience in years')) {
      return { key: 'experience', value: `${profile.experience_years || '0-1'}` };
    }

    // 12. Skills / Summary / Cover Letter
    if (norm.includes('skills') || norm.includes('technical skills') || norm.includes('summary') || norm.includes('cover letter') || norm.includes('additional information')) {
      return { key: 'skills', value: profile.skillsString || (profile.skills || []).join(', ') || 'Software Engineering, Web Development' };
    }

    // 13. Education / University / Degree
    if (norm.includes('education') || norm.includes('university') || norm.includes('college') || norm.includes('degree') || norm.includes('highest qualification')) {
      return { key: 'education', value: profile.education || 'Bachelor of Technology' };
    }

    // 14. Work Authorization (India / Global)
    if (norm.includes('authorized to work') || norm.includes('legally authorized') || norm.includes('eligible to work') || norm.includes('right to work')) {
      return { key: 'work_authorization', value: 'Yes' };
    }

    // 15. Visa Sponsorship Requirement
    if (norm.includes('sponsorship') || norm.includes('require visa') || norm.includes('visa sponsorship') || norm.includes('will you require visa')) {
      return { key: 'visa_sponsorship', value: 'No' };
    }

    // 16. Relocation
    if (norm.includes('relocate') || norm.includes('willing to relocate')) {
      return { key: 'relocate', value: 'Yes' };
    }

    // 17. Degree completion / 18+ years of age
    if (norm.includes('18 years of age') || norm.includes('completed degree') || norm.includes('background check')) {
      return { key: 'general_yes', value: 'Yes' };
    }

    return null;
  }

  // 6. Post-Fill Verification Helper
  function verifyField(el, expectedValue, fieldType) {
    if (!el || !el.isConnected) return false;

    if (fieldType === 'radio') {
      return el.checked === true;
    }

    if (fieldType === 'checkbox') {
      return el.checked === true;
    }

    if (fieldType === 'select') {
      const currentVal = el.value;
      const selectedOption = el.options[el.selectedIndex]?.text || '';
      return Boolean(currentVal && selectedOption);
    }

    // Text / Textarea / Combobox
    const actualVal = (el.value || '').trim();
    if (!actualVal) return false;

    const normActual = normalizeText(actualVal);
    const normExpected = normalizeText(String(expectedValue));

    return normActual.length > 0 && (normActual.includes(normExpected) || normExpected.includes(normActual));
  }

  // 7. Native Select Handler (Normalized Profile Matching)
  async function fillSelectField(selectEl, labelText, profile) {
    if (!selectEl || !selectEl.options || selectEl.options.length === 0) return false;
    const mapping = mapFieldToProfile(labelText, selectEl, profile);
    if (!mapping || !mapping.value) return false;

    const expectedNorm = normalizeText(String(mapping.value));
    let bestMatchIdx = -1;

    for (let i = 0; i < selectEl.options.length; i++) {
      const opt = selectEl.options[i];
      const optText = normalizeText(opt.text || '');
      const optVal = normalizeText(opt.value || '');

      // Exact or strong prefix match
      if (optText === expectedNorm || optVal === expectedNorm || optText.startsWith(expectedNorm) || expectedNorm.startsWith(optText)) {
        bestMatchIdx = i;
        break;
      }

      // Handle Yes/No select options
      if ((expectedNorm === 'yes' && (optText === 'yes' || optVal === 'yes' || optVal === '1' || optVal === 'true')) ||
          (expectedNorm === 'no' && (optText === 'no' || optVal === 'no' || optVal === '0' || optVal === 'false'))) {
        bestMatchIdx = i;
        break;
      }
    }

    // Fallback for country code selector (India +91)
    if (bestMatchIdx === -1 && (labelText.includes('country code') || labelText.includes('phone'))) {
      for (let i = 0; i < selectEl.options.length; i++) {
        const optText = normalizeText(selectEl.options[i].text || '');
        if (optText.includes('india') || optText.includes('91')) {
          bestMatchIdx = i;
          break;
        }
      }
    }

    if (bestMatchIdx !== -1) {
      selectEl.selectedIndex = bestMatchIdx;
      setNativeValue(selectEl, selectEl.options[bestMatchIdx].value);
      selectEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      await new Promise(r => setTimeout(r, 60));
      return verifyField(selectEl, selectEl.options[bestMatchIdx].value, 'select');
    }

    return false;
  }

  // 8. Custom Combobox & Typeahead Handler (LinkedIn City / Location / Education)
  async function fillComboboxField(inputEl, labelText, profile) {
    if (!inputEl || !inputEl.isConnected) return false;
    const mapping = mapFieldToProfile(labelText, inputEl, profile);
    if (!mapping || !mapping.value) return false;

    const targetText = String(mapping.value);
    await humanType(inputEl, targetText);
    await new Promise(r => setTimeout(r, 350)); // Wait for typeahead options to render

    // Detect dropdown listbox
    const container = inputEl.closest('.fb-dash-form-element, .jobs-easy-apply-form-section, div') || document.body;
    const optionSelectors = [
      '[role="listbox"] [role="option"]',
      '.artdeco-typeahead__result',
      'li.typeahead-result',
      'div[role="option"]',
      '.artdeco-typeahead__results-list li',
    ];

    let optionElements = [];
    for (const sel of optionSelectors) {
      const found = Array.from(document.querySelectorAll(sel)).filter(isVisible);
      if (found.length > 0) {
        optionElements = found;
        break;
      }
    }

    if (optionElements.length > 0) {
      const expectedNorm = normalizeText(targetText);
      let matchedOpt = null;

      for (const opt of optionElements) {
        const optNorm = normalizeText(opt.innerText || '');
        if (optNorm.includes(expectedNorm) || expectedNorm.includes(optNorm)) {
          matchedOpt = opt;
          break;
        }
      }

      if (!matchedOpt) matchedOpt = optionElements[0]; // Best effort top option
      if (matchedOpt) {
        matchedOpt.click();
        matchedOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        matchedOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return verifyField(inputEl, targetText, 'combobox');
  }

  // 9. Radio Button Group Handler (Yes/No & Work Authorization)
  async function fillRadioGroup(radioInputs, labelText, profile) {
    if (!radioInputs || radioInputs.length === 0) return false;
    const mapping = mapFieldToProfile(labelText, radioInputs[0], profile);
    if (!mapping || !mapping.value) return false;

    const expectedNorm = normalizeText(String(mapping.value));

    for (const radio of radioInputs) {
      if (!isVisible(radio)) continue;
      const radioLabel = normalizeText(getFieldLabel(radio));
      const radioVal = normalizeText(radio.value || '');

      let isMatch = false;
      if (expectedNorm === 'yes' && (radioLabel.includes('yes') || radioVal === 'yes' || radioVal === '1' || radioVal === 'true')) {
        isMatch = true;
      } else if (expectedNorm === 'no' && (radioLabel.includes('no') || radioVal === 'no' || radioVal === '0' || radioVal === 'false')) {
        isMatch = true;
      } else if (radioLabel.includes(expectedNorm) || expectedNorm.includes(radioLabel)) {
        isMatch = true;
      }

      if (isMatch) {
        radio.focus();
        radio.checked = true;
        radio.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        radio.click();
        await new Promise(r => setTimeout(r, 50));
        return verifyField(radio, true, 'radio');
      }
    }

    return false;
  }

  // 10. Checkbox Handler (Terms & Consent)
  async function fillCheckbox(checkboxEl, labelText) {
    if (!checkboxEl || !isVisible(checkboxEl)) return false;
    const norm = normalizeText(labelText);

    // Only agree to explicit application consent / terms
    if (
      norm.includes('agree') || norm.includes('consent') || norm.includes('terms') || norm.includes('privacy') || norm.includes('certify') || norm.includes('acknowledge')
    ) {
      if (!checkboxEl.checked) {
        checkboxEl.checked = true;
        checkboxEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        checkboxEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        checkboxEl.click();
        await new Promise(r => setTimeout(r, 50));
      }
      return verifyField(checkboxEl, true, 'checkbox');
    }

    return false;
  }

  // 11. Central Single-Step Form Filling Engine
  async function fillFormSafely() {
    if (isFilling) return;
    isFilling = true;

    // Reset diagnostics
    window.__telehire_diagnostics = {
      platform: window.location.hostname.replace('www.', ''),
      timestamp: new Date().toISOString(),
      fieldsDetected: 0,
      fieldsFilled: 0,
      fieldsSkipped: 0,
      fieldsFailed: 0,
      fields: [],
    };

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
      showNotification(`⚠️ Daily safety limit reached (${usage.count}/40). Come back tomorrow to protect your account.`, 'warning');
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
    showNotification('⚡ Filling form with verified candidate profile...', 'info');

    // E. Detect Active Form Container (Modal or Page Form)
    const activeContainer = document.querySelector('.jobs-easy-apply-modal, [data-easy-apply-modal], form, .application-form, [role="dialog"]') || document.body;

    // Scan all visible interactive elements
    const elements = Array.from(activeContainer.querySelectorAll('input, textarea, select, [role="combobox"]')).filter(isVisible);
    window.__telehire_diagnostics.fieldsDetected = elements.length;

    let filledCount = 0;
    const handledRadios = new Set();

    for (const el of elements) {
      if (!el.isConnected || el.disabled || el.readOnly) continue;

      const type = (el.type || el.getAttribute('role') || el.tagName).toLowerCase();
      const labelText = getFieldLabel(el);
      const signature = `${type}_${el.name || el.id || labelText}`;

      // Duplicate fill protection: skip if already successfully populated
      if (filledSignatures.has(signature) && el.value) {
        continue;
      }

      // 1. Radio Button Handling
      if (type === 'radio') {
        const groupName = el.name || signature;
        if (handledRadios.has(groupName)) continue;
        handledRadios.add(groupName);

        const groupRadios = Array.from(activeContainer.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)).filter(isVisible);
        const success = await fillRadioGroup(groupRadios.length > 0 ? groupRadios : [el], labelText, p);
        if (success) {
          filledCount++;
          filledSignatures.add(signature);
          logDiag('success', labelText, { type: 'radio', value: 'Selected' });
        } else {
          logDiag('skipped', labelText, { type: 'radio', reason: 'No trusted radio option matched' });
        }
        continue;
      }

      // 2. Checkbox Handling
      if (type === 'checkbox') {
        const success = await fillCheckbox(el, labelText);
        if (success) {
          filledCount++;
          filledSignatures.add(signature);
          logDiag('success', labelText, { type: 'checkbox', value: el.checked });
        } else {
          logDiag('skipped', labelText, { type: 'checkbox', reason: 'Non-mandatory / optional checkbox' });
        }
        continue;
      }

      // 3. Native Select Handling
      if (el.tagName.toLowerCase() === 'select') {
        const success = await fillSelectField(el, labelText, p);
        if (success) {
          filledCount++;
          filledSignatures.add(signature);
          logDiag('success', labelText, { type: 'select', value: el.value });
        } else {
          logDiag('skipped', labelText, { type: 'select', reason: 'No matching option found' });
        }
        continue;
      }

      // 4. Custom Combobox / ARIA Typeahead
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') {
        const success = await fillComboboxField(el, labelText, p);
        if (success) {
          filledCount++;
          filledSignatures.add(signature);
          logDiag('success', labelText, { type: 'combobox', value: el.value });
        } else {
          logDiag('failed', labelText, { type: 'combobox', reason: 'Combobox option verification failed' });
        }
        continue;
      }

      // 5. Standard Text / Email / Phone / Textarea
      const mapping = mapFieldToProfile(labelText, el, p);
      if (!mapping || !mapping.value) {
        logDiag('skipped', labelText, { type: 'text', reason: 'No profile value available' });
        continue;
      }

      // Smart Retry (Max 2 Attempts)
      let verified = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        await humanType(el, mapping.value);
        verified = verifyField(el, mapping.value, 'text');
        if (verified) break;
        await new Promise(r => setTimeout(r, 100));
      }

      if (verified) {
        filledCount++;
        filledSignatures.add(signature);
        logDiag('success', labelText, { type: 'text', mapped: mapping.key, value: mapping.value });
      } else {
        logDiag('failed', labelText, { type: 'text', mapped: mapping.key, reason: 'Value did not persist in DOM' });
      }

      // Human delay between fields (150-300ms)
      const fieldDelay = Math.floor(Math.random() * (300 - 150 + 1)) + 150;
      await new Promise(r => setTimeout(r, fieldDelay));
    }

    // F. Update Diagnostics Summary
    window.__telehire_diagnostics.fieldsFilled = filledCount;
    window.__telehire_diagnostics.fieldsFailed = window.__telehire_diagnostics.fields.filter(f => f.type === 'failed').length;
    window.__telehire_diagnostics.fieldsSkipped = window.__telehire_diagnostics.fields.filter(f => f.type === 'skipped').length;

    console.log('[TeleHire Autofill Completed]', window.__telehire_diagnostics);

    // G. Deduct Quota via Background (Only if fields were actually filled)
    if (filledCount > 0) {
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
      showSuccessModal(filledCount, newDaily, newQuota);
    } else {
      showNotification('ℹ️ No unfilled supported fields detected on the current step.', 'info');
    }

    isFilling = false;
  }

  // 12. Persistent Top Banner UI
  function injectTopBanner() {
    if (window.__telehire_dismissed) return;
    if (document.getElementById('whatshire-safe-bar')) return;

    const banner = document.createElement('div');
    banner.id = 'whatshire-safe-bar';
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

    const root = document.documentElement || document.body;
    if (root) {
      root.insertBefore(banner, root.firstChild);
    }

    document.getElementById('wh-btn-fill')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fillFormSafely();
    });

    document.getElementById('wh-btn-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.__telehire_dismissed = true;
      banner.remove();
    });
  }

  // 13. Toast Notification
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

  // 14. Success & Manual Submit Reminder Modal
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
            <h3>Form Step Filled Safely!</h3>
          </div>
          <p class="wh-modal-body">
            <strong>${filledCount} fields</strong> filled with React-compatible typing & verification.<br><br>
            ⚠️ <strong>Safety Rule:</strong> Please manually review all fields, check your resume file, and click <em>Next / Submit</em> yourself.<br><br>
            <span class="wh-badge-safety">🛡️ Manual Submit protects your account (&lt;1% ban risk)</span>
          </p>
          <div class="wh-modal-footer">
            <div class="wh-modal-stats">
              <span>Today: <strong>${todayCount} / 40</strong> fills</span>
              <span>Quota left: <strong>${quotaLeft}</strong></span>
            </div>
            <button id="wh-modal-ok" class="wh-btn-primary">Got it, I will review & continue</button>
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
      fillFormSafely().then(() => sendResponse({ success: true, diagnostics: window.__telehire_diagnostics }));
      return true;
    }
  });

  // Persistent Banner Injection
  setTimeout(injectTopBanner, 1000);

  setInterval(() => {
    if (!window.__telehire_dismissed && !document.getElementById('whatshire-safe-bar')) {
      injectTopBanner();
    }
  }, 3000);

  // Debounced MutationObserver (600ms)
  let mutationTimeout = null;
  const observer = new MutationObserver(() => {
    if (mutationTimeout) clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
      if (!window.__telehire_dismissed && !document.getElementById('whatshire-safe-bar')) {
        injectTopBanner();
      }
    }, 600);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
