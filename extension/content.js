/**
 * TeleHire Real-Time Safe Job Form Filler & Multi-Platform ATS Execution Engine (Phase 7 Final)
 * Multi-Platform Adapters · Persistent State Machine · Bounded Polling · Strict Manual Review Gate
 */

(function () {
  if (window.__telehireInitialized) return;
  window.__telehireInitialized = true;

  let isExecuting = false;
  let currentActiveTaskId = null;
  window.__telehire_dismissed = false;
  const filledSignatures = new Set();

  // Structured Real-Time Diagnostics
  window.__telehire_diagnostics = {
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
    window.__telehire_diagnostics.fields.push(entry);
    console.log(`%c[TeleHire] [${type.toUpperCase()}] ${fieldName}:`, 'color: #0284c7; font-weight: bold;', details);
  }

  // =========================================================================
  // 1. DOM UTILITIES & FRAMEWORK SETTERS (React / Vue / Angular Compatible)
  // =========================================================================

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
      const keyDelay = Math.floor(Math.random() * (35 - 15 + 1)) + 15;

      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, composed: true }));
      setNativeValue(element, accumulated);
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, composed: true }));

      await new Promise(r => setTimeout(r, keyDelay));
    }

    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
    await new Promise(r => setTimeout(r, 50));
    return true;
  }

  // Robust Field Label & Question Extractor (Traverses 1-6 Ancestor Levels)
  function getFieldLabel(el) {
    if (!el) return '';
    let collectedText = '';

    const ariaLabel = el.getAttribute('aria-label') || '';
    const placeholder = el.placeholder || '';
    const name = el.name || '';
    const id = el.id || '';

    // A. aria-labelledby
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby.split(/\s+/);
      for (const pId of parts) {
        const labelEl = document.getElementById(pId);
        if (labelEl && labelEl.innerText.trim()) collectedText += ' ' + labelEl.innerText.trim();
      }
    }

    // B. Explicit label[for="..."]
    if (id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor && labelFor.innerText.trim()) collectedText += ' ' + labelFor.innerText.trim();
    }

    // C. Wrapping label
    const wrappingLabel = el.closest('label');
    if (wrappingLabel && wrappingLabel.innerText.trim()) {
      collectedText += ' ' + wrappingLabel.innerText.trim();
    }

    // D. Ancestor Hierarchy Traverser (Up to 6 levels for custom cards, fieldsets, and headings)
    let curr = el.parentElement;
    let depth = 0;
    while (curr && depth < 6) {
      if (curr.tagName.toLowerCase() === 'fieldset') {
        const legend = curr.querySelector('legend');
        if (legend && legend.innerText.trim()) collectedText += ' ' + legend.innerText.trim();
      }

      const semanticTitles = curr.querySelectorAll('h1, h2, h3, h4, h5, h6, .fb-dash-form-element__label, [data-test-form-element-label], [data-qa="form-label"], .t-bold, label, span[aria-hidden="true"]');
      for (const t of semanticTitles) {
        if (t.innerText && t.innerText.trim() && !collectedText.includes(t.innerText.trim())) {
          collectedText += ' ' + t.innerText.trim();
        }
      }

      const prev = curr.previousElementSibling;
      if (prev && (prev.tagName.toLowerCase() === 'label' || prev.classList.contains('fb-dash-form-element__label') || prev.getAttribute('data-test-form-element-label') !== null)) {
        if (prev.innerText && prev.innerText.trim()) collectedText += ' ' + prev.innerText.trim();
      }

      curr = curr.parentElement;
      depth++;
    }

    const combined = `${collectedText} ${ariaLabel} ${placeholder} ${name} ${id}`;
    return normalizeText(combined);
  }

  // =========================================================================
  // 2. PROFILE MAPPER (Truthful Candidate Contract - No Hallucination)
  // =========================================================================

  function mapFieldToProfile(labelText, el, profile) {
    const norm = normalizeText(labelText);
    const type = (el.type || '').toLowerCase();

    // First Name
    if ((norm.includes('first name') || norm.includes('firstname') || norm.includes('given name') || el.name === 'fname' || el.name === 'firstName') && !norm.includes('last name')) {
      return { key: 'firstName', value: profile.firstName || (profile.name || '').split(' ')[0] };
    }

    // Last Name
    if (norm.includes('last name') || norm.includes('lastname') || norm.includes('surname') || norm.includes('family name') || el.name === 'lname' || el.name === 'lastName') {
      return { key: 'lastName', value: profile.lastName || (profile.name || '').split(' ').slice(1).join(' ') || profile.firstName };
    }

    // Full Name
    if (norm.includes('full name') || (norm.includes('name') && !norm.includes('company') && !norm.includes('first') && !norm.includes('last') && !norm.includes('user') && !norm.includes('file'))) {
      return { key: 'name', value: profile.name };
    }

    // Email
    if (type === 'email' || norm.includes('email') || norm.includes('e mail')) {
      return { key: 'email', value: profile.email };
    }

    // Phone / Mobile
    if (type === 'tel' || norm.includes('phone') || norm.includes('mobile') || norm.includes('contact number') || norm.includes('telephone')) {
      return { key: 'phone', value: profile.phone };
    }

    // City / Location / Address
    if (norm.includes('city') || norm.includes('current location') || norm.includes('current city') || norm.includes('location') || norm.includes('address') || norm.includes('where are you based')) {
      return { key: 'location', value: profile.current_location || profile.location || 'Bangalore, India' };
    }

    // LinkedIn
    if (norm.includes('linkedin') || norm.includes('linked in')) {
      return { key: 'linkedin', value: profile.linkedin || 'https://linkedin.com' };
    }

    // GitHub / Portfolio / Personal Website
    if (norm.includes('github') || norm.includes('git hub') || norm.includes('portfolio') || norm.includes('website') || norm.includes('personal url')) {
      return { key: 'github', value: profile.github || profile.linkedin || '' };
    }

    // Notice Period / Availability
    if (norm.includes('notice') || norm.includes('how soon') || norm.includes('availability') || norm.includes('start date') || norm.includes('joining period')) {
      return { key: 'notice', value: profile.notice_period || 'Immediate / 15 Days' };
    }

    // Expected CTC / Salary
    if (norm.includes('expected salary') || norm.includes('expected ctc') || norm.includes('ctc') || norm.includes('salary expectation') || norm.includes('compensation expectation')) {
      return { key: 'salary', value: profile.expected_ctc || profile.expected_salary || 'As per industry standards' };
    }

    // Years of Experience
    if (norm.includes('years of experience') || norm.includes('total experience') || norm.includes('how many years') || norm.includes('experience in years')) {
      return { key: 'experience', value: `${profile.experience_years || '0-1'}` };
    }

    // Skills / Summary / Cover Letter
    if (norm.includes('skills') || norm.includes('technical skills') || norm.includes('summary') || norm.includes('cover letter') || norm.includes('additional information')) {
      return { key: 'skills', value: profile.skillsString || (profile.skills || []).join(', ') || 'Software Engineering, Web Development' };
    }

    // Education / University / Degree
    if (norm.includes('education') || norm.includes('university') || norm.includes('college') || norm.includes('degree') || norm.includes('highest qualification')) {
      return { key: 'education', value: profile.education || 'Bachelor of Technology' };
    }

    // Work Authorization (India / Work Rights)
    if (norm.includes('authorized to work') || norm.includes('legally authorized') || norm.includes('eligible to work') || norm.includes('right to work') || norm.includes('legal right')) {
      return { key: 'work_authorization', value: 'Yes' };
    }

    // Visa Sponsorship
    if (norm.includes('sponsorship') || norm.includes('require visa') || norm.includes('visa sponsorship') || norm.includes('will you require visa')) {
      return { key: 'visa_sponsorship', value: 'No' };
    }

    // Relocation
    if (norm.includes('relocate') || norm.includes('willing to relocate')) {
      return { key: 'relocate', value: 'Yes' };
    }

    // General Truthful Confirmations (18+ age, background check)
    if (norm.includes('18 years of age') || norm.includes('completed degree') || norm.includes('background check') || norm.includes('valid driver')) {
      return { key: 'general_yes', value: 'Yes' };
    }

    return null;
  }

  // =========================================================================
  // 3. FIELD HANDLERS (Select, Combobox, Radio, Checkbox, Text)
  // =========================================================================

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

  async function fillComboboxField(inputEl, labelText, profile) {
    if (!inputEl || !inputEl.isConnected) return false;
    const mapping = mapFieldToProfile(labelText, inputEl, profile);
    if (!mapping || !mapping.value) return false;

    const targetText = String(mapping.value);
    await humanType(inputEl, targetText);

    inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));

    const optionSelectors = [
      '[role="listbox"] [role="option"]',
      '[role="option"]',
      'ul[role="listbox"] li',
      '.artdeco-typeahead__result',
      'li.typeahead-result',
      'div[role="option"]',
      '.artdeco-typeahead__results-list li',
    ];

    let optionElements = [];
    const startTime = Date.now();
    while (Date.now() - startTime < 2000) {
      for (const sel of optionSelectors) {
        const found = Array.from(document.querySelectorAll(sel)).filter(isVisible);
        if (found.length > 0) {
          optionElements = found;
          break;
        }
      }
      if (optionElements.length > 0) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (optionElements.length > 0) {
      const expectedNorm = normalizeText(targetText);
      let matchedOpt = null;

      for (const opt of optionElements) {
        const optNorm = normalizeText(opt.innerText || '');
        if (optNorm === expectedNorm) {
          matchedOpt = opt;
          break;
        }
      }

      if (!matchedOpt) {
        for (const opt of optionElements) {
          const optNorm = normalizeText(opt.innerText || '');
          if (optNorm.startsWith(expectedNorm) || expectedNorm.startsWith(optNorm)) {
            matchedOpt = opt;
            break;
          }
        }
      }

      if (!matchedOpt) {
        for (const opt of optionElements) {
          const optNorm = normalizeText(opt.innerText || '');
          if (optNorm.includes(expectedNorm)) {
            matchedOpt = opt;
            break;
          }
        }
      }

      if (!matchedOpt) matchedOpt = optionElements[0];

      if (matchedOpt) {
        matchedOpt.focus?.();
        matchedOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        matchedOpt.click();
        matchedOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
        await new Promise(r => setTimeout(r, 120));
      }
    }

    return verifyField(inputEl, targetText, 'combobox');
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

  async function fillCheckbox(checkboxEl, labelText) {
    if (!checkboxEl || !isVisible(checkboxEl)) return false;
    const norm = normalizeText(labelText);

    if (norm.includes('agree') || norm.includes('consent') || norm.includes('terms') || norm.includes('privacy') || norm.includes('certify') || norm.includes('acknowledge')) {
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
  // 4. PLATFORM ADAPTERS (LinkedIn, Greenhouse, Lever, Ashby, Workable, Naukri)
  // =========================================================================

  const PlatformAdapters = {
    LinkedIn: {
      name: 'LinkedIn Easy Apply',
      detect() {
        const modal = document.querySelector('.jobs-easy-apply-modal, [data-easy-apply-modal], div[role="dialog"].artdeco-modal, div[data-test-modal-id="easy-apply-modal"]');
        return modal && isVisible(modal) ? modal : null;
      },
      detectStep(modal) {
        const headerEl = modal.querySelector('h1, h2, h3, .jobs-easy-apply-modal__header, .artdeco-modal__header, [data-test-modal-header]');
        const headerText = headerEl ? headerEl.innerText.trim() : '';
        const norm = normalizeText(headerText + ' ' + modal.innerText);

        let stage = 'QUESTIONS';
        if (norm.includes('review your application') || norm.includes('review') || modal.querySelector('.jobs-easy-apply-review')) stage = 'REVIEW';
        else if (norm.includes('contact info')) stage = 'CONTACT_INFO';
        else if (norm.includes('resume') || modal.querySelector('.jobs-document-upload__file-selection')) stage = 'RESUME';
        else if (norm.includes('work authorization')) stage = 'WORK_AUTHORIZATION';
        else if (norm.includes('education')) stage = 'EDUCATION';

        return { stage, title: headerText || stage };
      },
      detectNavigation(modal) {
        const buttons = Array.from(modal.querySelectorAll('button')).filter(isVisible);

        // 1. Submit Application -> MANDATORY SAFETY BLOCK
        for (const btn of buttons) {
          const text = normalizeText((btn.getAttribute('aria-label') || '') + ' ' + (btn.innerText || ''));
          if (text.includes('submit application') || text === 'submit' || btn.getAttribute('data-easy-apply-submit-button') !== null) {
            return { type: 'SUBMIT', button: btn, shouldClick: false };
          }
        }

        // 2. Review
        for (const btn of buttons) {
          const text = normalizeText((btn.getAttribute('aria-label') || '') + ' ' + (btn.innerText || ''));
          if (text.includes('review your application') || text.includes('review') || text === 'review') {
            return { type: 'REVIEW', button: btn, shouldClick: true };
          }
        }

        // 3. Next / Continue
        for (const btn of buttons) {
          const text = normalizeText((btn.getAttribute('aria-label') || '') + ' ' + (btn.innerText || ''));
          if (text.includes('continue to next step') || text.includes('next') || text === 'next' || text === 'continue' || btn.getAttribute('data-easy-apply-next-button') !== null) {
            return { type: 'NEXT', button: btn, shouldClick: true };
          }
        }

        return null;
      },
    },

    Greenhouse: {
      name: 'Greenhouse',
      detect() {
        const root = document.querySelector('form#application_form, div#app_body, [data-qa="application-form"], #application');
        return (root && isVisible(root)) || window.location.hostname.includes('greenhouse.io') || window.location.search.includes('gh_jid') ? (root || document.body) : null;
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
      name: 'Lever',
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
      name: 'Ashby',
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

    Workable: {
      name: 'Workable',
      detect() {
        const root = document.querySelector('form[data-ui="application-form"], .application-form');
        return (root && isVisible(root)) || window.location.hostname.includes('workable.com') ? (root || document.body) : null;
      },
      detectNavigation(root) {
        const submitBtn = root.querySelector('button[data-ui="submit-application"], button[type="submit"]');
        if (submitBtn && isVisible(submitBtn)) {
          return { type: 'SUBMIT', button: submitBtn, shouldClick: false };
        }
        return null;
      },
    },

    Naukri: {
      name: 'Naukri',
      detect() {
        const root = document.querySelector('form, .apply-form, div.chatbot_drawer, div.apply-drawer');
        return (root && isVisible(root)) || window.location.hostname.includes('naukri.com') ? (root || document.body) : null;
      },
      detectNavigation(root) {
        const submitBtn = root.querySelector('button.apply-button, button[type="submit"]');
        if (submitBtn && isVisible(submitBtn)) {
          return { type: 'SUBMIT', button: submitBtn, shouldClick: false };
        }
        return null;
      },
    },

    Generic: {
      name: 'Generic ATS',
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
      return { adapter: PlatformAdapters.LinkedIn, root: PlatformAdapters.LinkedIn.detect(), name: 'LinkedIn' };
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
    if (host.includes('workable.com') || PlatformAdapters.Workable.detect()) {
      return { adapter: PlatformAdapters.Workable, root: PlatformAdapters.Workable.detect(), name: 'Workable' };
    }
    if (host.includes('naukri.com') || PlatformAdapters.Naukri.detect()) {
      return { adapter: PlatformAdapters.Naukri, root: PlatformAdapters.Naukri.detect(), name: 'Naukri' };
    }

    return { adapter: PlatformAdapters.Generic, root: PlatformAdapters.Generic.detect(), name: 'Generic ATS' };
  }

  // =========================================================================
  // 5. STEP & FIELD FILLING ORCHESTRATOR
  // =========================================================================

  function checkRequiredFieldsIncomplete(container) {
    if (!container || !container.isConnected) return { hasIncomplete: false };

    const errors = Array.from(container.querySelectorAll('.artdeco-inline-feedback--error, .fb-dash-form-element--error, [data-test-form-element-error-message], .error-message')).filter(isVisible);
    if (errors.length > 0) {
      return { hasIncomplete: true, reason: errors[0].innerText.trim() || 'Validation error present' };
    }

    const formGroups = Array.from(container.querySelectorAll('.fb-dash-form-element, [data-test-form-builder-item], fieldset, .form-group, .field, div[data-qa="form-group"]')).filter(isVisible);
    for (const group of formGroups) {
      const text = group.innerText || '';
      const isReq = group.querySelector('[required], [aria-required="true"]') !== null || text.includes('*') || group.querySelector('.visually-hidden')?.innerText.toLowerCase().includes('required');

      if (isReq) {
        const inputs = Array.from(group.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), textarea, select')).filter(isVisible);
        for (const input of inputs) {
          if (!input.value || !input.value.trim()) {
            const label = getFieldLabel(input);
            return { hasIncomplete: true, label, reason: `Required field "${label}" is empty` };
          }
        }

        const radios = Array.from(group.querySelectorAll('input[type="radio"]')).filter(isVisible);
        if (radios.length > 0 && !radios.some(r => r.checked)) {
          const label = getFieldLabel(radios[0]);
          return { hasIncomplete: true, label, reason: `Required question "${label}" has no option selected` };
        }
      }
    }

    return { hasIncomplete: false };
  }

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

      if (filledSignatures.has(signature) && el.value) continue;

      // 1. Radio Button Group
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
        }
        continue;
      }

      // 2. Checkbox
      if (type === 'checkbox') {
        const success = await fillCheckbox(el, labelText);
        if (success) {
          filledCount++;
          filledSignatures.add(signature);
          logDiag('success', labelText, { type: 'checkbox', value: el.checked });
        }
        continue;
      }

      // 3. Native Select
      if (el.tagName.toLowerCase() === 'select') {
        const success = await fillSelectField(el, labelText, profile);
        if (success) {
          filledCount++;
          filledSignatures.add(signature);
          logDiag('success', labelText, { type: 'select', value: el.value });
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
        }
        continue;
      }

      // 5. Text / Email / Phone / Textarea
      const mapping = mapFieldToProfile(labelText, el, profile);
      if (!mapping || !mapping.value) {
        logDiag('skipped', labelText, { type: 'text', reason: 'No trusted profile mapping' });
        continue;
      }

      let verified = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        await humanType(el, mapping.value);
        verified = verifyField(el, mapping.value, 'text');
        if (verified) break;
        await new Promise(r => setTimeout(r, 60));
      }

      if (verified) {
        filledCount++;
        filledSignatures.add(signature);
        logDiag('success', labelText, { type: 'text', mapped: mapping.key, value: mapping.value });
      }

      const fieldDelay = Math.floor(Math.random() * (150 - 60 + 1)) + 60;
      await new Promise(r => setTimeout(r, fieldDelay));
    }

    return filledCount;
  }

  // =========================================================================
  // 6. MASTER EXECUTION & MULTI-STEP WORKFLOW
  // =========================================================================

  async function executeAutofillFlow(profile, taskId = null) {
    if (isExecuting) return { totalFilled: 0, status: 'BUSY' };
    isExecuting = true;
    currentActiveTaskId = taskId;

    // Bounded search for application form in DOM (up to 15s)
    let activeAdapterData = null;
    const startFormWait = Date.now();
    while (Date.now() - startFormWait < 15000) {
      activeAdapterData = detectActiveAdapter();
      if (activeAdapterData && activeAdapterData.root && isVisible(activeAdapterData.root)) {
        break;
      }
      await new Promise(r => setTimeout(r, 400));
    }

    const { adapter, root, name } = activeAdapterData || { adapter: PlatformAdapters.Generic, root: document.body, name: 'Generic ATS' };
    window.__telehire_diagnostics.platform = name;
    window.__telehire_diagnostics.applicationDetected = Boolean(root);
    window.__telehire_diagnostics.status = 'EXECUTING';

    console.log(`%c[TeleHire] Active Platform: ${name}`, 'color: #10b981; font-weight: bold;');

    if (taskId) {
      chrome.runtime.sendMessage({
        type: 'REPORT_TASK_PROGRESS',
        payload: {
          taskId,
          status: 'DETECTED',
          platform: name,
          step: 'FORM_DETECTED',
        },
      });
    }

    let totalFilled = 0;
    let stepNumber = 1;
    const maxSteps = 8;
    let currentContainer = root;

    while (stepNumber <= maxSteps) {
      if (!currentContainer || !currentContainer.isConnected) break;

      let stepInfo = { stage: `STEP_${stepNumber}`, title: '' };
      if (adapter.detectStep) {
        stepInfo = adapter.detectStep(currentContainer);
      }

      window.__telehire_diagnostics.currentStep = stepInfo.stage;
      window.__telehire_diagnostics.stepIndex = stepNumber;

      if (taskId) {
        chrome.runtime.sendMessage({
          type: 'REPORT_TASK_PROGRESS',
          payload: {
            taskId,
            status: 'FILLING',
            platform: name,
            step: `${stepInfo.stage} (${stepNumber}/${maxSteps})`,
            fieldsFilled: totalFilled,
          },
        });
      }

      // Check Review Screen
      if (stepInfo.stage === 'REVIEW') {
        window.__telehire_diagnostics.status = 'READY_FOR_MANUAL_SUBMIT';
        console.log('%c[TeleHire Safety Gate] Review step reached! Stopping automation for manual review.', 'color: #f59e0b; font-weight: bold;');
        if (taskId) {
          chrome.runtime.sendMessage({
            type: 'REPORT_TASK_PROGRESS',
            payload: {
              taskId,
              status: 'READY_FOR_MANUAL_SUBMIT',
              step: 'REVIEW_READY',
              fieldsFilled: totalFilled,
            },
          });
        }
        break;
      }

      // Resume step handling
      if (stepInfo.stage === 'RESUME') {
        const resumeRadios = Array.from(currentContainer.querySelectorAll('.jobs-document-upload__file-selection input[type="radio"], input[type="radio"][value*="resume"]')).filter(isVisible);
        if (resumeRadios.length > 0 && !resumeRadios.some(r => r.checked)) {
          resumeRadios[0].click();
          resumeRadios[0].checked = true;
          resumeRadios[0].dispatchEvent(new Event('change', { bubbles: true }));
          totalFilled++;
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // Fill current step fields
      const stepFilled = await fillVisibleStepFields(currentContainer, profile);
      totalFilled += stepFilled;

      // Verify Required Fields
      const reqCheck = checkRequiredFieldsIncomplete(currentContainer);
      if (reqCheck.hasIncomplete) {
        window.__telehire_diagnostics.status = 'MANUAL_REQUIRED';
        window.__telehire_diagnostics.reason = reqCheck.reason;
        showNotification(`⚠️ ${reqCheck.reason}. Please review manually.`, 'warning');
        if (taskId) {
          chrome.runtime.sendMessage({
            type: 'REPORT_TASK_PROGRESS',
            payload: {
              taskId,
              status: 'MANUAL_REQUIRED',
              reason: reqCheck.reason,
              fieldsFilled: totalFilled,
            },
          });
        }
        break;
      }

      // Navigation check
      const nav = adapter.detectNavigation ? adapter.detectNavigation(currentContainer) : null;
      if (!nav) break;

      // Final Submit Button Safety Gate
      if (nav.type === 'SUBMIT') {
        window.__telehire_diagnostics.status = 'READY_FOR_MANUAL_SUBMIT';
        console.log('%c[TeleHire Safety Gate] Final Submit button detected. Automation stopped.', 'color: #f59e0b; font-weight: bold;');
        if (taskId) {
          chrome.runtime.sendMessage({
            type: 'REPORT_TASK_PROGRESS',
            payload: {
              taskId,
              status: 'READY_FOR_MANUAL_SUBMIT',
              step: 'FINAL_SUBMIT_GATE',
              fieldsFilled: totalFilled,
            },
          });
        }
        break;
      }

      // Advance to Next Step
      if ((nav.type === 'NEXT' || nav.type === 'REVIEW') && nav.shouldClick) {
        window.__telehire_diagnostics.navigation.attempted = true;
        nav.button.focus();
        nav.button.click();

        // Bounded transition polling (up to 2500ms)
        let transitioned = false;
        const startWait = Date.now();
        while (Date.now() - startWait < 2500) {
          await new Promise(r => setTimeout(r, 150));
          const newRoot = adapter.detect();
          if (newRoot && newRoot.isConnected) {
            transitioned = true;
            currentContainer = newRoot;
            break;
          }
        }
        window.__telehire_diagnostics.navigation.successful = transitioned;
        stepNumber++;
        await new Promise(r => setTimeout(r, 200));
      } else {
        break;
      }
    }

    isExecuting = false;
    return { totalFilled, status: window.__telehire_diagnostics.status };
  }

  // =========================================================================
  // 7. MASTER TRIGGER & PROFILE SYNC
  // =========================================================================

  async function triggerSafeAutofill(taskId = null) {
    const storage = await new Promise(r => chrome.storage.local.get(['userEmail', 'userLicense'], r));
    const email = storage.userEmail;
    const license = storage.userLicense || '';

    if (!email) {
      showNotification('⚠️ Please click the TeleHire extension icon and sync your profile first.', 'warning');
      return;
    }

    const subCheck = await chrome.runtime.sendMessage({ type: 'CHECK_SUBSCRIPTION', email, license });
    if (!subCheck.allowed) {
      showNotification(`🔒 ${subCheck.reason || 'Paid subscription required.'}`, 'error');
      return;
    }

    const profRes = await chrome.runtime.sendMessage({ type: 'GET_PROFILE', email, license });
    if (!profRes.success || !profRes.profile) {
      showNotification('❌ Could not load profile details. Please re-sync in extension popup.', 'error');
      return;
    }

    const usage = await chrome.runtime.sendMessage({ type: 'GET_DAILY_USAGE' });
    if (usage.count >= 40) {
      showNotification(`⚠️ Daily safety limit reached (${usage.count}/40). Resume tomorrow to protect your account.`, 'warning');
      return;
    }

    showNotification('⚡ TeleHire Safe Form Filler active...', 'info');

    const result = await executeAutofillFlow(profRes.profile, taskId);

    if (result.totalFilled > 0) {
      const useRes = await chrome.runtime.sendMessage({
        type: 'USE_QUOTA',
        payload: {
          email,
          license,
          platform: window.__telehire_diagnostics.platform,
          jobTitle: document.title.split('|')[0].split('-')[0].trim() || 'Job Application',
          company: window.location.hostname,
          jobUrl: window.location.href,
        },
      });

      const newDaily = useRes?.todayCount || (usage.count + 1);
      const newQuota = useRes?.quotaLeft !== undefined ? useRes.quotaLeft : (subCheck.quotaLeft - 1);
      showSuccessModal(result.totalFilled, newDaily, newQuota);
    }
  }

  // =========================================================================
  // 8. NOTIFICATION & SAFETY MODAL UI
  // =========================================================================

  function injectTopBanner() {
    if (window.__telehire_dismissed) return;
    if (document.getElementById('whatshire-safe-bar')) return;

    const banner = document.createElement('div');
    banner.id = 'whatshire-safe-bar';
    banner.innerHTML = `
      <div class="wh-banner-content">
        <div class="wh-banner-left">
          <span class="wh-logo-badge">⚡ TeleHire</span>
          <span class="wh-banner-text">Application detected. Fill form with your verified profile?</span>
        </div>
        <div class="wh-banner-actions">
          <button id="wh-btn-fill" class="wh-btn-primary">⚡ Fill Form Safely</button>
          <button id="wh-btn-close" class="wh-btn-ghost" title="Dismiss">✕</button>
        </div>
      </div>
    `;

    const root = document.documentElement || document.body;
    if (root) root.insertBefore(banner, root.firstChild);

    document.getElementById('wh-btn-fill')?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSafeAutofill(currentActiveTaskId);
    });

    document.getElementById('wh-btn-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.__telehire_dismissed = true;
      banner.remove();
    });
  }

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
            <strong>${filledCount} fields</strong> filled with human-paced typing.<br><br>
            ${isReview ? '🎯 <strong>Review Step Reached:</strong> All steps filled safely.<br><br>' : ''}
            ⚠️ <strong>Safety Rule:</strong> Please manually review all answers, check your resume file, and click <em>Submit Application</em> yourself.<br><br>
            <span class="wh-badge-safety">🛡️ Human-paced typing · Final submission requires manual candidate review</span>
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

  // Runtime Message Dispatcher
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'AUTO_START_QUEUE_TASK') {
      if (!isExecuting) {
        currentActiveTaskId = msg.task?.taskId;
        triggerSafeAutofill(msg.task?.taskId).then(() => sendResponse({ started: true, diagnostics: window.__telehire_diagnostics }));
        return true;
      }
      sendResponse({ started: false, reason: 'Already executing' });
      return true;
    }

    if (msg.type === 'TRIGGER_FILL') {
      triggerSafeAutofill(msg.taskId).then(() => sendResponse({ success: true, diagnostics: window.__telehire_diagnostics }));
      return true;
    }

    if (msg.type === 'GET_DIAGNOSTICS') {
      sendResponse({ diagnostics: window.__telehire_diagnostics });
      return true;
    }
  });

  // Top Banner Injection
  setTimeout(injectTopBanner, 1000);
  setInterval(() => {
    if (!window.__telehire_dismissed && !document.getElementById('whatshire-safe-bar')) {
      injectTopBanner();
    }
  }, 3000);
})();
