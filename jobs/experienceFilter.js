/**
 * Production Experience Filter for Job Postings
 * Guarantees zero senior / staff / level III jobs for 0-1 year fresher candidates
 */

function isFresherJob(title = '', description = '', userExpYears = 0) {
  const titleL = (title || '').toLowerCase();
  const descL = (description || '').toLowerCase();
  const combined = `${titleL} ${descL}`;

  const numExp = typeof userExpYears === 'number' ? userExpYears : (parseFloat(userExpYears) || 0);

  // If user is 0-1 years (Fresher/Junior)
  if (numExp <= 1) {
    // 1. HARD SENIOR PATTERNS IN TITLE OR DESCRIPTION
    const seniorRejectPatterns = [
      /\biii\b/i,
      /\bdeveloper\s*iii\b/i,
      /\bengineer\s*iii\b/i,
      /\bsde\s*iii\b/i,
      /\bsde\s*3\b/i,
      /\bdeveloper\s*3\b/i,
      /\bengineer\s*3\b/i,
      /\bii\b.*engineer/i,
      /\bdeveloper\s*ii\b/i,
      /\bengineer\s*ii\b/i,
      /\bsde\s*ii\b/i,
      /\bsde\s*2\b/i,
      /\bsr\.\b/i,
      /\bsr\b/i,
      /\bsenior\b/i,
      /\bstaff\b/i,
      /\bprincipal\b/i,
      /\blead\b/i,
      /\barchitect\b/i,
      /\bmanager\b/i,
      /\bhead of\b/i,
      /\bdirector\b/i,
      /\bvp\b/i,
      /\bl[4-6]\b/i,
      /\blevel\s*[4-6]\b/i,
      /\b5\+\s*years?/i,
      /\b6\+\s*years?/i,
      /\b7\+\s*years?/i,
      /\b8\+\s*years?/i,
      /\b10\+\s*years?/i,
      /\b[3-9]\s*-\s*[5-9]\s*years?/i,
      /\b[4-9]\s*-\s*[6-9]\s*years?/i,
      /\b5-8\s*years?/i,
      /\b3-5\s*years?/i,
      /\b4-6\s*years?/i,
      /\b3-8\s*years?/i,
      /\b[3-9]\s*\+\s*years?.*(?:exp|experience)/i,
      /\b[5-9]\s*years?\s*(?:of)?\s*(?:exp|experience)/i,
      /\b8\+/i,
      /\b7\+/i
    ];

    // Check title specifically for any senior title flags
    if (
      titleL.endsWith(' iii') ||
      titleL.includes(' iii ') ||
      titleL.includes(' - iii') ||
      titleL.includes(' 3') ||
      titleL.includes(' senior') ||
      titleL.startsWith('senior ') ||
      titleL.includes(' sr ') ||
      titleL.startsWith('sr. ') ||
      titleL.startsWith('sr ') ||
      titleL.includes(' staff') ||
      titleL.includes(' principal') ||
      titleL.includes(' lead ') ||
      titleL.startsWith('lead ') ||
      titleL.includes(' architect') ||
      titleL.includes(' manager') ||
      titleL.includes(' director') ||
      titleL.includes(' head of')
    ) {
      return { keep: false, reason: `REJECT senior title pattern for 0-1 yr user: "${title}"`, score: -20 };
    }

    // Check combined text against all senior patterns
    for (const pat of seniorRejectPatterns) {
      if (pat.test(combined)) {
        return { keep: false, reason: `REJECT senior pattern ${pat} for 0-1 yr user: "${title}"`, score: -15 };
      }
    }

    // 2. POSITIVE FRESHER SIGNALS
    const fresherKeepPatterns = [
      '0-1', '0 - 1', '0 to 1', '0-2', '0 - 2', '0 to 2', 'fresher', 'entry level', 'entry-level',
      'new grad', 'graduate trainee', 'trainee', 'intern', 'junior', 'associate', 'sde i', 'sde 1',
      'software engineer i', 'engineer i', '0-1 years', '0-2 years', '0 years', '1 year', 'upto 1 year',
      'up to 2 years', '0 to 1 year', '0 to 2 years', 'college graduate', 'campus'
    ];

    const hasFresherSignal = fresherKeepPatterns.some(k => combined.includes(k));
    if (hasFresherSignal) {
      return { keep: true, reason: `KEEP fresher signal for 0-1 yr: "${title}"`, score: 25 };
    }

    // 3. GENERIC TITLES (Software Engineer, Developer) WITHOUT SENIOR OR YEARS REQUIREMENT
    const isGeneric = (
      titleL.trim() === 'software engineer' ||
      titleL.trim() === 'software developer' ||
      titleL.trim() === 'frontend developer' ||
      titleL.trim() === 'backend developer' ||
      titleL.trim() === 'full stack developer' ||
      titleL.trim() === 'web developer' ||
      titleL.trim() === 'python developer' ||
      titleL.trim() === 'java developer' ||
      titleL.trim() === 'react developer' ||
      titleL.includes('software engineer - bangalore') ||
      (!combined.match(/\d+\+?\s*years?/) && (titleL.includes('software') || titleL.includes('developer') || titleL.includes('engineer')))
    );

    if (isGeneric) {
      return { keep: true, reason: `KEEP generic title for 0-1 yr: "${title}"`, score: 10 };
    }

    // 4. Default: If no years mentioned at all in title+desc and no senior pattern, keep as potential fresher
    if (!combined.match(/\d+\s*years?/)) {
      return { keep: true, reason: `KEEP no years mentioned, assume fresher friendly: "${title}"`, score: 5 };
    }

    return { keep: false, reason: `No fresher signal for 0-1 yr: "${title}"`, score: -5 };
  }

  // If user has 2-3 years experience
  if (numExp <= 3) {
    for (const pat of [/\b[5-9]\+\s*years?/i, /\b10\+/i, /\bstaff\b/i, /\bprincipal\b/i, /\barchitect\b/i, /\biii\b.*5\+/i]) {
      if (pat.test(combined)) {
        return { keep: false, reason: `REJECT 5+ for 1-3 yr: ${pat}`, score: -10 };
      }
    }
    return { keep: true, reason: 'KEEP for 1-3 yr user', score: 10 };
  }

  // Experienced user
  return { keep: true, reason: 'KEEP for experienced user', score: 5 };
}

module.exports = {
  isFresherJob,
};
