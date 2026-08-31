const pdfParse = require('pdf-parse');

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
 * Parse PDF buffer and extract key details: text, email, phone, skills, detected name
 * @param {Buffer} dataBuffer
 * @param {string} fallbackName
 * @returns {Promise<{text: string, email: string|null, phone: string|null, skills: string[], name: string}>}
 */
async function parseResumePdf(dataBuffer, fallbackName = 'Job Seeker') {
  try {
    const data = await pdfParse(dataBuffer);
    const text = data.text || '';
    
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
      // Find candidate string with 10-15 digits
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
      // Exact word boundary regex check
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:\\b|\\s)${escaped}(?:\\b|\\s|[,;.:])`, 'i');
      if (regex.test(lowerText)) {
        // Capitalize nicely
        const formatted = skill
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        matchedSkills.add(formatted);
      }
    }

    // 4. Extract Name
    let detectedName = fallbackName;
    for (const line of lines.slice(0, 8)) {
      // If line is 2-4 words, does not contain @ or http, doesn't contain Resume/Curriculum
      const cleaned = line.replace(/[^a-zA-Z\s]/g, '').trim();
      const words = cleaned.split(/\s+/);
      const isResumeHeader = /resume|curriculum|vitae|profile|page|contact|email|phone/i.test(line);
      if (!isResumeHeader && words.length >= 2 && words.length <= 4 && cleaned.length >= 4 && cleaned.length <= 35) {
        detectedName = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        break;
      }
    }

    return {
      text,
      email,
      phone,
      skills: Array.from(matchedSkills),
      name: detectedName,
    };
  } catch (error) {
    console.error('[PDF PARSE ERROR]:', error.message);
    throw new Error('Failed to parse resume PDF. Please ensure it is a valid PDF document.');
  }
}

module.exports = {
  parseResumePdf,
  SKILL_KEYWORDS,
};

