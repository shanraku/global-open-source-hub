import { mkdir, readFile, writeFile } from 'node:fs/promises';

const endpoint = 'https://jobicy.com/api/jobs?count=100';
const response = await fetch(endpoint, {
  headers: { Accept: 'application/json', 'User-Agent': 'GlobalOpenSourceHub/1.0 (+https://github.com/shanraku/global-open-source-hub)' },
  signal: AbortSignal.timeout(25000)
});
if (!response.ok) {
  const retryAfter = response.headers.get('retry-after');
  throw new Error(`Jobicy API returned HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ''}`);
}
const payload = await response.json();
if (payload.success === false || !Array.isArray(payload.jobs)) {
  throw new Error('Jobicy API response did not contain a valid jobs array.');
}
const clean = (value, max = 500) => typeof value === 'string'
  ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\\s+/g, ' ').trim().slice(0, max)
  : '';
const jobs = payload.jobs.map((job) => {
  let url;
  try {
    const parsed = new URL(job.url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'jobicy.com') return null;
    url = parsed.href;
  } catch { return null; }
  const title = clean(job.jobTitle, 180);
  if (!title) return null;
  return {
    id: String(job.id ?? ''),
    title,
    company: clean(job.companyName, 160),
    location: clean(job.jobGeo, 160),
    types: Array.isArray(job.jobType) ? job.jobType.map((item) => clean(item, 60)).filter(Boolean).slice(0, 5) : [],
    level: clean(job.jobLevel, 80),
    excerpt: clean(job.jobExcerpt, 360),
    publishedAt: clean(job.pubDate, 50),
    salary: [job.salaryMin, job.salaryMax].some(Number.isFinite)
      ? { min: Number.isFinite(job.salaryMin) ? job.salaryMin : null, max: Number.isFinite(job.salaryMax) ? job.salaryMax : null, currency: clean(job.salaryCurrency, 8), period: clean(job.salaryPeriod, 30) }
      : null,
    url,
    source: 'Jobicy'
  };
}).filter(Boolean);
const output = {
  schemaVersion: 1,
  source: 'Jobicy public Jobs API',
  sourceUrl: 'https://jobicy.com/jobs-rss-feed',
  apiUrl: endpoint,
  fetchedAt: new Date().toISOString(),
  publicationWindow: 'The provider API returns listings published in the last 7 days; new listings may appear after a 3-hour delay.',
  attribution: 'Every listing is attributed to Jobicy and links to its canonical Jobicy page.',
  jobs
};
await mkdir('data', { recursive: true });
await writeFile('data/jobs.json', JSON.stringify(output, null, 2) + '\\n');
console.log(`Saved ${jobs.length} normalized Jobicy listings.`);
