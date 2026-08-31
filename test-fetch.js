const { fetchLiveJobs } = require('./jobs/fetchLiveJobs');

async function test() {
  console.log('Testing fetchLiveJobs("developer", "remote")...');
  const startTime = Date.now();
  const jobs = await fetchLiveJobs('developer', 'remote');
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`Fetched ${jobs.length} verified live jobs in ${duration}s.`);
  if (jobs.length > 0) {
    console.log('Sample Job 1:', JSON.stringify(jobs[0], null, 2));
    if (jobs.length > 1) {
      console.log('Sample Job 2:', JSON.stringify(jobs[1], null, 2));
    }
  }
  process.exit(0);
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

