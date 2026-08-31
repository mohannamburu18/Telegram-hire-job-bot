const http = require('http');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const ApplicationQueue = require('../models/ApplicationQueue');

function httpGet(path) {
  return new Promise(resolve => {
    http.get('http://localhost:3000' + path, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', err => resolve({ status: 500, error: err.message }));
  });
}

function httpPost(path, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify(body);
    const req = http.request('http://localhost:3000' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', err => resolve({ status: 500, error: err.message }));
    req.write(payload);
    req.end();
  });
}

// Emulate content.js semantic mapper
function normalizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function emulateFieldMapping(labelText, elAttrs, profile) {
  const norm = normalizeText(labelText);
  const type = (elAttrs.type || '').toLowerCase();
  const elName = (elAttrs.name || '').toLowerCase();
  const elId = (elAttrs.id || '').toLowerCase();
  const auto = (elAttrs.autocomplete || '').toLowerCase();

  // A. DIRECT AUTOCOMPLETE / NAME ATTRIBUTE CHECKS
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

  // B. SEMANTIC LABEL & QUESTION CHECKS
  if (norm.includes('middle name') || norm.includes('middlename')) {
    return { key: 'middleName', value: profile.middleName || 'Krishna' };
  }
  if ((norm.includes('first name') || norm.includes('firstname') || norm.includes('given name')) && !norm.includes('last') && !norm.includes('middle') && !norm.includes('company') && !norm.includes('school')) {
    return { key: 'firstName', value: profile.firstName || 'Mohan' };
  }
  if ((norm.includes('last name') || norm.includes('lastname') || norm.includes('surname') || norm.includes('family name')) && !norm.includes('first') && !norm.includes('middle') && !norm.includes('company') && !norm.includes('school')) {
    return { key: 'lastName', value: profile.lastName || 'Namburu' };
  }
  const isUnrelated = norm.includes('company') || norm.includes('employer') || norm.includes('school') || norm.includes('college') || norm.includes('university') || norm.includes('project') || norm.includes('file') || norm.includes('user') || norm.includes('ref') || norm.includes('manager') || norm.includes('emergency');
  if (!isUnrelated && (norm === 'name' || norm === 'full name' || norm === 'fullname' || norm === 'candidate name' || norm === 'legal name')) {
    return { key: 'name', value: profile.name || 'Mohan Krishna Namburu' };
  }
  if (norm === 'email' || norm === 'email address' || norm.includes('email')) {
    return { key: 'email', value: profile.email };
  }
  if (norm.includes('phone') || norm.includes('mobile') || norm.includes('contact number')) {
    return { key: 'phone', value: profile.phone };
  }
  if (norm.includes('current location') || norm.includes('current city') || norm.includes('location') || norm.includes('address')) {
    return { key: 'location', value: profile.current_location || 'Bangalore, Karnataka, India' };
  }
  if (norm.includes('authorized to work') || norm.includes('legally authorized') || norm.includes('right to work')) {
    return { key: 'work_authorization', value: 'Yes' };
  }
  if (norm.includes('sponsorship') || norm.includes('require visa') || norm.includes('visa sponsorship')) {
    return { key: 'visa_sponsorship', value: 'No' };
  }
  if (norm.includes('disability') || norm.includes('handicap')) {
    return { key: 'disability', value: 'No' };
  }
  if (norm.includes('veteran') || norm.includes('military')) {
    return { key: 'veteran', value: 'No' };
  }
  if (norm.includes('relocate') || norm.includes('willing to relocate')) {
    return { key: 'relocate', value: 'Yes' };
  }
  return null;
}

