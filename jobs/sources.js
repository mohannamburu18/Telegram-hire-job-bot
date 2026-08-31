const axios = require('axios');
const cheerio = require('cheerio');
const { isFresherJob } = require('./experienceFilter');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function headCheck(url) {
  try {
    const r = await axios.head(url, { timeout: 4000, headers: HEADERS, validateStatus: s => s < 400 });
    return r.status >= 200 && r.status < 400;
  } catch {
    try {
      const r = await axios.get(url, { timeout: 4000, headers: HEADERS, validateStatus: s => s < 400 });
      return r.status >= 200 && r.status < 400;
    } catch {
      // For ATS and major job portals, preserve link if HEAD failed due to bot block
      return true;
    }
  }
}

function locationScore(jobLoc, searchLoc) {
  const jl = (jobLoc || '').toLowerCase();
  const sl = (searchLoc || '').toLowerCase();
  if (sl.includes('bangalore') || sl.includes('bengaluru')) {
    if (jl.includes('bangalore') || jl.includes('bengaluru')) return 20;
    if (jl.includes('india')) return 10;
    if (jl.includes('remote') && (jl.includes('india') || jl.includes('apac') || jl.includes('asia') || jl.includes('bangalore'))) return 12;
    if (jl.includes('remote')) return 6;
    if (jl.includes('hyderabad') || jl.includes('pune') || jl.includes('mumbai') || jl.includes('delhi') || jl.includes('chennai') || jl.includes('ncr')) return 8;
    if (jl.includes('united kingdom') || jl.includes('uk') || jl.includes('usa') || jl.includes('united states') || jl.includes('london')) return -10;
    return 0;
  }
  return 10;
}

function titleMatch(title, role) {
  const tl = (title || '').toLowerCase();
  const rl = (role || '').toLowerCase();
  const keywords = rl.split(/\s+/).filter(w => w.length > 2);
  
  if (rl.includes('software engineer') || rl.includes('developer') || rl.includes('sde')) {
    return tl.includes('software') || tl.includes('engineer') || tl.includes('developer') || tl.includes('sde') || tl.includes('frontend') || tl.includes('backend') || tl.includes('fullstack') || tl.includes('programmer');
  }
  if (rl.includes('python')) return tl.includes('python');
  if (rl.includes('react')) return tl.includes('react');
  if (rl.includes('node')) return tl.includes('node');
  if (rl.includes('java')) return tl.includes('java');
  
  return keywords.some(k => tl.includes(k)) || tl.includes(rl);
}

function formatCompanyName(name = '') {
  if (!name) return 'Tech Company';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// =========================================================================
// AUTO SAFE SOURCES (Workable, Lever, Greenhouse easy, Ashby)
// =========================================================================

async function fetchWorkableLive(role, location, userExp) {
  const companies = [
    'razorpay', 'meesho', 'swiggy', 'cred', 'urbancompany', 'postman', 'browserstack',
    'chargebee', 'clevertap', 'freshworks', 'gupshup', 'zepto', 'blinkit', 'delhivery',
    'phonepe', 'groww', 'upstox', 'smallcase', 'acko', 'slice', 'myntra', 'nykaa',
    'leverageedu', 'teachmint', 'classplus', 'growthschool', 'khatabook', 'bharatpe',
    'paytm', 'flipkart'
  ];
  let all = [];
  const chunks = [];
  for (let i = 0; i < companies.length; i += 5) chunks.push(companies.slice(i, i + 5));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(c =>
        axios.get(`https://apply.workable.com/api/v3/accounts/${c}/jobs?details=true`, { timeout: 8000, headers: HEADERS })
          .then(r => r.data.jobs || r.data.results || r.data || [])
          .catch(() => [])
      )
    );

    results.forEach((res, idx) => {
      const c = chunk[idx];
      const jobs = res.status === 'fulfilled' ? res.value : [];
      if (Array.isArray(jobs)) {
        jobs.forEach(j => {
          const title = j.title || j.name || '';
          const loc = j.location?.city || j.location?.country || j.location || (j.telecommuting ? 'Remote' : 'India');
          const url = j.shortlink || `https://apply.workable.com/${c}/j/${j.shortcode || j.code || j.id}/`;
          if (!titleMatch(title, role)) return;
          const locScore = locationScore(loc, location);
          if (locScore < 5) return;
          const expCheck = isFresherJob(title, j.description || '', userExp);
          if (!expCheck.keep) return;

          all.push({
            title,
            company: formatCompanyName(c),
            location: loc || 'India',
            job_url: url,
            description: j.description || '',
            source: 'Workable',
            sourceType: 'AUTO',
            safe: true,
            posted_date: j.published_at || j.created_at || new Date().toISOString(),
            experience_score: expCheck.score,
            loc_score: locScore,
            fetched_at: new Date().toISOString(),
          });
        });
      }
    });
  }
  return all;
}

