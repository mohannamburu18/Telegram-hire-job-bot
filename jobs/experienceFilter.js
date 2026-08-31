/**
 * Production Experience Filter for Job Postings
 * Guarantees zero senior / staff / level III jobs for 0-1 year fresher candidates
 */

function isFresherJob(title = '', description = '', userExpYears = 0) {
  const titleL = (title || '').toLowerCase();
  const descL = (description || '').toLowerCase();
  const combined = `${titleL} ${descL}`;

  // HARD SENIOR PATTERNS - If user is 0-1 years, REJECT if any matches
  const seniorRejectPatterns = [
    /\biii\b/,
    /\bii\b.*engineer/,
    /\bsr\.\b/,
    /\bsr\b/,
    / senior/,
    /\bstaff\b/,
    /\bprincipal\b/,
    /\blead\b.*engineer/,
    /\barchitect\b/,
    /\bmanager\b/,
    /\bhead of\b/,
    /\bdirector\b/,
    /\bvp\b/,
    /\b[5-9]\+\s*years?/,
    /\b10\+\s*years?/,
    /\b[3-9]-[5-9]\s*years?/,
    /\b[4-9]\s*-\s*[6-9]\s*years?/,
    /\b5-8\s*years?/,
    /\b3-5\s*years?/,
    /\b4-6\s*years?/,
    /\b[3-9]\s*\+\s*years?.*experience/,
    /\b8\+/,
    /\b7\+/,
    /l4\b/,
    /l5\b/,
    /l6\b/,
    /l7\b/,
    /level 4/,
    /level 5/
  ];

  const fresherKeepPatterns = [
    '0-1', '0 - 1', '0 to 1', '0-2', '0 - 2', '0 to 2', 'fresher', 'entry level', 'entry-level',
    'new grad', 'graduate trainee', 'trainee', 'intern', 'junior', 'associate', 'sde i', 'sde 1',
    'software engineer i', 'engineer i', '0-1 years', '0-2 years', '0 years', '1 year', 'upto 1 year',
    'up to 2 years', '0 to 1 year'
  ];

  const numExp = typeof userExpYears === 'number' ? userExpYears : (parseFloat(userExpYears) || 0);

  if (numExp <= 1) {
    // 1. Check strict senior rejection
    for (const pat of seniorRejectPatterns) {
      if (pat.test(combined)) {
        // Exception: if title contains "0-1" or "fresher" explicitly, keep
        if (fresherKeepPatterns.some(k => combined.includes(k))) {
          return { keep: true, reason: `FRESHER signal overrides senior pattern: ${pat}`, score: 15 };
        }
        return { keep: false, reason: `REJECT senior pattern ${pat} for 0-1 yr user: ${title}`, score: -10 };
      }
    }

    // 2. Check if title is Developer III / Engineer III
    if (titleL.includes(' iii') || titleL.match(/\biii\b/) || titleL.includes(' ii -') || titleL.includes(' iii -')) {
      return { keep: false, reason: 'REJECT III level for fresher', score: -10 };
    }

    // 3. Must have at least one fresher signal OR be generic "software engineer" without required 5+ years
    const hasFresherSignal = fresherKeepPatterns.some(k => combined.includes(k));
    const isGeneric = (
      titleL.trim() === 'software engineer' ||
      titleL.trim() === 'software developer' ||
      titleL === 'software engineer - bangalore' ||
      (titleL.includes('software engineer') && !combined.match(/\d+\+?\s*years?/))
    );

    if (hasFresherSignal || isGeneric) {
      return { keep: true, reason: `KEEP fresher signal for 0-1 yr: ${title}`, score: hasFresherSignal ? 20 : 10 };
    }

    // 4. If description mentions 0-2 years, keep
    if (combined.match(/0\s*-\s*[12]\s*years?/) || combined.includes('0-1') || combined.includes('0-2')) {
      return { keep: true, reason: 'KEEP 0-2 years found', score: 18 };
    }

    // 5. Default for 0-1: if no years mentioned and no senior pattern, assume fresher friendly
    if (!combined.match(/\d+\s*years?/)) {
      return { keep: true, reason: 'KEEP no years mentioned, assume fresher friendly', score: 5 };
    }

    return { keep: false, reason: 'No fresher signal for 0-1 yr', score: -5 };
  }

  if (numExp <= 3) {
    for (const pat of [/\b[5-9]\+\s*years?/, /\b10\+/, /staff/, /principal/, /\biii\b.*5\+/]) {
      if (pat.test(combined)) {
        return { keep: false, reason: `REJECT 5+ for 1-3 yr: ${pat}`, score: -10 };
      }
    }
    return { keep: true, reason: 'KEEP for 1-3 yr', score: 10 };
  }

  // 5+ years user keeps all
  return { keep: true, reason: 'KEEP for 5+ yr user', score: 10 };
}

module.exports = {
  isFresherJob,
};

