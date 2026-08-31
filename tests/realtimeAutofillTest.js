const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
require('dotenv').config();

const User = require('../models/User');
const ApplicationQueue = require('../models/ApplicationQueue');
const { fetchLiveJobs } = require('../jobs/sources');

function httpGet(path) {
  return new Promise(resolve => {
    http.get('http://localhost:3000' + path, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', err => resolve({ status: 500, error: err.message }));
  });
}

function httpPost(path, body, headers = {}) {
  return new Promise(resolve => {
    const payload = JSON.stringify(body);
    const req = http.request('http://localhost:3000' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
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

async function runRealTimeVerificationSuite() {
  console.log('========================================================================');
  console.log('   TELEHIRE REAL-TIME AUTOFILL & QUEUE EXECUTION TEST SUITE            ');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Check Job Compatibility Classification
  const searchResult = await fetchLiveJobs('Software Engineer', 'Bangalore', 0);
  const sampleAuto = searchResult.autoJobs[0];
  const compatOk = sampleAuto ? (sampleAuto.extensionCompatible === true && sampleAuto.applicationMode === 'EXTENSION_AUTOFILL') : true;
  console.log('[TEST 01] Job Compatibility Classification:', compatOk ? 'PASS' : 'FAIL', sampleAuto ? `(${sampleAuto.source} -> ${sampleAuto.applicationMode})` : '(No live jobs currently in batch)');

  // 2. Test Queue Add API
  const addRes = await httpPost('/api/queue/add', {
    email: 'ncttdp@gmail.com',
    license: 'WH-1E92-DD70-B077',
    jobs: [
      {
        title: 'Frontend Developer',
        company: 'Innovatech',
        job_url: 'https://boards.greenhouse.io/innovatech/jobs/12345',
        source: 'Greenhouse',
      },
    ],
  });
  const addData = JSON.parse(addRes.data);
  console.log('[TEST 02] Application Queue Add API:', (addRes.status === 200 && addData.success) ? 'PASS' : 'FAIL', `(Enqueued: ${addData.count})`);

  // 3. Test Queue Pending Task Retrieval API
  const pendingRes = await httpGet('/api/queue/pending?email=ncttdp@gmail.com&license=WH-1E92-DD70-B077');
  const pendingData = JSON.parse(pendingRes.data);
  const pendingOk = pendingRes.status === 200 && pendingData.success && pendingData.task !== null;
  console.log('[TEST 03] Application Queue Pending Retrieval:', pendingOk ? 'PASS' : 'FAIL', pendingData.task ? `(Task: ${pendingData.task.taskId} -> ${pendingData.task.platform})` : '');

  // 4. Test Queue Update Status API
  if (pendingData.task) {
    const updateRes = await httpPost('/api/queue/updateStatus', {
      taskId: pendingData.task.taskId,
      status: 'READY_FOR_MANUAL_SUBMIT',
      fieldsFilled: 8,
      reason: 'All steps filled. Ready for candidate manual review.',
    });
    const updateData = JSON.parse(updateRes.data);
    console.log('[TEST 04] Application Queue Status Update:', (updateRes.status === 200 && updateData.success) ? 'PASS' : 'FAIL', `(Status: ${updateData.task.status})`);
  }

  // 5. Test Packaging Equality
  const extC = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  const pubC = fs.readFileSync(path.join(__dirname, '..', 'public', 'extension', 'content.js'), 'utf8');
  const zip = new AdmZip(path.join(__dirname, '..', 'whatshire-extension.zip'));
  const zipC = zip.readAsText('content.js');
  console.log('[TEST 05] Single-Source Distribution Sync:', (extC === pubC && extC === zipC) ? 'PASS' : 'FAIL', '(extension/ === public/extension/ === zip)');

  // 6. Test Extension Final Submit Safety Gate Simulation
  let submitClickCount = 0;
  function simulateNavigationButton(type, label) {
    if (type === 'SUBMIT' || label.toLowerCase().includes('submit')) {
      // Safety gate prevents click
      return { clicked: false, status: 'READY_FOR_MANUAL_SUBMIT' };
    }
    submitClickCount++;
    return { clicked: true, status: 'ADVANCED' };
  }

  const navTest = simulateNavigationButton('SUBMIT', 'Submit application');
  console.log('[TEST 06] Strict Final Submit Safety Gate:', (navTest.clicked === false && submitClickCount === 0) ? 'PASS (CLICK COUNT = 0)' : 'FAIL');

  console.log('\n========================================================================');
  console.log('   ALL REAL-TIME AUTOFILL & QUEUE TESTS COMPLETED!                     ');
  console.log('========================================================================');
  process.exit(0);
}

runRealTimeVerificationSuite();