async function fetchLeverLive(role, location, userExp) {
  const companies = [
    'postman', 'browserstack', 'razorpay', 'meesho', 'swiggy', 'urbancompany', 'chargebee',
    'clevertap', 'freshworks', 'innovaccer', 'gupshup', 'upstox', 'smallcase', 'acko',
    'cred', 'slice', 'leverageedu', 'atlassian', 'shopify', 'figma', 'notion', 'vercel',
    'linear', 'loom', 'airtable', 'rippling', 'deel', 'coinbase', 'stripe'
  ];
  let all = [];
  const results = await Promise.allSettled(
    companies.map(c =>
      axios.get(`https://api.lever.co/v0/postings/${c}?mode=json&limit=100`, { timeout: 8000, headers: HEADERS })
        .then(r => r.data || [])
        .catch(() => [])
    )
  );

  results.forEach((res, idx) => {
    const c = companies[idx];
    const jobs = res.status === 'fulfilled' ? res.value : [];
    if (Array.isArray(jobs)) {
      jobs.forEach(j => {
        const title = j.text || j.title || '';
        const loc = j.categories?.location || j.location || 'India';
        const url = j.hostedUrl || j.applyUrl || j.url || `https://jobs.lever.co/${c}/${j.id}`;
        if (!titleMatch(title, role)) return;
        const locScore = locationScore(loc, location);
        if (locScore < 5) return;
        const expCheck = isFresherJob(title, j.descriptionPlain || j.description || '', userExp);
        if (!expCheck.keep) return;

        all.push({
          title,
          company: formatCompanyName(j.company || c),
          location: loc || 'India',
          job_url: url,
          description: j.descriptionPlain || '',
          source: 'Lever',
          sourceType: 'AUTO',
          safe: true,
          posted_date: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
          experience_score: expCheck.score,
          loc_score: locScore,
          fetched_at: new Date().toISOString(),
        });
      });
    }
  });
  return all;
}

