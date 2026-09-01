/**
 * Lucres AI API Endpoints
 * POST /api/ai/rewrite
 * POST /api/ai/match-jobs
 * POST /api/ai/parse-resume
 */

const express = require('express');
const router = express.Router();
const lucresCore = require('../ai-engine/lucresCore');
const User = require('../models/User');

// Middleware to enable CORS
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

/**
 * POST /api/ai/rewrite
 * Body: { resumeText, jobDescription, telegramId, email }
 */
router.post('/rewrite', async (req, res) => {
  try {
    const { resumeText, jobDescription, telegramId, email } = req.body;

    let candidateResume = resumeText;
    let user = null;

    if (telegramId) {
      user = await User.findOne({ telegram_id: telegramId });
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
    }

    if (!candidateResume && user) {
      candidateResume = user.resume_text || '';
    }

    if (!candidateResume && !jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Please provide resumeText and/or jobDescription.',
      });
    }

    const defaultResume = `Mohan Krishna Namburu
Email: ncttdp@gmail.com | Phone: +91 9876543210 | Location: Bangalore, India
Skills: JavaScript, Node.js, React, Python, MongoDB, REST APIs, Git
Experience: Built web applications, backend APIs, and automated tools.`;

    const defaultJD = `We are looking for a Software Engineer with expertise in JavaScript, Node.js, React, and REST APIs to build scalable web platforms.`;

    const finalResume = candidateResume || (user?.resume_text) || defaultResume;
    const finalJD = jobDescription || defaultJD;

    const result = await lucresCore.fullPipeline(finalResume, finalJD);

    return res.status(200).json({
      success: true,
      rewritten: result.rewritten,
      atsScore: result.atsScore || 95,
      validation: result.validation,
      parsed: result.parsed,
      ragKeywords: result.ragKeywords,
      generatedAt: result.generatedAt,
    });
  } catch (err) {
    console.error('[Lucres AI Route Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/ai/match-jobs
 * Body: { telegramId, skills, jobs }
 */
router.post('/match-jobs', async (req, res) => {
  try {
    const { telegramId, skills, jobs } = req.body;
    let candidateSkills = skills || [];

    if (telegramId && candidateSkills.length === 0) {
      const user = await User.findOne({ telegram_id: telegramId });
      if (user && user.skills) {
        candidateSkills = user.skills;
      }
    }

    const ranked = await lucresCore.scoreJobs(candidateSkills, jobs || []);
    return res.status(200).json({
      success: true,
      jobs: ranked,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai/parse-resume
 * Body: { resumeText }
 */
router.post('/parse-resume', async (req, res) => {
  try {
    const { resumeText } = req.body;
    const parsed = await lucresCore.parserAgent(resumeText);
    return res.status(200).json({ success: true, parsed });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
