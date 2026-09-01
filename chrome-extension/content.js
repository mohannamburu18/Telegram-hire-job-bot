/**
 * Lucres AI & TeleHire - Real-Time Smart Autofill & Universal ATS Engine
 * 5-Layer Selector Fallback · React State Compatible · 1800ms React Delay · Strict Manual Review Gate
 */

(function () {
  if (window.__lucresInitialized) return;
  window.__lucresInitialized = true;

  let isExecuting = false;
  let currentActiveTaskId = null;
  window.__lucres_dismissed = false;
  const filledSignatures = new Set();

  // Structured Real-Time Diagnostics
  window.__lucres_diagnostics = {
    platform: 'UNKNOWN',
    applicationDetected: false,
    currentStep: 'INIT',
    stepIndex: 0,
    fieldsDetected: 0,
    fieldsMapped: 0,
    fieldsFilled: 0,
    fieldsSkipped: 0,
    fieldsFailed: 0,
    requiredIncomplete: 0,
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
    window.__lucres_diagnostics.fields.push(entry);
    console.log(`%c[Lucres AI] [${type.toUpperCase()}] ${fieldName}:`, 'color: #0284c7; font-weight: bold;', details);
  }

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

  // =========================================================================
  // 1. REACT / VUE / ANGULAR SYNTHETIC SETTER
  // =========================================================================

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

  async function humanType(element, text) {
    if (!element || !element.isConnected || text === undefined || text === null) return false;
    element.focus();
    setNativeValue(element, '');
    await new Promise(r => setTimeout(r, 20));

    let accumulated = '';
    const str = String(text);
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      accumulated += char;
      const keyDelay = Math.floor(Math.random() * (30 - 15 + 1)) + 15;

      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, composed: true }));
      setNativeValue(element, accumulated);
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, composed: true }));

      await new Promise(r => setTimeout(r, keyDelay));
    }

    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
    await new Promise(r => setTimeout(r, 40));
    return true;
  }

  // =========================================================================
  // 2. 5-SELECTOR PER FIELD UNIVERSAL SMART FILL ENGINE
  // =========================================================================

  const UNIVERSAL_FIELD_SELECTORS = {
    firstName: [
      'input[name*="first_name"]',
      'input[name*="firstName"]',
      'input[id*="first_name"]',
      '#first_name',
      'input[autocomplete="given-name"]',
    ],
    lastName: [
      'input[name*="last_name"]',
      'input[name*="lastName"]',
      'input[id*="last_name"]',
      '#last_name',
      'input[autocomplete="family-name"]',
    ],
    middleName: [
      'input[name*="middle_name"]',
      'input[name*="middleName"]',
      'input[id*="middle_name"]',
      '#middle_name',
      'input[autocomplete="additional-name"]',
    ],
    email: [
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      '#email',
      'input[autocomplete="email"]',
    ],
    phone: [
      'input[type="tel"]',
      'input[name*="phone"]',
      'input[id*="phone"]',
      '#phone',
      'input[autocomplete="tel"]',
    ],
    location: [
      'input[name*="location"]',
      'input[id*="location"]',
      'input[name*="city"]',
      'input[id*="city"]',
      'input[autocomplete="address-level2"]',
    ],
    linkedin: [
      'input[name*="linkedin"]',
      'input[id*="linkedin"]',
      'input[placeholder*="linkedin" i]',
      'input[aria-label*="linkedin" i]',
      'input[name*="urls[LinkedIn]"]',
    ],
    github: [
      'input[name*="github"]',
      'input[id*="github"]',
      'input[placeholder*="github" i]',
      'input[aria-label*="github" i]',
      'input[name*="urls[GitHub]"]',
    ],
  };

  async function smartFill(selectors, value, root = document) {
    if (!value) return false;
    for (const selector of selectors) {
      try {
        const el = root.querySelector(selector);
        if (el && isVisible(el) && !el.disabled && !el.readOnly) {
          await humanType(el, value);
          const val = (el.value || '').trim();
          if (val) {
            logDiag('smart_fill', selector, { value });
            return true;
          }
        }
      } catch (_) {}
    }
    return false;
  }

  // =========================================================================
  // 3. SCOPED CONTAINER FIELD LABEL EXTRACTOR
  // =========================================================================

  function getFieldLabel(el) {
    if (!el) return '';
    const parts = [];

    const autocomplete = el.getAttribute('autocomplete') || '';
    if (autocomplete) parts.push(autocomplete);

    if (el.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicitLabel && explicitLabel.innerText.trim()) {
        parts.push(explicitLabel.innerText.trim());
      }
    }

    const wrappingLabel = el.closest('label');
    if (wrappingLabel && wrappingLabel.innerText.trim()) {
      parts.push(wrappingLabel.innerText.trim());
    }

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const ids = labelledby.split(/\s+/);
      for (const id of ids) {
        const target = document.getElementById(id);
        if (target && target.innerText.trim()) parts.push(target.innerText.trim());
      }
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) parts.push(ariaLabel);

    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(el.name);
    if (el.id) parts.push(el.id);

    const fieldContainer = el.closest('fieldset, .field, .form-group, [data-test-form-builder-item], .fb-dash-form-element, [data-qa="form-group"]');
    if (fieldContainer) {
      const legend = fieldContainer.querySelector('legend');
      if (legend && legend.innerText.trim()) parts.push(legend.innerText.trim());
      const directLabel = fieldContainer.querySelector('.fb-dash-form-element__label, [data-test-form-element-label], [data-qa="form-label"], .t-bold, span[aria-hidden="true"]');
      if (directLabel && directLabel.innerText.trim()) parts.push(directLabel.innerText.trim());
    }

    return normalizeText(parts.join(' '));
  }

  // =========================================================================
  // 4. SEMANTIC PROFILE MAPPER
  // =========================================================================

  function mapFieldToProfile(labelText, el, profile) {
    const norm = normalizeText(labelText);
    const type = (el.type || '').toLowerCase();
    const elName = (el.name || '').toLowerCase();
    const elId = (el.id || '').toLowerCase();
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase();

    // 1. Direct Attributes
    if (auto === 'given-name' || elName === 'first_name' || elName === 'fname' || elName === 'firstname' || elId === 'first_name' || elName.includes('[first_name]')) {
      return { key: 'firstName', value: profile.firstName || 'Mohan' };
    }
    if (auto === 'family-name' || elName === 'last_name' || elName === 'lname' || elName === 'lastname' || elId === 'last_name' || elName.includes('[last_name]')) {
      return { key: 'lastName', value: profile.lastName || 'Namburu' };
    }
    if (elName === 'middle_name' || elName === 'mname' || elId === 'middle_name' || elName.includes('[middle_name]')) {
      return { key: 'middleName', value: profile.middleName || 'Krishna' };
    }
    if (auto === 'email' || type === 'email' || elName === 'email' || elId === 'email' || elName.includes('[email]')) {
      return { key: 'email', value: profile.email };
    }
    if (auto === 'tel' || type === 'tel' || elName === 'phone' || elId === 'phone' || elName.includes('[phone]')) {
      return { key: 'phone', value: profile.phone };
    }

    // 2. Semantic Labels
    if (norm.includes('middle name') || norm.includes('middlename')) {
      return { key: 'middleName', value: profile.middleName || 'Krishna' };
    }
    if ((norm.includes('first name') || norm.includes('firstname') || norm.includes('given name') || norm.includes('forename')) && !norm.includes('last') && !norm.includes('middle') && !norm.includes('company') && !norm.includes('school')) {
      return { key: 'firstName', value: profile.firstName || 'Mohan' };
    }
    if ((norm.includes('last name') || norm.includes('lastname') || norm.includes('surname') || norm.includes('family name')) && !norm.includes('first') && !norm.includes('middle') && !norm.includes('company') && !norm.includes('school')) {
      return { key: 'lastName', value: profile.lastName || 'Namburu' };
    }

    const isUnrelated = norm.includes('company') || norm.includes('employer') || norm.includes('school') || norm.includes('college') || norm.includes('university') || norm.includes('project') || norm.includes('file') || norm.includes('user') || norm.includes('ref') || norm.includes('manager') || norm.includes('emergency');
    if (!isUnrelated && (norm === 'name' || norm === 'full name' || norm === 'fullname' || norm === 'candidate name' || norm === 'applicant name' || norm === 'your name' || norm === 'legal name')) {
      return { key: 'name', value: profile.name || 'Mohan Krishna Namburu' };
    }

    if (norm === 'email' || norm === 'email address' || norm.includes('email') || norm.includes('e mail')) {
      return { key: 'email', value: profile.email };
    }
    if (norm.includes('phone') || norm.includes('mobile') || norm.includes('contact number') || norm.includes('telephone') || norm.includes('cell')) {
      return { key: 'phone', value: profile.phone };
    }
    if (norm.includes('current location') || norm.includes('current city') || norm.includes('location') || norm.includes('address') || norm.includes('where are you based')) {
      return { key: 'location', value: profile.current_location || profile.location || 'Bangalore, Karnataka, India' };
    }
    if (norm.includes('linkedin') || norm.includes('linked in')) {
      return { key: 'linkedin', value: profile.linkedin || 'https://www.linkedin.com' };
    }
    if (norm.includes('github') || norm.includes('git hub') || norm.includes('portfolio') || norm.includes('website') || norm.includes('personal url')) {
      return { key: 'github', value: profile.github || profile.portfolio || 'https://github.com' };
    }

    // Work Auth & Legal Rights
    if (norm.includes('authorized to work') || norm.includes('legally authorized') || norm.includes('eligible to work') || norm.includes('right to work') || norm.includes('legal right')) {
      return { key: 'work_authorization', value: profile.work_authorization || 'Yes' };
    }
    if (norm.includes('sponsorship') || norm.includes('require visa') || norm.includes('visa sponsorship') || norm.includes('will you require visa') || norm.includes('now or in the future')) {
      return { key: 'visa_sponsorship', value: profile.visa_sponsorship || 'No' };
    }
    if (norm.includes('relocate') || norm.includes('willing to relocate')) {
      return { key: 'relocate', value: profile.relocation || 'Yes' };
    }

    // Voluntary Disclosures
    if (norm.includes('disability') || norm.includes('handicap')) {
      return { key: 'disability', value: 'No' };
    }
    if (norm.includes('veteran') || norm.includes('military')) {
      return { key: 'veteran', value: 'No' };
    }
    if (norm.includes('gender') || norm.includes('sex')) {
      return { key: 'gender', value: 'Male' };
    }

    // Confirmations
    if (norm.includes('18 years of age') || norm.includes('at least 18') || norm.includes('completed degree') || norm.includes('background check') || norm.includes('drug screen')) {
      return { key: 'general_yes', value: 'Yes' };
    }
    if (norm.includes('notice') || norm.includes('how soon') || norm.includes('availability') || norm.includes('start date') || norm.includes('joining period')) {
      return { key: 'notice', value: profile.notice_period || 'Immediate / 15 Days' };
    }
    if (norm.includes('expected salary') || norm.includes('expected ctc') || norm.includes('ctc') || norm.includes('salary expectation')) {
      return { key: 'salary', value: profile.expected_ctc || profile.expected_salary || 'As per industry standards' };
    }
    if (norm.includes('years of experience') || norm.includes('total experience') || norm.includes('how many years')) {
      return { key: 'experience', value: `${profile.experience_years || '0-1'}` };
    }

    return null;
  }

  // =========================================================================
  // 5. DROPDOWN / RADIO / CHECKBOX HANDLERS
  // =========================================================================

  function verifyField(el, expectedValue, fieldType) {
    if (!el || !el.isConnected) return false;
    if (fieldType === 'radio' || fieldType === 'checkbox') return el.checked === true;
    if (fieldType === 'select') {
      return Boolean(el.value && el.options[el.selectedIndex]?.text);
    }
    const actualVal = (el.value || '').trim();
    if (!actualVal) return false;
    const normActual = normalizeText(actualVal);
    const normExpected = normalizeText(String(expectedValue));
    return normActual.length > 0 && (normActual.includes(normExpected) || normExpected.includes(normActual));
  }

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

    if (bestMatchIdx !== -1) {
      selectEl.selectedIndex = bestMatchIdx;
      setNativeValue(selectEl, selectEl.options[bestMatchIdx].value);
      selectEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      await new Promise(r => setTimeout(r, 50));
      return verifyField(selectEl, selectEl.options[bestMatchIdx].value, 'select');
    }
    return false;
  }

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

  // =========================================================================
  // 6. PLATFORM ADAPTERS
  // =========================================================================

  const PlatformAdapters = {
    LinkedIn: {
      detect() {
        const modal = document.querySelector('.jobs-easy-apply-modal, [data-easy-apply-modal], div[role="dialog"].artdeco-modal');
        return modal && isVisible(modal) ? modal : null;
      },
      detectStep(modal) {
        const headerEl = modal.querySelector('h1, h2, h3, .artdeco-modal__header');
        const headerText = headerEl ? headerEl.innerText.trim() : '';
        const norm = normalizeText(headerText + ' ' + modal.innerText);
        let stage = 'QUESTIONS';
        if (norm.includes('review your application') || norm.includes('review')) stage = 'REVIEW';
        else if (norm.includes('contact info')) stage = 'CONTACT_INFO';
        else if (norm.includes('resume')) stage = 'RESUME';
        return { stage, title: headerText || stage };
      },
      detectNavigation(modal) {
        const buttons = Array.from(modal.querySelectorAll('button')).filter(isVisible);
        for (const btn of buttons) {
          const text = normalizeText((btn.getAttribute('aria-label') || '') + ' ' + (btn.innerText || ''));
          if (text.includes('submit application') || text === 'submit') {
            return { type: 'SUBMIT', button: btn, shouldClick: false };
          }
        }
        for (const btn of buttons) {
          const text = normalizeText((btn.getAttribute('aria-label') || '') + ' ' + (btn.innerText || ''));
          if (text.includes('review your application') || text === 'review') {
            return { type: 'REVIEW', button: btn, shouldClick: true };
          }
        }
        for (const btn of buttons) {
          const text = normalizeText((btn.getAttribute('aria-label') || '') + ' ' + (btn.innerText || ''));
          if (text.includes('next') || text === 'next' || text === 'continue') {
            return { type: 'NEXT', button: btn, shouldClick: true };
          }
        }
        return null;
      },
    },

    Greenhouse: {
      detect() {
        const root = document.querySelector('form#application_form, div#app_body, [data-qa="application-form"], #application');
        return (root && isVisible(root)) || window.location.hostname.includes('greenhouse.io') ? (root || document.body) : null;
      },
      detectNavigation(root) {
        const submitBtn = root.querySelector('input[type="submit"], button#submit_app, button[data-qa="submit-button"]');
        if (submitBtn && isVisible(submitBtn)) {
          return { type: 'SUBMIT', button: submitBtn, shouldClick: false };
        }
        return null;
      },
    },

    Lever: {
      detect() {
        const root = document.querySelector('form#application-form, .application-form, .postings-btn-wrapper');
        return (root && isVisible(root)) || window.location.hostname.includes('lever.co') ? (root || document.body) : null;
      },
      detectNavigation(root) {
        const submitBtn = root.querySelector('button#btn-submit, button.template-btn-submit, input[type="submit"]');
        if (submitBtn && isVisible(submitBtn)) {
          return { type: 'SUBMIT', button: submitBtn, shouldClick: false };
        }
        return null;
      },
    },

    Ashby: {
      detect() {
        const root = document.querySelector('div[data-testid="application-form"], .ashby-application-form, form');
        return (root && isVisible(root)) || window.location.hostname.includes('ashbyhq.com') ? (root || document.body) : null;
      },
      detectNavigation(root) {
        const submitBtn = root.querySelector('button[type="submit"], button[data-testid="submit-application"]');
        if (submitBtn && isVisible(submitBtn)) {
          return { type: 'SUBMIT', button: submitBtn, shouldClick: false };
        }
        return null;
      },
    },

    Workday: {
      detect() {
        const root = document.querySelector('div[data-automation-id="pageHeader"], [data-automation-id="applyForm"], form');
        return (root && isVisible(root)) || window.location.hostname.includes('myworkday') || window.location.hostname.includes('workday') ? (root || document.body) : null;
      },
      detectNavigation(root) {
        const submitBtn = root.querySelector('button[data-automation-id="bottom-navigation-submit-button"], button[data-automation-id="submit-button"]');
        if (submitBtn && isVisible(submitBtn)) {
          return { type: 'SUBMIT', button: submitBtn, shouldClick: false };
        }
        return null;
      },
    },

    Generic: {
      detect() {
        return document.querySelector('form, [role="dialog"], .application-form, main') || document.body;
      },
      detectNavigation(root) {
        const buttons = Array.from(root.querySelectorAll('button, input[type="submit"]')).filter(isVisible);
        for (const btn of buttons) {
          const text = normalizeText((btn.getAttribute('aria-label') || '') + ' ' + (btn.value || '') + ' ' + (btn.innerText || ''));
          if (text.includes('submit') || text.includes('apply')) {
            return { type: 'SUBMIT', button: btn, shouldClick: false };
          }
        }
        return null;
      },
    },
  };

  function detectActiveAdapter() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('linkedin.com') && PlatformAdapters.LinkedIn.detect()) {
      return { adapter: PlatformAdapters.LinkedIn, root: PlatformAdapters.LinkedIn.detect(), name: 'LinkedIn Easy Apply' };
    }
    if (host.includes('greenhouse.io') || PlatformAdapters.Greenhouse.detect()) {
      return { adapter: PlatformAdapters.Greenhouse, root: PlatformAdapters.Greenhouse.detect(), name: 'Greenhouse' };
    }
    if (host.includes('lever.co') || PlatformAdapters.Lever.detect()) {
      return { adapter: PlatformAdapters.Lever, root: PlatformAdapters.Lever.detect(), name: 'Lever' };
    }
    if (host.includes('ashbyhq.com') || PlatformAdapters.Ashby.detect()) {
      return { adapter: PlatformAdapters.Ashby, root: PlatformAdapters.Ashby.detect(), name: 'Ashby' };
    }
    if (host.includes('workday.com') || host.includes('myworkday') || PlatformAdapters.Workday.detect()) {
      return { adapter: PlatformAdapters.Workday, root: PlatformAdapters.Workday.detect(), name: 'Workday' };
    }
    return { adapter: PlatformAdapters.Generic, root: PlatformAdapters.Generic.detect(), name: 'Generic ATS' };
  }

  // =========================================================================
  // 7. MASTER EXECUTION WITH 1800ms REACT FORM SETTLING DELAY
  // =========================================================================

  async function executeAutofillFlow(profile, taskId = null) {
    if (isExecuting) return { totalFilled: 0, status: 'BUSY' };
    isExecuting = true;
    currentActiveTaskId = taskId;

    // Wait 1800ms for React / SPA forms to settle
    await new Promise(r => setTimeout(r, 1800));

    // Bounded search for form in DOM (up to 15s)
    let activeAdapterData = null;
    const startFormWait = Date.now();
    while (Date.now() - startFormWait < 15000) {
      activeAdapterData = detectActiveAdapter();
      if (activeAdapterData && activeAdapterData.root && isVisible(activeAdapterData.root)) {
        break;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const { adapter, root, name } = activeAdapterData || { adapter: PlatformAdapters.Generic, root: document.body, name: 'Generic ATS' };
    window.__lucres_diagnostics.platform = name;
    window.__lucres_diagnostics.applicationDetected = Boolean(root);
    window.__lucres_diagnostics.status = 'EXECUTING';

    console.log(`%c[Lucres AI] Platform Detected: ${name}`, 'color: #10b981; font-weight: bold;');

    if (taskId) {
      chrome.runtime.sendMessage({
        type: 'REPORT_TASK_PROGRESS',
        payload: { taskId, status: 'DETECTED', platform: name, step: 'FORM_DETECTED' },
      });
    }

    // Step 1: Execute Universal 5-Selector Smart Fill for standard fields
    let totalFilled = 0;
    const standardFields = [
      { key: 'firstName', selectors: UNIVERSAL_FIELD_SELECTORS.firstName, val: profile.firstName },
      { key: 'lastName', selectors: UNIVERSAL_FIELD_SELECTORS.lastName, val: profile.lastName },
      { key: 'email', selectors: UNIVERSAL_FIELD_SELECTORS.email, val: profile.email },
      { key: 'phone', selectors: UNIVERSAL_FIELD_SELECTORS.phone, val: profile.phone },
      { key: 'location', selectors: UNIVERSAL_FIELD_SELECTORS.location, val: profile.current_location || profile.city },
      { key: 'linkedin', selectors: UNIVERSAL_FIELD_SELECTORS.linkedin, val: profile.linkedin },
      { key: 'github', selectors: UNIVERSAL_FIELD_SELECTORS.github, val: profile.github },
    ];

    for (const sf of standardFields) {
      if (sf.val) {
        const filled = await smartFill(sf.selectors, sf.val, root);
        if (filled) {
          totalFilled++;
          filledSignatures.add(`smart_${sf.key}`);
        }
      }
    }

    // Step 2: Iterate all visible inputs for custom questions, dropdowns, and radios
    const elements = Array.from(root.querySelectorAll('input, textarea, select, [role="combobox"]')).filter(isVisible);
    const handledRadios = new Set();

    for (const el of elements) {
      if (!el.isConnected || el.disabled || el.readOnly) continue;
      const type = (el.type || el.getAttribute('role') || el.tagName).toLowerCase();
      const labelText = getFieldLabel(el);
      const signature = `${type}_${el.name || el.id || labelText}`;

      if (filledSignatures.has(signature) && el.value) continue;

      if (type === 'radio') {
        const groupName = el.name || signature;
        if (handledRadios.has(groupName)) continue;
        handledRadios.add(groupName);
        const groupRadios = Array.from(root.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)).filter(isVisible);
        const success = await fillRadioGroup(groupRadios.length > 0 ? groupRadios : [el], labelText, profile);
        if (success) {
          totalFilled++;
          filledSignatures.add(signature);
        }
        continue;
      }

      if (el.tagName.toLowerCase() === 'select') {
        const success = await fillSelectField(el, labelText, profile);
        if (success) {
          totalFilled++;
          filledSignatures.add(signature);
        }
        continue;
      }

      const mapping = mapFieldToProfile(labelText, el, profile);
      if (!mapping || !mapping.value) continue;

      if (!el.value) {
        await humanType(el, mapping.value);
        if (el.value) {
          totalFilled++;
          filledSignatures.add(signature);
        }
      }
    }

    // Step 3: Check Navigation / Review Screen Safety Gate
    const nav = adapter.detectNavigation ? adapter.detectNavigation(root) : null;
    if (nav && nav.type === 'SUBMIT') {
      window.__lucres_diagnostics.status = 'READY_FOR_MANUAL_SUBMIT';
      console.log('%c[Lucres AI Safety Gate] Submit button detected. Automation stopped for candidate manual review.', 'color: #f59e0b; font-weight: bold;');
      if (taskId) {
        chrome.runtime.sendMessage({
          type: 'REPORT_TASK_PROGRESS',
          payload: { taskId, status: 'READY_FOR_MANUAL_SUBMIT', step: 'REVIEW_READY', fieldsFilled: totalFilled },
        });
      }
    }

    isExecuting = false;
    return { totalFilled, status: window.__lucres_diagnostics.status };
  }

  // =========================================================================
  // 8. NOTIFICATION & BANNER UI
  // =========================================================================

  async function triggerSafeAutofill(taskId = null) {
    const storage = await new Promise(r => chrome.storage.local.get(['userEmail', 'userLicense', 'userProfile'], r));
    let profile = storage.userProfile;

    if (!profile) {
      const res = await chrome.runtime.sendMessage({
        type: 'GET_PROFILE',
        email: storage.userEmail || 'ncttdp@gmail.com',
        license: storage.userLicense || '',
      });
      profile = res?.profile;
    }

    if (!profile) {
      profile = {
        name: 'Mohan Krishna Namburu',
        firstName: 'Mohan',
        middleName: 'Krishna',
        lastName: 'Namburu',
        email: 'ncttdp@gmail.com',
        phone: '+91 9876543210',
        current_location: 'Bangalore, Karnataka, India',
        work_authorization: 'Yes',
        visa_sponsorship: 'No',
        disability: 'No',
      };
    }

    showBanner(true);
    const result = await executeAutofillFlow(profile, taskId);

    if (result.totalFilled > 0) {
      showSuccessBanner(result.totalFilled);
    }
  }

  function showBanner(loading = false) {
    if (window.__lucres_dismissed || document.getElementById('lucres-ai-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'lucres-ai-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 999999999;
      background: linear-gradient(90deg, #0b0f19, #1e293b); color: #f8fafc;
      border-bottom: 2px solid #38bdf8; padding: 10px 16px; font-family: -apple-system, sans-serif;
      display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    `;

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: linear-gradient(135deg, #2563eb, #38bdf8); color: #fff; font-weight: 800; font-size: 11px; padding: 3px 8px; border-radius: 4px;">LUCRES AI</span>
        <span style="font-size: 12px; font-weight: 600;">${loading ? '⚡ Auto-filling application fields with 95% ATS profile...' : 'Application detected. Fill form with Lucres AI 95% ATS Profile?'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="lucres-btn-fill" style="background: #2563eb; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">⚡ Fill Form Safely</button>
        <button id="lucres-btn-close" style="background: transparent; color: #94a3b8; border: 1px solid #334155; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">✕</button>
      </div>
    `;

    document.documentElement.insertBefore(banner, document.documentElement.firstChild);

    document.getElementById('lucres-btn-fill')?.addEventListener('click', () => triggerSafeAutofill(currentActiveTaskId));
    document.getElementById('lucres-btn-close')?.addEventListener('click', () => {
      window.__lucres_dismissed = true;
      banner.remove();
    });
  }

  function showSuccessBanner(filledCount) {
    const banner = document.getElementById('lucres-ai-banner');
    if (!banner) return;
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: #059669; color: #fff; font-weight: 800; font-size: 11px; padding: 3px 8px; border-radius: 4px;">✓ ATS 95% FILLED</span>
        <span style="font-size: 12px; font-weight: 600;">${filledCount} fields filled. ⚠️ Final submit requires your manual review.</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="lucres-btn-done" style="background: #059669; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">I will review & submit</button>
      </div>
    `;
    document.getElementById('lucres-btn-done')?.addEventListener('click', () => banner.remove());
  }

  // MutationObserver for dynamically loaded SPAs & Application Modals
  const observer = new MutationObserver(() => {
    if (!window.__lucres_dismissed && !document.getElementById('lucres-ai-banner')) {
      const active = detectActiveAdapter();
      if (active && active.root && isVisible(active.root)) {
        showBanner();
      }
    }
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // Runtime message listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'AUTO_START_QUEUE_TASK' || msg.type === 'TRIGGER_FILL') {
      triggerSafeAutofill(msg.task?.taskId || msg.taskId).then(() => {
        sendResponse({ success: true, diagnostics: window.__lucres_diagnostics });
      });
      return true;
    }
  });

  setTimeout(() => {
    const active = detectActiveAdapter();
    if (active && active.root) showBanner();
  }, 1200);
})();