async function fetchGreenhouseLive(role, location, userExp) {
  const boards = [
    'gitlab', 'databricks', 'doordash', 'dropbox', 'figma', 'notion', 'canva', 'atlassian',
    'shopify', 'spotify', 'twilio', 'mongodb', 'elastic', 'snowflake', 'datadog', 'hashicorp',
    'confluent', 'vercel', 'linear', 'loom', 'airtable', 'rippling', 'deel', 'brex', 'ramp',
    'gusto', 'coinbase', 'stripe', 'reddit', 'airbnb', 'openai', 'anthropic', 'perplexity',
    'scale', 'supabase', 'posthog', 'retool', 'zapier', 'webflow', 'quora', 'intercom',
    'front', 'calendly'
  ];
  let all = [];
  const results = await Promise.allSettled(
    boards.map(b =>
      axios.get(`https://boards-api.greenhouse.io/v1/boards/${b}/jobs`, { timeout: 8000, headers: HEADERS })
        .then(r => (r.data?.jobs || []).map(job => ({ ...job, board: b })))
        .catch(() => [])
    )
  );

  results.forEach(res => {
    const jobs = res.status === 'fulfilled' ? res.value : [];
    if (Array.isArray(jobs)) {
      jobs.forEach(j => {
        const title = j.title || '';
        const loc = j.location?.name || 'India';
        const url = j.absolute_url || `https://boards.greenhouse.io/${j.board || ''}/jobs/${j.id}`;
        if (!titleMatch(title, role)) return;
        const locScore = locationScore(loc, location);
        if (locScore < 5) return;
        const expCheck = isFresherJob(title, j.content || '', userExp);
        if (!expCheck.keep) return;

        const isHard = title.toLowerCase().includes('gitlab') || title.toLowerCase().includes('ai engineer');
        all.push({
          title,
          company: formatCompanyName(j.company_name || j.board),
          location: loc,
          job_url: url,
          description: j.content || '',
          source: 'Greenhouse',
          sourceType: isHard ? 'MANUAL' : 'AUTO',
          safe: !isHard,
          posted_date: j.updated_at ? new Date(j.updated_at).toISOString() : new Date().toISOString(),
          experience_score: expCheck.score,
          loc_score: locScore,
          fetched_at: new Date().toISOString(),
          board: j.board || '',
        });
      });
    }
  });
  return all;
}

async function fetchAshbyLive(role, location, userExp) {
  try {
    const boards = [
      'linear', 'vercel', 'notion', 'figma', 'openai', 'scale', 'deel', 'loom',
      'posthog', 'supabase', 'perplexity', 'retool', 'zapier', 'webflow', 'quora',
      'brex', 'ramp', 'gusto', 'coinbase', 'stripe'
    ];
    let all = [];
    for (const b of boards) {
      try {
        const res = await axios.post(
          'https://jobs.ashbyhq.com/api/non-user-graphql',
          {
            operationName: 'ApiJobBoardWithTeams',
            variables: { organizationHostedJobsPageName: b },
            query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { teams { jobs { id title location workplaceType postedDate } } } }`,
          },
          { timeout: 5000, headers: HEADERS }
        );
        const teams = res.data?.data?.jobBoard?.teams || [];
        for (const team of teams) {
          if (Array.isArray(team.jobs)) {
            for (const j of team.jobs) {
              if (!titleMatch(j.title, role)) continue;
              const loc = j.location || j.workplaceType || 'India';
              const locScore = locationScore(loc, location);
              if (locScore < 5) continue;
              const expCheck = isFresherJob(j.title, '', userExp);
              if (!expCheck.keep) continue;

              all.push({
                title: j.title,
                company: formatCompanyName(b),
                location: loc,
                job_url: `https://jobs.ashbyhq.com/${b}/${j.id}`,
                description: '',
                source: 'Ashby',
                sourceType: 'AUTO',
                safe: true,
                posted_date: j.postedDate ? new Date(j.postedDate).toISOString() : new Date().toISOString(),
                experience_score: expCheck.score,
                loc_score: locScore,
                fetched_at: new Date().toISOString(),
              });
            }
          }
        }
      } catch (_) {}
    }
    return all;
  } catch {
    return [];
  }
}

// =========================================================================
// MANUAL REAL SOURCES (Cutshort, Hirist, Internshala, LinkedIn, JSearch, Adzuna)
// =========================================================================

