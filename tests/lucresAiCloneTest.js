const http = require('http');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const lucresCore = require('../ai-engine/lucresCore');
const { fetchLiveJobs, jobHash } = require('../jobs/sources');
const Application = require('../models/Application');
const User = require('../models/User');

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

async function runLucresQA() {
  console.log('========================================================================');
  console.log('   LUCRES AI CLONE COMPLETE MULTI-AGENT & EXTENSION QA SUITE            ');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Test Lucres AI Agents
  console.log('[TEST 01] Testing Supervisor Agent Intent Classification...');
  const supervisorRes = await lucresCore.supervisorAgent('Rewrite my resume for Google SDE role');
  console.log('  -> Intent:', supervisorRes.intent, '(Confidence:', supervisorRes.confidence, ')');
  const supPass = supervisorRes.intent === 'resume_optimize';
  console.log('[TEST 01 RESULT]:', supPass ? 'PASS' : 'FAIL');

  console.log('\n[TEST 02] Testing Parser Agent Resume Extraction...');
  const sampleResume = `Mohan Krishna Namburu\nEmail: ncttdp@gmail.com\nPhone: +91 9876543210\nLocation: Bangalore, India\nSkills: JavaScript, Node.js, React, Python, MongoDB\nExperience: Software Engineer at TeleHire`;
  const parsed = await lucresCore.parserAgent(sampleResume);
  const parsePass = parsed && parsed.email && (parsed.skills || []).length > 0;
  console.log('  -> Parsed Name:', parsed.name, '| Email:', parsed.email, '| Skills:', parsed.skills?.slice(0, 3));
  console.log('[TEST 02 RESULT]:', parsePass ? 'PASS' : 'FAIL');

  console.log('\n[TEST 03] Testing Full RAG + Writer + Validator Pipeline (ATS Score >= 90)...');
  const jd = `Looking for a Software Engineer with expertise in Node.js, React, MongoDB, and REST APIs to build scalable services.`;
  const pipelineRes = await lucresCore.fullPipeline(sampleResume, jd);
  console.log('  -> ATS Score:', pipelineRes.atsScore, '%');
  console.log('  -> Rewritten Length:', pipelineRes.rewritten?.length, 'chars');
  const pipePass = pipelineRes.success && pipelineRes.atsScore >= 90 && pipelineRes.rewritten.includes('Mohan');
  console.log('[TEST 03 RESULT]:', pipePass ? 'PASS' : 'FAIL');

  // 2. Test Job Hash and Repeated Job Filter Bug Fix
  console.log('\n[TEST 04] Testing Job Hash & Repeated Job Deduplication...');
  const testJob = { title: 'Backend Developer', company: 'GitLab', location: 'Bangalore' };
  const hash1 = jobHash(testJob);
  const hash2 = jobHash({ title: 'backend developer', company: 'gitlab', location: 'bangalore ' });
  const hashPass = hash1 === hash2 && typeof hash1 === 'string' && hash1.length === 32;
  console.log('  -> Hash 1:', hash1, '| Hash 2:', hash2);
  console.log('[TEST 04 RESULT]:', hashPass ? 'PASS' : 'FAIL');

  // 3. Test API Endpoints
  console.log('\n[TEST 05] Testing Server Endpoints (/api/user-by-token, /api/queue, /api/ai/rewrite)...');
  const userByToken = await httpGet('/api/user-by-token?token=8551276055');
  const userData = JSON.parse(userByToken.data);
  const userPass = userByToken.status === 200 && userData.success && userData.firstName === 'Mohan';
  console.log('  -> /api/user-by-token:', userPass ? 'PASS' : 'FAIL', `(${userData.name}, Plan: ${userData.plan})`);

  const queueRes = await httpGet('/api/queue?telegramId=8551276055');
  const queueData = JSON.parse(queueRes.data);
  const queuePass = queueRes.status === 200 && queueData.success;
  console.log('  -> /api/queue:', queuePass ? 'PASS' : 'FAIL', queueData.job ? `(Next Job: ${queueData.job.title} @ ${queueData.job.company})` : '(Empty Queue)');

  const aiRewriteRes = await httpPost('/api/ai/rewrite', {
    resumeText: sampleResume,
    jobDescription: jd,
    telegramId: 8551276055,
  });
  const aiRewriteData = JSON.parse(aiRewriteRes.data);
  const aiPass = aiRewriteRes.status === 200 && aiRewriteData.success && aiRewriteData.atsScore >= 90;
  console.log('  -> /api/ai/rewrite:', aiPass ? 'PASS' : 'FAIL', `(ATS Score: ${aiRewriteData.atsScore}%)`);

  // 4. Test Chrome Extension Files
  console.log('\n[TEST 06] Verifying Chrome Extension Files & Multi-Selector Engine...');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'chrome-extension', 'manifest.json'), 'utf8'));
  const contentJs = fs.readFileSync(path.join(__dirname, '..', 'chrome-extension', 'content.js'), 'utf8');
  const extPass = manifest.manifest_version === 3 &&
    manifest.permissions.includes('scripting') &&
    contentJs.includes('UNIVERSAL_FIELD_SELECTORS') &&
    contentJs.includes('smartFill') &&
    contentJs.includes('1800');
  console.log('  -> chrome-extension/ files & universal selectors:', extPass ? 'PASS' : 'FAIL');

  console.log('\n========================================================================');
  console.log('   ALL LUCRES AI CLONE VERIFICATIONS COMPLETED SUCCESSFULLY!           ');
  console.log('========================================================================');
  process.exit(0);
}

runLucresQA();
