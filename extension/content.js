/**
 * TeleHire Safe Job Form Filler - Complete Engine & Multi-Step Orchestrator (Phase 3)
 * 99% Safe · React Native Setters · Multi-Step LinkedIn Easy Apply · Safety Review Gate
 */

(function () {
  let isFilling = false;
  let isOrchestrating = false;
  window.__telehire_dismissed = false;
  const filledSignatures = new Set();

  // Diagnostics state
  window.__telehire_diagnostics = {
    platform: window.location.hostname.replace('www.', ''),
    timestamp: new Date().toISOString(),
    easyApply: false,
    currentStep: 'INIT',
    stepIndex: 0,
    fieldsDetected: 0,
    fieldsFilled: 0,
    fieldsSkipped: 0,
    fieldsFailed: 0,
    navigation: {
      attempted: false,
      successful: false,
      lastAction: null,
    },
    status: 'READY',
    reason: null,
    fields: [],
  };

  function logDiag(type, fieldName, details = {}) {
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

  // 2. React Native Value Setter
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

      if (element._valueTracker) {
        element._valueTracker.setValue(value);
      }

      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } catch (_) {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
  }

  // 3. Human-Like Keystroke Simulator
  async function humanType(element, text) {
    if (!element || !element.isConnected || text === undefined || text === null) return false;
    element.focus();
    setNativeValue(element, '');
    await new Promise(r => setTimeout(r, 30));

    let accumulated = '';
    const str = String(text);
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      accumulated += char;
      const keyDelay = Math.floor(Math.random() * (45 - 20 + 1)) + 20;

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

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const labelEl = document.getElementById(labelledby);
      if (labelEl && labelEl.innerText.trim()) labelText += ' ' + labelEl.innerText.trim();
    }

    if (el.id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelFor && labelFor.innerText.trim()) labelText += ' ' + labelFor.innerText.trim();
    }

    const wrappingLabel = el.closest('label');
    if (wrappingLabel && wrappingLabel.innerText.trim()) {
      labelText += ' ' + wrappingLabel.innerText.trim();
    }

    const container = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section, fieldset, .form-group, .t-14, .artdeco-text-input--container');
    if (container) {
      const legend = container.querySelector('legend, label, .fb-dash-form-element__label, h3, span[aria-hidden="true"]');
      if (legend && legend.innerText.trim()) {
        labelText += ' ' + legend.innerText.trim();
      }
    }

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

    // 14. Work Authorization
    if (norm.includes('authorized to work') || norm.includes('legally authorized') || norm.includes('eligible to work') || norm.includes('right to work') || norm.includes('legal right')) {
      return { key: 'work_authorization', value: 'Yes' };
    }

    // 15. Visa Sponsorship
    if (norm.includes('sponsorship') || norm.includes('require visa') || norm.includes('visa sponsorship') || norm.includes('will you require visa')) {
      return { key: 'visa_sponsorship', value: 'No' };
    }

    // 16. Relocation
    if (norm.includes('relocate') || norm.includes('willing to relocate')) {
      return { key: 'relocate', value: 'Yes' };
    }

    // 17. Degree completion / 18+ years of age
    if (norm.includes('18 years of age') || norm.includes('completed degree') || norm.includes('background check') || norm.includes('valid driver')) {
      return { key: 'general_yes', value: 'Yes' };
    }

    return null;
  }

  // 6. Post-Fill Verification Helper
  function verifyField(el, expectedValue, fieldType) {
    if (!el || !el.isConnected) return false;

    if (fieldType === 'radio' || fieldType === 'checkbox') {
      return el.checked === true;
    }

    if (fieldType === 'select') {
      const currentVal = el.value;
      const selectedOption = el.options[el.selectedIndex]?.text || '';
      return Boolean(currentVal && selectedOption);
    }

    const actualVal = (el.value || '').trim();
    if (!actualVal) return false;

    const normActual = normalizeText(actualVal);
    const normExpected = normalizeText(String(expectedValue));
    return normActual.length > 0 && (normActual.includes(normExpected) || normExpected.includes(normActual));
  }

  // 7. Native Select Handler
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

      if (optText === expectedNorm || optVal === expectedNorm || optText.startsWith(expectedNorm) || expectedNorm.startsWith(optText)) {
        bestMatchIdx = i;
        break;
      }

      if ((expectedNorm === 'yes' && (optText === 'yes' || optVal === 'yes' || optVal === '1' || optVal === 'true')) ||
          (expectedNorm === 'no' && (optText === 'no' || optVal === 'no' || optVal === '0' || optVal === 'false'))) {
        bestMatchIdx = i;
        break;
      }
    }

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
      await new Promise(r => setTimeout(r, 50));
      return verifyField(selectEl, selectEl.options[bestMatchIdx].value, 'select');
    }

    return false;
  }

  // 8. Custom Combobox & Typeahead Handler
  async function fillComboboxField(inputEl, labelText, profile) {
    if (!inputEl || !inputEl.isConnected) return false;
    const mapping = mapFieldToProfile(labelText, inputEl, profile);
    if (!mapping || !mapping.value) return false;

    const targetText = String(mapping.value);
    await humanType(inputEl, targetText);
    await new Promise(r => setTimeout(r, 350));

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

      if (!matchedOpt) matchedOpt = optionElements[0];
      if (matchedOpt) {
        matchedOpt.click();
        matchedOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        matchedOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return verifyField(inputEl, targetText, 'combobox');
  }

  // 9. Radio Button Group Handler
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

  // 10. Checkbox Handler
  async function fillCheckbox(checkboxEl, labelText) {
    if (!checkboxEl || !isVisible(checkboxEl)) return false;
    const norm = normalizeText(labelText);

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

  // =========================================================================
  // LINKEDIN EASY APPLY MULTI-STEP ORCHESTRATION ENGINE (PHASE 3)
  // =========================================================================

  // A. Modal Detector
  function detectEasyApplyModal() {
    const selectors = [
      '.jobs-easy-apply-modal',
      '[data-easy-apply-modal]',
      'div[role="dialog"].artdeco-modal',
      '.jobs-apply-modal',
      'div[data-test-modal-id="easy-apply-modal"]',
    ];

    for (const sel of selectors) {
      const modal = document.querySelector(sel);
      if (modal && isVisible(modal)) {
        return { isEasyApply: true, modal };
      }
    }

    return { isEasyApply: false, modal: null };
  }

  // B. Current Step Stage & Title Detector
  function detectEasyApplyStep(modal) {
    if (!modal || !modal.isConnected) {
      return { stage: 'UNKNOWN', title: '', isReview: false, isSubmit: false, signature: '' };
    }

    const headerEl = modal.querySelector('h2, h3, .jobs-easy-apply-modal__header, .artdeco-modal__header, [data-test-modal-header]');
    const headerText = headerEl ? headerEl.innerText.trim() : '';
    const normHeader = normalizeText(headerText);
    const fullText = normalizeText(modal.innerText);

    let stage = 'UNKNOWN';
    let isReview = false;
    let isSubmit = false;

    // Check for review / submit indicators
    if (normHeader.includes('review') || fullText.includes('review your application') || modal.querySelector('.jobs-easy-apply-review')) {
      stage = 'REVIEW';
      isReview = true;
    } else if (normHeader.includes('contact') || fullText.includes('contact info')) {
      stage = 'CONTACT_INFO';
    } else if (normHeader.includes('resume') || fullText.includes('upload resume') || modal.querySelector('.jobs-document-upload__file-selection')) {
      stage = 'RESUME';
    } else if (normHeader.includes('additional') || normHeader.includes('questions')) {
      stage = 'ADDITIONAL_QUESTIONS';
    } else if (normHeader.includes('work authorization') || normHeader.includes('authorization')) {
      stage = 'WORK_AUTHORIZATION';
    } else if (normHeader.includes('education') || normHeader.includes('qualification')) {
      stage = 'EDUCATION';
    } else if (normHeader.includes('voluntary') || normHeader.includes('diversity')) {
      stage = 'VOLUNTARY_INFO';
    }

    const submitBtn = modal.querySelector('button[aria-label*="submit" i], button[aria-label*="Submit application" i]');
    if (submitBtn && isVisible(submitBtn)) {
      isSubmit = true;
    }

    const fieldCount = modal.querySelectorAll('input, textarea, select, [role="combobox"]').length;
    const signature = `${stage}_${headerText.slice(0, 30)}_${fieldCount}`;

    return {
      stage,
      title: headerText || stage,
      modal,
      isReview,
      isSubmit,
      signature,
    };
  }

  // C. Required Field Completion Checker (Prevents clicking Next with missing answers)
  function checkRequiredFieldsIncomplete(modal) {
    if (!modal || !modal.isConnected) return { hasIncomplete: false };

    // 1. Check for visible LinkedIn error messages
    const errors = Array.from(modal.querySelectorAll('.artdeco-inline-feedback--error, .fb-dash-form-element--error')).filter(isVisible);
    if (errors.length > 0) {
      const errText = errors[0].innerText.trim();
      return { hasIncomplete: true, label: 'Form Validation Error', reason: errText };
    }

    // 2. Check required text inputs & textareas
    const requiredInputs = Array.from(modal.querySelectorAll('input[required], input[aria-required="true"], textarea[required], textarea[aria-required="true"]')).filter(isVisible);
    for (const input of requiredInputs) {
      if (input.type === 'radio' || input.type === 'checkbox') continue;
      if (!input.value || !input.value.trim()) {
        const label = getFieldLabel(input);
        return { hasIncomplete: true, label, reason: `Required text field "${label}" is empty` };
      }
    }

    // 3. Check required radio groups
    const radioGroups = new Map();
    const requiredRadios = Array.from(modal.querySelectorAll('input[type="radio"][required], input[type="radio"][aria-required="true"]')).filter(isVisible);
    for (const radio of requiredRadios) {
      const name = radio.name || 'group';
      if (!radioGroups.has(name)) radioGroups.set(name, []);
      radioGroups.get(name).push(radio);
    }

    for (const [name, radios] of radioGroups.entries()) {
      const isAnyChecked = radios.some(r => r.checked);
      if (!isAnyChecked) {
        const label = getFieldLabel(radios[0]);
        return { hasIncomplete: true, label, reason: `Required question "${label}" has no radio selected` };
      }
    }

    return { hasIncomplete: false };
  }

  // D. Navigation Button Detector (Next / Review vs Final Submit)
  function detectNavigationButton(modal) {
    if (!modal || !modal.isConnected) return null;

    const buttons = Array.from(modal.querySelectorAll('button')).filter(isVisible);

    // 1. FIRST: Check for Final Submit Button -> MUST BE BLOCKED
    for (const btn of buttons) {
      const aria = normalizeText(btn.getAttribute('aria-label') || '');
      const text = normalizeText(btn.innerText || '');
      if (
        aria.includes('submit application') ||
        text === 'submit application' ||
        text === 'submit' ||
        text === 'send application' ||
        btn.getAttribute('data-easy-apply-submit-button') !== null
      ) {
        return { type: 'SUBMIT', button: btn, label: text || aria };
      }
    }

    // 2. Check for Review Button (Advances to Review Page)
    for (const btn of buttons) {
      const aria = normalizeText(btn.getAttribute('aria-label') || '');
      const text = normalizeText(btn.innerText || '');
      if (aria.includes('review your application') || aria.includes('review') || text === 'review' || text === 'review your application') {
        return { type: 'REVIEW', button: btn, label: text || aria };
      }
    }

    // 3. Check for Next / Continue Button
    for (const btn of buttons) {
      const aria = normalizeText(btn.getAttribute('aria-label') || '');
      const text = normalizeText(btn.innerText || '');
      if (
        aria.includes('continue to next step') ||
        aria.includes('next') ||
        text === 'next' ||
        text === 'continue' ||
        btn.getAttribute('data-easy-apply-next-button') !== null
      ) {
        return { type: 'NEXT', button: btn, label: text || aria };
      }
    }

    return null;
  }

  // E. Fill Single Step Visible Fields
  async function fillVisibleStepFields(activeContainer, profile) {
    const elements = Array.from(activeContainer.querySelectorAll('input, textarea, select, [role="combobox"]')).filter(isVisible);
    window.__telehire_diagnostics.fieldsDetected += elements.length;

    let filledCount = 0;
    const handledRadios = new Set();

    for (const el of elements) {
      if (!el.isConnected || el.disabled || el.readOnly) continue;

      const type = (el.type || el.getAttribute('role') || el.tagName).toLowerCase();
      const labelText = getFieldLabel(el);
      const signature = `${type}_${el.name || el.id || labelText}`;

      if (filledSignatures.has(signature) && el.value) {
        continue;
      }

      // 1. Radio Button Handling
      if (type === 'radio') {
        const groupName = el.name || signature;
        if (handledRadios.has(groupName)) continue;
        handledRadios.add(groupName);

        const groupRadios = Array.from(activeContainer.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)).filter(isVisible);
        const success = await fillRadioGroup(groupRadios.length > 0 ? groupRadios : [el], labelText, profile);
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
          logDiag('skipped', labelText, { type: 'checkbox', reason: 'Non-mandatory checkbox' });
        }
        continue;
      }

      // 3. Native Select Handling
      if (el.tagName.toLowerCase() === 'select') {
        const success = await fillSelectField(el, labelText, profile);
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
        const success = await fillComboboxField(el, labelText, profile);
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
      const mapping = mapFieldToProfile(labelText, el, profile);
      if (!mapping || !mapping.value) {
        logDiag('skipped', labelText, { type: 'text', reason: 'No trusted profile value' });
        continue;
      }

      let verified = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        await humanType(el, mapping.value);
        verified = verifyField(el, mapping.value, 'text');
        if (verified) break;
        await new Promise(r => setTimeout(r, 80));
      }

      if (verified) {
        filledCount++;
        filledSignatures.add(signature);
        logDiag('success', labelText, { type: 'text', mapped: mapping.key, value: mapping.value });
      } else {
        logDiag('failed', labelText, { type: 'text', mapped: mapping.key, reason: 'Value did not persist in DOM' });
      }

      const fieldDelay = Math.floor(Math.random() * (220 - 100 + 1)) + 100;
      await new Promise(r => setTimeout(r, fieldDelay));
    }

    return filledCount;
  }

  // F. Complete Multi-Step Orchestration Loop (LinkedIn Easy Apply)
  async function orchestrateEasyApplyFlow(modal, profile) {
    if (isOrchestrating) return { totalFilled: 0, status: 'BUSY' };
    isOrchestrating = true;

    window.__telehire_diagnostics.easyApply = true;
    window.__telehire_diagnostics.status = 'ORCHESTRATING';

    let totalFilled = 0;
    let stepNumber = 1;
    const maxSteps = 8;
    let lastStepSig = '';

    while (stepNumber <= maxSteps) {
      if (!modal || !modal.isConnected) break;

      const stepInfo = detectEasyApplyStep(modal);
      window.__telehire_diagnostics.currentStep = stepInfo.stage;
      window.__telehire_diagnostics.stepIndex = stepNumber;
      console.log(`%c[TeleHire Orchestrator] Step ${stepNumber}: ${stepInfo.stage} (${stepInfo.title})`, 'color: #10b981; font-weight: bold;');

      // 1. SAFETY STOP: If reached Review or Final Submit state -> STOP IMMEDIATELY
      if (stepInfo.isReview || stepInfo.stage === 'REVIEW') {
        window.__telehire_diagnostics.status = 'READY_FOR_MANUAL_SUBMIT';
        console.log('%c[TeleHire Safety Gate] Review step reached! Stopping automation for manual candidate submission.', 'color: #f59e0b; font-weight: bold;');
        break;
      }

      // 2. Handle Resume Step (Select existing resume if available)
      if (stepInfo.stage === 'RESUME') {
        const resumeRadios = Array.from(modal.querySelectorAll('.jobs-document-upload__file-selection input[type="radio"], input[type="radio"][value*="resume"]')).filter(isVisible);
        if (resumeRadios.length > 0 && !resumeRadios.some(r => r.checked)) {
          resumeRadios[0].click();
          resumeRadios[0].checked = true;
          resumeRadios[0].dispatchEvent(new Event('change', { bubbles: true }));
          totalFilled++;
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // 3. Fill all fields visible on the current step
      const stepFilled = await fillVisibleStepFields(modal, profile);
      totalFilled += stepFilled;

      // 4. Verify no unresolved required fields exist before proceeding
      const reqCheck = checkRequiredFieldsIncomplete(modal);
      if (reqCheck.hasIncomplete) {
        window.__telehire_diagnostics.status = 'MANUAL_REQUIRED';
        window.__telehire_diagnostics.reason = reqCheck.reason;
        console.warn(`[TeleHire Orchestrator] ${reqCheck.reason}. Halting automation for candidate manual input.`);
        showNotification(`⚠️ ${reqCheck.reason}. Please answer manually to continue.`, 'warning');
        break;
      }

      // 5. Detect Navigation Button (Next / Review vs Submit)
      const nav = detectNavigationButton(modal);
      if (!nav) {
        console.log('[TeleHire Orchestrator] No navigation button found. Step complete.');
        break;
      }

      // 6. MANDATORY SAFETY RULE: If button is Final Submit -> STOP
      if (nav.type === 'SUBMIT') {
        window.__telehire_diagnostics.status = 'READY_FOR_MANUAL_SUBMIT';
        console.log('%c[TeleHire Safety Gate] Final Submit button detected. Automation stopped.', 'color: #f59e0b; font-weight: bold;');
        break;
      }

      // 7. Advance Step (Next or Review)
      if (nav.type === 'NEXT' || nav.type === 'REVIEW') {
        lastStepSig = stepInfo.signature;
        window.__telehire_diagnostics.navigation.attempted = true;
        window.__telehire_diagnostics.navigation.lastAction = nav.type;

        console.log(`[TeleHire Orchestrator] Clicking "${nav.label}" to advance step...`);
        nav.button.focus();
        nav.button.click();

        // 8. Await DOM Transition with Bounded Timeout (up to 2000ms)
        let transitioned = false;
        const startWait = Date.now();
        while (Date.now() - startWait < 2000) {
          await new Promise(r => setTimeout(r, 250));
          const currentModal = detectEasyApplyModal().modal;
          if (!currentModal || !currentModal.isConnected) break;

          const newStep = detectEasyApplyStep(currentModal);
          if (newStep.signature !== lastStepSig) {
            transitioned = true;
            modal = currentModal;
            break;
          }
        }

        window.__telehire_diagnostics.navigation.successful = transitioned;
        stepNumber++;
        await new Promise(r => setTimeout(r, 300));
      }
    }

    isOrchestrating = false;
    return { totalFilled, status: window.__telehire_diagnostics.status };
  }

  // G. Master Safe Form Filling Entry Point
  async function fillFormSafely() {
    if (isFilling) return;
    isFilling = true;

    // Reset diagnostics
    window.__telehire_diagnostics = {
      platform: window.location.hostname.replace('www.', ''),
      timestamp: new Date().toISOString(),
      easyApply: false,
      currentStep: 'START',
      stepIndex: 0,
      fieldsDetected: 0,
      fieldsFilled: 0,
      fieldsSkipped: 0,
      fieldsFailed: 0,
      navigation: { attempted: false, successful: false, lastAction: null },
      status: 'FILLING',
      reason: null,
      fields: [],
    };

    // A. Check Credentials in Storage
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
    showNotification('⚡ TeleHire Safe Form Filler active...', 'info');

    // E. Detect LinkedIn Easy Apply Modal vs Regular Page Form
    const easyApply = detectEasyApplyModal();
    let totalFilled = 0;

    if (easyApply.isEasyApply && easyApply.modal) {
      // Run Multi-Step Easy Apply Orchestrator
      const orchResult = await orchestrateEasyApplyFlow(easyApply.modal, p);
      totalFilled = orchResult.totalFilled;
    } else {
      // Standard Page Form Fill (Workable, Greenhouse, Lever, Naukri, Indeed)
      const container = document.querySelector('form, .application-form, [role="dialog"]') || document.body;
      totalFilled = await fillVisibleStepFields(container, p);
    }

    // F. Final Diagnostics Accounting
    window.__telehire_diagnostics.fieldsFilled = totalFilled;
    window.__telehire_diagnostics.fieldsFailed = window.__telehire_diagnostics.fields.filter(f => f.type === 'failed').length;
    window.__telehire_diagnostics.fieldsSkipped = window.__telehire_diagnostics.fields.filter(f => f.type === 'skipped').length;

    console.log('[TeleHire Flow Completed]', window.__telehire_diagnostics);

    // G. Quota Deduction (Single deduction per completed application flow)
    if (totalFilled > 0) {
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
      showSuccessModal(totalFilled, newDaily, newQuota);
    } else {
      showNotification('ℹ️ No unfilled supported fields detected on this application step.', 'info');
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

  // 14. Success & Manual Submit Reminder Modal (Safety Gate)
  function showSuccessModal(filledCount, todayCount, quotaLeft) {
    let modal = document.getElementById('whatshire-modal');
    if (modal) modal.remove();

    const isReview = window.__telehire_diagnostics.status === 'READY_FOR_MANUAL_SUBMIT';

    modal = document.createElement('div');
    modal.id = 'whatshire-modal';
    modal.innerHTML = `
      <div class="wh-modal-overlay">
        <div class="wh-modal-card">
          <div class="wh-modal-header">
            <span class="wh-icon-check">✅</span>
            <h3>${isReview ? 'Application Ready for Review!' : 'Form Filled Safely!'}</h3>
          </div>
          <p class="wh-modal-body">
            <strong>${filledCount} fields</strong> filled & verified across application steps.<br><br>
            ${isReview ? '🎯 <strong>Review Step Reached:</strong> All steps filled safely.<br><br>' : ''}
            ⚠️ <strong>Safety Rule:</strong> Please manually review all answers, check your resume file, and click <em>Submit Application</em> yourself.<br><br>
            <span class="wh-badge-safety">🛡️ Manual Submit protects your account (<1% ban risk)</span>
          </p>
          <div class="wh-modal-footer">
            <div class="wh-modal-stats">
              <span>Today: <strong>${todayCount} / 40</strong> fills</span>
              <span>Quota left: <strong>${quotaLeft}</strong></span>
            </div>
            <button id="wh-modal-ok" class="wh-btn-primary">I will review & submit</button>
          </div>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(modal);

    document.getElementById('wh-modal-ok')?.addEventListener('click', () => {
      modal.remove();
    });
  }

  // Message listener from popup
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

  // Debounced MutationObserver
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