async function fetchCutshortLive(role, location, userExp) {
  try {
    const res = await axios.post(
      'https://cutshort.io/api/v1/jobs/search',
      { search: { text: role, location: 'Bangalore', experience: '0-1', job_type: 'full_time' }, page: 1, limit: 50 },
      { timeout: 8000, headers: { ...HEADERS, 'Content-Type': 'application/json', 'Origin': 'https://cutshort.io' } }
    );
    const jobs = res.data?.data?.jobs_list || res.data?.jobs || res.data?.data || [];
    if (!Array.isArray(jobs)) return [];
    return jobs.map(j => {
      const title = j.title || j.job_title || '';
      const company = j.company_name || j.company || 'Cutshort Employer';
      const loc = j.location || j.city || 'Bangalore';
      const url = j.job_url || `https://cutshort.io/job/${j.id || j._id}`;
      if (!titleMatch(title, role)) return null;
      const expCheck = isFresherJob(title, j.description || '', userExp);
      if (!expCheck.keep) return null;
      return {
        title,
        company,
        location: loc,
        job_url: url,
        description: j.description || '',
        source: 'Cutshort',
        sourceType: 'MANUAL',
        safe: false,
        posted_date: j.created_at ? new Date(j.created_at).toISOString() : new Date().toISOString(),
        experience_score: expCheck.score,
        loc_score: locationScore(loc, location),
        fetched_at: new Date().toISOString(),
      };
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function fetchHiristLive(role, location, userExp) {
  try {
    const res = await axios.post(
      'https://www.hirist.com/api/v3/job/search',
      { query: role, loc: 'bangalore', exp: '0-1 years', page: 1 },
      { timeout: 8000, headers: { ...HEADERS, 'Content-Type': 'application/json' } }
    );
    const jobs = res.data?.jobs || res.data?.data || [];
    if (!Array.isArray(jobs)) return [];
    return jobs.map(j => {
      const title = j.title || '';
      const company = j.company || 'Hirist Tech Employer';
      const loc = j.location || 'Bangalore';
      const url = j.job_url || `https://www.hirist.com/j/${j.id}`;
      if (!titleMatch(title, role)) return null;
      const expCheck = isFresherJob(title, j.description || '', userExp);
      if (!expCheck.keep) return null;
      return {
        title,
        company,
        location: loc,
        job_url: url,
        description: j.description || '',
        source: 'Hirist',
        sourceType: 'MANUAL',
        safe: false,
        posted_date: j.posted_on ? new Date(j.posted_on).toISOString() : new Date().toISOString(),
        experience_score: expCheck.score,
        loc_score: locationScore(loc, location),
        fetched_at: new Date().toISOString(),
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchInternshalaLive(role, location, userExp) {
  try {
    const cleanRole = role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'software-developer';
    const res = await axios.get(`https://internshala.com/jobs/${cleanRole}-jobs-in-bangalore/fresher-jobs/`, { timeout: 8000, headers: HEADERS });
    const $ = cheerio.load(res.data);
    let jobs = [];
    $('.individual_internship, .job-card').each((_, el) => {
      const title = $(el).find('.job-internship-name, .profile, h3.heading_4_5 a').text().trim() || $(el).find('h3').text().trim();
      const company = $(el).find('.company-name, .company_name a').text().trim();
      const loc = $(el).find('.locations span, .location_link, #location_names').text().trim() || 'Bangalore';
      let href = $(el).find('h3 a, a.view_detail_button').attr('href');
      if (!href) return;
      if (!href.startsWith('http')) href = `https://internshala.com${href}`;
      if (!titleMatch(title, role)) return;
      const expCheck = isFresherJob(title, '', userExp);
      if (!expCheck.keep) return;
      jobs.push({
        title,
        company: company || 'Internshala Employer',
        location: loc,
        job_url: href.split('?')[0],
        description: '',
        source: 'Internshala',
        sourceType: 'MANUAL',
        safe: false,
        posted_date: new Date().toISOString(),
        experience_score: expCheck.score,
        loc_score: locationScore(loc, location),
        fetched_at: new Date().toISOString(),
      });
    });
    return jobs;
  } catch {
    return [];
  }
}

async function fetchLinkedInLive(role, location, userExp) {
  try {
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(role + ' Fresher')}&location=${encodeURIComponent(location)}&f_E=1,2&f_TPR=r604800&start=0`;
    const res = await axios.get(url, { timeout: 8000, headers: { ...HEADERS, 'Accept': 'text/html' } });
    const $ = cheerio.load(res.data);
    let jobs = [];
    $('li').each((_, el) => {
      const title = $(el).find('.base-search-card__title').text().trim() || $(el).find('h3').text().trim();
      const company = $(el).find('.base-search-card__subtitle').text().trim();
      const loc = $(el).find('.job-search-card__location').text().trim();
      const jobUrl = $(el).find('a.base-card__full-link').attr('href')?.split('?')[0] || '';
      if (!title || !jobUrl) return;
      if (!titleMatch(title, role)) return;
      if (locationScore(loc, location) < 5) return;
      const expCheck = isFresherJob(title, '', userExp);
      if (!expCheck.keep) return;
      jobs.push({
        title,
        company: company || 'LinkedIn Employer',
        location: loc || location,
        job_url: jobUrl,
        description: '',
        source: 'LinkedIn',
        sourceType: 'MANUAL',
        safe: false,
        posted_date: new Date().toISOString(),
        experience_score: expCheck.score,
        loc_score: locationScore(loc, location),
        fetched_at: new Date().toISOString(),
      });
    });
    return jobs;
  } catch (e) {
    return [];
  }
}

async function fetchJSearchLive(role, location, userExp) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];
  try {
    const res = await axios.get(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(role + ' fresher ' + location + ' 0-1 years')}&page=1&num_pages=1&date_posted=week`,
      { timeout: 8000, headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' } }
    );
    const jobs = res.data?.data || [];
    if (!Array.isArray(jobs)) return [];
    return jobs.map(j => {
      const title = j.job_title || '';
      const company = j.employer_name || 'Verified Tech Employer';
      const loc = j.job_city || j.job_country || location;
      const url = j.job_apply_link || j.job_google_link || '';
      if (!titleMatch(title, role)) return null;
      const expCheck = isFresherJob(title, j.job_description || '', userExp);
      if (!expCheck.keep) return null;
      if (locationScore(loc, location) < 5) return null;
      return {
        title,
        company,
        location: loc,
        job_url: url,
        description: j.job_description || '',
        source: 'JSearch',
        sourceType: 'MANUAL',
        safe: false,
        posted_date: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc).toISOString() : new Date().toISOString(),
        experience_score: expCheck.score,
        loc_score: locationScore(loc, location),
        fetched_at: new Date().toISOString(),
      };
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function fetchAdzunaLive(role, location, userExp) {
  const id = process.env.ADZUNA_ID;
  const ak = process.env.ADZUNA_KEY;
  if (!id || !ak) return [];
  try {
    const res = await axios.get(
      `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${id}&app_key=${ak}&what=${encodeURIComponent(role + ' fresher')}&where=${encodeURIComponent(location)}&results_per_page=50&content-type=application/json`,
      { timeout: 8000, headers: HEADERS }
    );
    const jobs = res.data?.results || [];
    if (!Array.isArray(jobs)) return [];
    return jobs.map(j => {
      const title = j.title || '';
      const company = j.company?.display_name || 'Adzuna Tech Partner';
      const loc = j.location?.display_name || location;
      const url = j.redirect_url || '';
      if (!titleMatch(title, role)) return null;
      const expCheck = isFresherJob(title, j.description || '', userExp);
      if (!expCheck.keep) return null;
      return {
        title,
        company,
        location: loc,
        job_url: url,
        description: j.description || '',
        source: 'Adzuna',
        sourceType: 'MANUAL',
        safe: false,
        posted_date: j.created ? new Date(j.created).toISOString() : new Date().toISOString(),
        experience_score: expCheck.score,
        loc_score: locationScore(loc, location),
        fetched_at: new Date().toISOString(),
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// =========================================================================
// MAIN FETCH FUNCTION - ZERO SEED / DUMMY DATA - 100% REAL LIVE
// =========================================================================

async function fetchLiveJobs(role, location, userExpYears = 0) {
  const userExp = typeof userExpYears === 'number' ? userExpYears : (parseFloat(userExpYears) || 0);
  console.log(`[REAL FETCH START] role="${role}" location="${location}" exp=${userExp} - NO SEED, ONLY LIVE`);

  const allSources = await Promise.allSettled([
    fetchWorkableLive(role, location, userExp),
    fetchLeverLive(role, location, userExp),
    fetchGreenhouseLive(role, location, userExp),
    fetchAshbyLive(role, location, userExp),
    fetchCutshortLive(role, location, userExp),
    fetchHiristLive(role, location, userExp),
    fetchInternshalaLive(role, location, userExp),
    fetchLinkedInLive(role, location, userExp),
    fetchJSearchLive(role, location, userExp),
    fetchAdzunaLive(role, location, userExp),
  ]);

  let combined = [];
  const labels = ['Workable', 'Lever', 'Greenhouse', 'Ashby', 'Cutshort', 'Hirist', 'Internshala', 'LinkedIn', 'JSearch', 'Adzuna'];
  allSources.forEach((r, i) => {
    const count = r.status === 'fulfilled' && Array.isArray(r.value) ? r.value.length : 0;
    console.log(`[REAL SOURCE] ${labels[i]}: ${count} live jobs fetched`);
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      combined = combined.concat(r.value);
    }
  });

  // Strict Fresher Experience Filter Pass
  let fresherFiltered = [];
  for (const j of combined) {
    if (!j) continue;
    const expCheck = isFresherJob(j.title, j.description || '', userExp);
    if (!expCheck.keep) {
      console.log(`Filtered non-fresher for 0-1 yr: ${j.title}`);
      continue;
    }
    j.experience_score = expCheck.score;
    fresherFiltered.push(j);
  }

  // Deduplicate by job_url
  const seen = new Set();
  let deduped = [];
  for (const j of fresherFiltered) {
    if (j && j.job_url && !seen.has(j.job_url)) {
      seen.add(j.job_url);
      deduped.push(j);
    }
  }

  // Filter location score >= 5
  let afterLoc = deduped.filter(j => (j.loc_score || 0) >= 5);

  // Live check: keep AUTO safe immediately, check manual URLs
  let liveChecked = [];
  for (const j of afterLoc) {
    if (j.sourceType === 'AUTO') {
      liveChecked.push(j);
    } else {
      const ok = await headCheck(j.job_url);
      if (ok) liveChecked.push(j);
    }
  }

  // Sort and split
  const sortFn = (a, b) => (b.experience_score - a.experience_score) || (b.loc_score - a.loc_score) || (new Date(b.posted_date) - new Date(a.posted_date));
  
  let autoJobs = liveChecked.filter(j => j.sourceType === 'AUTO' && j.safe).sort(sortFn);
  let manualJobs = liveChecked.filter(j => j.sourceType === 'MANUAL').sort(sortFn);

  console.log(`[REAL FINAL] Total real: ${combined.length} deduped: ${deduped.length} live: ${liveChecked.length} AUTO SAFE: ${autoJobs.length} MANUAL: ${manualJobs.length} - ZERO SEED`);
  console.log(`After fresher filter 0-1 yrs: AUTO ${autoJobs.length} jobs, MANUAL ${manualJobs.length} jobs - No senior III jobs`);

  return {
    autoJobs: autoJobs.slice(0, 100),
    manualJobs: manualJobs.slice(0, 100),
    totalReal: liveChecked.length,
    totalFound: liveChecked.length,
    isRealData: true,
    fetched_at: new Date().toISOString(),
  };
}

module.exports = {
  fetchLiveJobs,
  isFresherJob,
  fetchWorkableLive,
  fetchLeverLive,
  fetchGreenhouseLive,
  fetchAshbyLive,
  fetchCutshortLive,
  fetchHiristLive,
  fetchInternshalaLive,
  fetchLinkedInLive,
  fetchJSearchLive,
  fetchAdzunaLive,
};
