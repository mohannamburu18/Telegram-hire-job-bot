const pdfParse = require('pdf-parse');
const lucresCore = require('../ai-engine/lucresCore');

// Comprehensive list of technical and job-related skills to match against
const SKILL_KEYWORDS = [
  'python', 'java', 'golang', 'go', 'c++', 'c#', 'rust', 'php', 'ruby', 'swift', 'kotlin',
  'javascript', 'typescript', 'react', 'react native', 'next.js', 'vue', 'angular', 'svelte',
  'node', 'node.js', 'express', 'nestjs', 'django', 'flask', 'fastapi', 'spring', 'spring boot',
  'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'dynamodb', 'cassandra', 'elasticsearch',
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins', 'ci/cd', 'git', 'linux', 'bash',
  'aws', 'azure', 'gcp', 'google cloud', 'serverless', 'lambda', 'graphql', 'rest api', 'microservices',
  'tailwind', 'css', 'html', 'sass', 'redux', 'mobx', 'zustand',
  'machine learning', 'deep learning', 'nlp', 'computer vision', 'ai', 'data science', 'pandas', 'numpy', 'pytorch', 'tensorflow'
];

/**
 * Parse PDF buffer and extract key details using Lucres AI Parser Agent with regex fallback
 * @param {Buffer} dataBuffer
 * @param {string} fallbackName
 * @returns {Promise<{text: string, email: string|null, phone: string|null, skills: string[], name: string, parsed: object}>}
 */
async function parseResumePdf(dataBuffer, fallbackName = 'Job Seeker') {
  try {
    const data = await pdfParse(dataBuffer);
    const text = data.text || '';

    // Run Lucres AI Parser Agent
    let aiParsed = null;
    try {
      aiParsed = await lucresCore.parserAgent(text);
    } catch (_) {}

    if (aiParsed && aiParsed.name && aiParsed.email) {
      return {
        text,
        name: aiParsed.name || fallbackName,
        email: aiParsed.email,
        phone: aiParsed.phone,
        skills: Array.isArray(aiParsed.skills) && aiParsed.skills.length > 0 ? aiParsed.skills : ['JavaScript', 'Node.js', 'React'],
        experience_years: aiParsed.experience_years || '0-1',
        parsed: aiParsed,
      };
    }

    // Clean text lines
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // 1. Extract Email
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
    const emailMatch = text.match(emailRegex);
    const email = emailMatch ? emailMatch[1].toLowerCase() : null;

    // 2. Extract Phone
    const phoneRegex = /(?:(?:\+|00)\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}/g;
    const phoneMatches = text.match(phoneRegex);
    let phone = null;
    if (phoneMatches) {
      for (const p of phoneMatches) {
        const digitsOnly = p.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
          phone = p.trim();
          break;
        }
      }
    }

    // 3. Extract Skills
    const matchedSkills = new Set();
    const lowerText = text.toLowerCase();
    for (const skill of SKILL_KEYWORDS) {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:\\b|\\s)${escaped}(?:\\b|\\s|[,;.:])`, 'i');
      if (regex.test(lowerText)) {
        const formatted = skill
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        matchedSkills.add(formatted);
      }
    }

    // 4. Extract Name
    let detectedName = fallbackName;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line.length >= 3 && line.length <= 40) {
        if (!line.includes('@') && !line.match(/\d/) && !line.includes('http') && !line.includes('Resume') && !line.includes('Curriculum')) {
          detectedName = line;
          break;
        }
      }
    }

    return {
      text,
      email,
      phone,
      skills: Array.from(matchedSkills),
      name: detectedName,
      parsed: aiParsed || {},
    };
  } catch (err) {
    console.error('PDF parsing error:', err.message);
    return {
      text: '',
      email: null,
      phone: null,
      skills: [],
      name: fallbackName,
      parsed: {},
    };
  }
}

module.exports = {
  parseResumePdf,
  SKILL_KEYWORDS,
};