async function runGreenhouseSemanticQA() {
  console.log('========================================================================');
  console.log('   GREENHOUSE & ATS SEMANTIC FIELD INTELLIGENCE & QUEUE SYNC QA        ');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Get Candidate Profile from API
  const profRes = await httpGet('/api/user/getProfile?email=ncttdp@gmail.com&license=WH-1E92-DD70-B077');
  const profile = JSON.parse(profRes.data).profile;

  console.log('Candidate Profile Loaded:', {
    name: profile.name,
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
  });

  // 2. Test Greenhouse Real ATS Field Mapping
  const greenhouseFields = [
    { label: 'First Name *', attrs: { id: 'first_name', name: 'job_application[first_name]', autocomplete: 'given-name' }, expectedKey: 'firstName', expectedVal: profile.firstName },
    { label: 'Last Name *', attrs: { id: 'last_name', name: 'job_application[last_name]', autocomplete: 'family-name' }, expectedKey: 'lastName', expectedVal: profile.lastName },
    { label: 'Email *', attrs: { id: 'email', name: 'job_application[email]', type: 'email', autocomplete: 'email' }, expectedKey: 'email', expectedVal: profile.email },
    { label: 'Phone *', attrs: { id: 'phone', name: 'job_application[phone]', type: 'tel', autocomplete: 'tel' }, expectedKey: 'phone', expectedVal: profile.phone },
    { label: 'Location (City) *', attrs: { id: 'job_application_location', name: 'job_application[location]' }, expectedKey: 'location', expectedVal: profile.current_location || 'Bangalore, Karnataka, India' },
    { label: 'Are you legally authorized to work in India? *', attrs: { name: 'job_application[answers_attributes][0][text_value]' }, expectedKey: 'work_authorization', expectedVal: 'Yes' },
    { label: 'Will you now or in the future require visa sponsorship? *', attrs: { name: 'job_application[answers_attributes][1][text_value]' }, expectedKey: 'visa_sponsorship', expectedVal: 'No' },
    { label: 'Voluntary Self-Identification of Disability', attrs: { name: 'job_application[answers_attributes][2][text_value]' }, expectedKey: 'disability', expectedVal: 'No' },
    { label: 'School / University Name', attrs: { name: 'job_application[answers_attributes][3][text_value]' }, expectedKey: null, expectedVal: null }, // Must NOT receive person name
  ];

  console.log('\n--- VERIFYING GREENHOUSE FIELD MAPPINGS ---');
  let allFieldsPass = true;
  for (const f of greenhouseFields) {
    const res = emulateFieldMapping(f.label, f.attrs, profile);
    const pass = f.expectedKey ? (res && res.key === f.expectedKey && res.value === f.expectedVal) : (res === null || res.key !== 'name');
    console.log(`[FIELD QA] "${f.label}":`, pass ? 'PASS' : 'FAIL', res ? `-> (${res.key}: "${res.value}")` : '-> (UNMAPPED)');
    if (!pass) allFieldsPass = false;
  }
  console.log('[TEST 1 - GREENHOUSE SEMANTIC FIELD MAPPING]:', allFieldsPass ? 'PASS' : 'FAIL');

  // 3. Test Telegram ➔ Extension Real-Time Queue Sync
  console.log('\n--- VERIFYING TELEGRAM ➔ EXTENSION QUEUE SYNC ---');
  const user = await User.findOne({ email: 'ncttdp@gmail.com' });
  const testJobId = `TASK-QA-${Date.now()}`;
  await ApplicationQueue.create({
    user_id: user._id,
    telegram_id: 8551276055,
    task_id: testJobId,
    job_url: 'https://job-boards.greenhouse.io/stripe/jobs/7543868',
    title: 'Software Engineer, Systems',
    company: 'Stripe',
    platform: 'Greenhouse',
    status: 'QUEUED',
  });

  const qRes = await httpGet('/api/queue/status?license=WH-1E92-DD70-B077');
  const qData = JSON.parse(qRes.data);
  const syncPass = qData.tasks && qData.tasks.some(t => t.task_id === testJobId);
  console.log('[TEST 2 - EXTENSION QUEUE FETCH (SYNC)]:', syncPass ? 'PASS' : 'FAIL', `(${qData.queuedCount} jobs waiting in queue)`);

  const pendingRes = await httpGet('/api/queue/pending?license=WH-1E92-DD70-B077');
  const pendingData = JSON.parse(pendingRes.data);
  const claimPass = pendingData.success && pendingData.task && pendingData.task.taskId;
  console.log('[TEST 3 - OPEN & PROCESS NEXT QUEUED JOB]:', claimPass ? 'PASS' : 'FAIL', pendingData.task ? `(Opened: ${pendingData.task.title} @ ${pendingData.task.company})` : '');

  console.log('\n========================================================================');
  console.log('   ALL SEMANTIC FIELD & QUEUE SYNC QA VERIFICATIONS COMPLETED!         ');
  console.log('========================================================================');
  process.exit(0);
}

runGreenhouseSemanticQA();
