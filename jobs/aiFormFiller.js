const axios = require('axios');

// In-memory cache for AI answered questions (key: questionText + userId)
const aiAnswerCache = new Map();

/**
 * AI Truthful Question Answerer
 * Uses Groq -> Gemini -> OpenRouter -> Rule-based fallback
 */
async function aiAnswerQuestion(questionText = '', userProfile = {}, options = []) {
  if (!questionText || questionText.trim() === '') return '';

  const cacheKey = `${userProfile.email || 'anon'}_${questionText.toLowerCase().trim()}`;
  if (aiAnswerCache.has(cacheKey)) {
    return aiAnswerCache.get(cacheKey);
  }

  const profileSummary = {
    name: userProfile.name || 'Candidate',
    email: userProfile.email || '',
    phone: userProfile.phone || '',
    current_location: userProfile.current_location || userProfile.location || 'India',
    experience_years: userProfile.experience_years || '0-1 years',
    skills: Array.isArray(userProfile.skills) ? userProfile.skills.slice(0, 15).join(', ') : 'Software Development',
    education: userProfile.education || 'Bachelor of Technology in Computer Science',
    notice_period: userProfile.notice_period || 'Immediate / 15 Days',
    expected_ctc: userProfile.expected_salary || userProfile.expected_ctc || 'As per industry standards',
    linkedin: userProfile.linkedin || 'https://linkedin.com',
    github: userProfile.github || 'https://github.com',
    citizenship: 'Indian Citizen',
    work_authorized_india: 'Yes',
    sponsorship_required: 'No',
  };

  const systemPrompt = `You are a truthful, professional job application assistant filling ATS forms for a candidate.
RULES:
1. NEVER lie, NEVER invent fake experience, and NEVER inflate skills.
2. If question asks about India work authorization and user is in India -> Answer "Yes".
3. If question asks about visa sponsorship in India -> Answer "No".
4. If question asks for salary/CTC -> Answer "${profileSummary.expected_ctc}".
5. If question asks for notice period -> Answer "${profileSummary.notice_period}".
6. If question asks for location -> Answer "${profileSummary.current_location}".
7. If options are provided (${options.join(', ')}), pick the single most accurate option from the list.
8. Output ONLY the concise final answer (under 20 words) with NO markdown, NO quotes, NO explanation.`;

  const userPrompt = `Question: "${questionText}"
Available Options (if any): [${options.join(', ')}]
Candidate Profile: ${JSON.stringify(profileSummary)}
Answer:`;

  // 1. Try Groq (Llama-3.1-8b)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 60,
      }, {
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        timeout: 4000,
      });

      const ans = res.data?.choices?.[0]?.message?.content?.trim();
      if (ans) {
        aiAnswerCache.set(cacheKey, ans);
        return ans;
      }
    } catch (_) {}
  }

  // 2. Try Gemini (gemini-1.5-flash)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: { maxOutputTokens: 60, temperature: 0.1 }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 4000,
      });

      const ans = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (ans) {
        aiAnswerCache.set(cacheKey, ans);
        return ans;
      }
    } catch (_) {}
  }

  // 3. Try OpenRouter (GPT-3.5 / Llama)
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'meta-llama/llama-3-8b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 60,
      }, {
        headers: { 'Authorization': `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
        timeout: 4000,
      });

      const ans = res.data?.choices?.[0]?.message?.content?.trim();
      if (ans) {
        aiAnswerCache.set(cacheKey, ans);
        return ans;
      }
    } catch (_) {}
  }

  // 4. Rule-Based Fallback
  const qLower = questionText.toLowerCase();
  let fallbackAns = 'Yes';

  if (qLower.includes('sponsor') || qLower.includes('visa required')) {
    fallbackAns = 'No';
  } else if (qLower.includes('authorized') || qLower.includes('eligible to work') || qLower.includes('legal')) {
    fallbackAns = 'Yes';
  } else if (qLower.includes('notice') || qLower.includes('how soon')) {
    fallbackAns = profileSummary.notice_period || 'Immediate / 15 Days';
  } else if (qLower.includes('salary') || qLower.includes('ctc') || qLower.includes('compensation')) {
    fallbackAns = profileSummary.expected_ctc || 'As per industry standards';
  } else if (qLower.includes('experience') || qLower.includes('years of')) {
    fallbackAns = profileSummary.experience_years || '0-1 years';
  } else if (qLower.includes('location') || qLower.includes('city') || qLower.includes('country')) {
    fallbackAns = profileSummary.current_location || 'India';
  } else if (qLower.includes('linkedin')) {
    fallbackAns = profileSummary.linkedin;
  } else if (qLower.includes('github') || qLower.includes('portfolio')) {
    fallbackAns = profileSummary.github;
  } else if (qLower.includes('gender') || qLower.includes('pronoun')) {
    fallbackAns = 'Decline to self-identify';
  }

  aiAnswerCache.set(cacheKey, fallbackAns);
  return fallbackAns;
}

module.exports = {
  aiAnswerQuestion,
};

