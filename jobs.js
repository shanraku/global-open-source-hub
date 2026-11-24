import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-client.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const form = document.getElementById('job-form');
const keyword = document.getElementById('keyword');
const locationField = document.getElementById('location');
const workType = document.getElementById('work-type');
const results = document.getElementById('search-results');
const resultLinks = document.getElementById('result-links');
const hint = document.getElementById('search-hint');
const feedStatus = document.getElementById('feed-status');
const liveJobList = document.getElementById('live-job-list');
const savedStatus = document.getElementById('saved-status');
const savedList = document.getElementById('saved-opportunity-list');
const savedSection = document.getElementById('saved-opportunities');
const contributionSection = document.getElementById('community-submit');
const mySubmissionsSection = document.getElementById('my-submissions');
const submissionForm = document.getElementById('opportunity-submit-form');
const submissionStatus = document.getElementById('submission-status');
const submissionButton = document.getElementById('submission-submit');
const mySubmissionsStatus = document.getElementById('my-submissions-status');
const mySubmissionsList = document.getElementById('my-submissions-list');
const sources = [
  { name: 'Indeed', url: q => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}` },
  { name: 'LinkedIn Jobs', url: q => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}` },
  { name: 'Google Jobs', url: q => `https://www.google.com/search?ibp=htl;jobs&q=${encodeURIComponent(q)}` },
  { name: 'Remote OK', url: q => `https://remoteok.com/remote-${encodeURIComponent(q.trim().toLowerCase().replace(/\\s+/g, '-'))}-jobs` },
  { name: 'We Work Remotely', url: q => `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(q)}` },
  { name: 'Wellfound', url: q => `https://wellfound.com/jobs?query=${encodeURIComponent(q)}` },
  { name: 'ReliefWeb', url: q => `https://reliefweb.int/jobs?search=${encodeURIComponent(q)}` },
  { name: 'Devex', url: q => `https://www.devex.com/jobs/search?query=${encodeURIComponent(q)}` }
];
let liveJobs = [];
let currentUser = null;
let savedByUrl = new Map();

function renderSavedStatus(message, isError = false) {
  if (!savedStatus) return;
  savedStatus.textContent = message;
  savedStatus.dataset.state = isError ? 'error' : 'info';
}

function safeJobUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'jobicy.com' ? url.href : null;
  } catch {
    return null;
  }
}

function makeSaveButton(job) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button save-opportunity-button';
  const url = safeJobUrl(job.url);
  const saved = url && savedByUrl.has(url);
  button.textContent = saved ? 'Saved ✓' : '☆ Save opportunity';
  button.disabled = !currentUser || !url || Boolean(saved);
  button.title = !currentUser ? 'Sign in to save this opportunity' : saved ? 'Already saved' : 'Save to your account';
  button.addEventListener('click', async () => {
    if (!currentUser || !url) return;
    button.disabled = true;
    button.textContent = 'Saving…';
    const { error } = await supabase.from('saved_external_opportunities').insert({
      user_id: currentUser.id,
      title: (job.title || 'Untitled role').slice(0, 200),
      organization: (job.company || '').slice(0, 160) || null,
      location: (job.location || '').slice(0, 160) || null,
      source_name: 'Jobicy',
      source_url: url,
      published_at: job.publishedAt || null
    });
    if (error && error.code !== '23505') {
      renderSavedStatus(error.message || 'Could not save this opportunity.', true);
      button.disabled = false;
      button.textContent = '☆ Save opportunity';
      return;
    }
    await loadSavedOpportunities();
    button.textContent = 'Saved ✓';
    button.disabled = true;
  });
  return button;
}

function renderSavedOpportunities() {
  if (!savedList) return;
  savedList.replaceChildren();
  const items = [...savedByUrl.values()];
  if (!currentUser) {
    renderSavedStatus('Sign in to keep your saved opportunities private to your account.');
    return;
  }
  if (!items.length) {
    renderSavedStatus('No saved opportunities yet. Choose “Save opportunity” on a recent listing.');
    return;
  }
  renderSavedStatus(`${items.length} saved opportunity${items.length === 1 ? '' : 'ies'}.`);
  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'source-card saved-opportunity-card';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const details = document.createElement('p');
    details.textContent = [item.organization, item.location, item.source_name].filter(Boolean).join(' · ');
    const link = document.createElement('a');
    link.href = item.source_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open original listing ↗';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button remove-saved-button';
    remove.textContent = 'Remove saved item';
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      const { error } = await supabase.from('saved_external_opportunities')
        .delete().eq('user_id', currentUser.id).eq('source_url', item.source_url);
      if (error) {
        renderSavedStatus(error.message || 'Could not remove this item.', true);
        remove.disabled = false;
        return;
      }
      await loadSavedOpportunities();
      renderLiveJobs();
    });
    card.append(title, details, link, remove);
    savedList.append(card);
  });
}

async function loadSavedOpportunities() {
  if (!currentUser) {
    savedByUrl = new Map();
    renderSavedOpportunities();
    return;
  }
  renderSavedStatus('Loading your saved opportunities…');
  const { data, error } = await supabase.from('saved_external_opportunities')
    .select('id,title,organization,location,source_name,source_url,published_at,created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) {
    renderSavedStatus(error.message || 'Could not load saved opportunities.', true);
    return;
  }
  savedByUrl = new Map((data || []).map(item => [item.source_url, item]));
  renderSavedOpportunities();
}

function setSubmissionStatus(message, isError = false) {
  if (!submissionStatus) return;
  submissionStatus.textContent = message;
  submissionStatus.dataset.state = isError ? 'error' : 'info';
}

async function loadMySubmissions() {
  if (!currentUser || !mySubmissionsList || !mySubmissionsStatus) return;
  mySubmissionsStatus.textContent = 'Loading your submissions…';
  mySubmissionsList.replaceChildren();
  const { data, error } = await supabase.from('submissions')
    .select('id,submission_type,title,url,notes,status,created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    mySubmissionsStatus.textContent = error.message || 'Could not load your submissions.';
    mySubmissionsStatus.dataset.state = 'error';
    return;
  }
  const items = data || [];
  mySubmissionsStatus.textContent = items.length
    ? `${items.length} recent submission${items.length === 1 ? '' : 's'}.`
    : 'You have not submitted anything yet.';
  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'source-card user-submission-card';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const type = document.createElement('p');
    const labels = { job_source: 'Job or internship', project: 'Open-source project', resource: 'Grant or learning resource', correction: 'Correction', other: 'Other' };
    type.textContent = labels[item.submission_type] || 'Community suggestion';
    const status = document.createElement('span');
    status.className = 'submission-status';
    status.dataset.status = item.status;
    status.textContent = item.status === 'pending' ? 'Pending review' : item.status === 'approved' ? 'Approved' : 'Not approved';
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open submitted source ↗';
    const date = document.createElement('small');
    date.textContent = 'Submitted ' + new Date(item.created_at).toLocaleDateString();
    card.append(title, type, status, link, date);
    if (item.notes) {
      const notes = document.createElement('p');
      notes.textContent = item.notes;
      card.append(notes);
    }
    mySubmissionsList.append(card);
  });
}

submissionForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) {
    setSubmissionStatus('Please sign in before submitting an opportunity.', true);
    return;
  }
  const type = document.getElementById('submission-type').value;
  const title = document.getElementById('submission-title').value.trim();
  const rawUrl = document.getElementById('submission-url').value.trim();
  const notes = document.getElementById('submission-notes').value.trim();
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    setSubmissionStatus('Enter a valid HTTPS link.', true);
    return;
  }
  if (url.protocol !== 'https:') {
    setSubmissionStatus('Only secure HTTPS links can be submitted.', true);
    return;
  }
  if (title.length < 3 || title.length > 200 || notes.length > 3000) {
    setSubmissionStatus('Check the title and notes length, then try again.', true);
    return;
  }
  submissionButton.disabled = true;
  submissionButton.textContent = 'Sending…';
  setSubmissionStatus('Sending your suggestion for human review…');
  const { error } = await supabase.from('submissions').insert({
    user_id: currentUser.id,
    submission_type: type,
    title,
    url: url.href,
    notes: notes || null
  });
  submissionButton.disabled = false;
  submissionButton.textContent = 'Send for review';
  if (error) {
    setSubmissionStatus(error.message || 'Could not send your suggestion. Please try again.', true);
    return;
  }
  submissionForm.reset();
  setSubmissionStatus('Submitted successfully. It is pending human review and is not public yet.');
  await loadMySubmissions();
});

function renderLiveJobs() {
  if (!liveJobList) return;
  const term = (keyword?.value || '').trim().toLowerCase();
  const place = (locationField?.value || '').trim().toLowerCase();
  const selectedType = (workType?.value || '').toLowerCase();
  const filtered = liveJobs.filter(job => {
    const haystack = [job.title, job.company, job.location, job.excerpt, (job.types || []).join(' ')].join(' ').toLowerCase();
    return (!term || haystack.includes(term)) &&
      (!place || (job.location || '').toLowerCase().includes(place)) &&
      (!selectedType || haystack.includes(selectedType));
  });
  liveJobList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'jobs-hint';
    empty.textContent = liveJobs.length
      ? 'No cached listings match those filters. Try a broader keyword or location.'
      : 'No current listings are available in the latest feed yet.';
    liveJobList.append(empty);
    return;
  }
  filtered.slice(0, 60).forEach(job => {
    const card = document.createElement('article');
    card.className = 'source-card live-job-card';
    const title = document.createElement('h3');
    title.textContent = job.title || 'Untitled role';
    const company = document.createElement('p');
    company.textContent = job.company || 'Employer not provided';
    const meta = document.createElement('p');
    meta.textContent = [job.location, ...(job.types || []), job.level].filter(Boolean).join(' · ');
    const excerpt = document.createElement('p');
    excerpt.textContent = job.excerpt || 'Open the source listing to read the full job description.';
    const date = document.createElement('small');
    date.textContent = job.publishedAt ? 'Published ' + new Date(job.publishedAt).toLocaleDateString() : 'Recently listed';
    const link = document.createElement('a');
    link.href = safeJobUrl(job.url) || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View original listing at Jobicy ↗';
    card.append(title, company, meta, excerpt, date, link, makeSaveButton(job));
    liveJobList.append(card);
  });
}

async function loadLiveJobs() {
  if (!feedStatus || !liveJobList) return;
  try {
    const response = await fetch('data/jobs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Feed file is not available yet.');
    const data = await response.json();
    liveJobs = Array.isArray(data.jobs) ? data.jobs.filter(job => safeJobUrl(job.url)) : [];
    const updated = data.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : '';
    feedStatus.textContent = liveJobs.length
      ? liveJobs.length + ' recent listings · Feed refreshed ' + (updated || 'recently') + '.'
      : 'The feed has no listings yet. The scheduled refresh will check again.';
    renderLiveJobs();
  } catch (error) {
    feedStatus.textContent = 'Live listings are temporarily unavailable. You can still search the independent job sources below.';
    const message = document.createElement('p');
    message.className = 'jobs-hint';
    message.textContent = 'Feed status: ' + error.message;
    liveJobList.replaceChildren(message);
  }
}

form?.addEventListener('submit', event => {
  event.preventDefault();
  const terms = [keyword.value.trim(), locationField.value.trim(), workType.value].filter(Boolean).join(' ');
  if (!keyword.value.trim()) {
    keyword.focus();
    return;
  }
  resultLinks.replaceChildren();
  sources.forEach(source => {
    const link = document.createElement('a');
    link.className = 'source-card result-link';
    link.href = source.url(terms);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const title = document.createElement('strong');
    title.textContent = source.name + ' ↗';
    const detail = document.createElement('span');
    detail.textContent = 'Open this search on ' + source.name + '. Results and filters are controlled by that provider.';
    link.append(title, detail);
    resultLinks.append(link);
  });
  results.hidden = false;
  hint.textContent = 'Search links are ready. Verify each vacancy on the employer’s official website before applying.';
  renderLiveJobs();
  results.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  if (savedSection) savedSection.hidden = !currentUser;
  if (contributionSection) contributionSection.hidden = !currentUser;
  if (mySubmissionsSection) mySubmissionsSection.hidden = !currentUser;
  void Promise.all([loadSavedOpportunities(), loadMySubmissions()]).then(renderLiveJobs);
});
const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user ?? null;
if (savedSection) savedSection.hidden = !currentUser;
if (contributionSection) contributionSection.hidden = !currentUser;
if (mySubmissionsSection) mySubmissionsSection.hidden = !currentUser;
await Promise.all([loadSavedOpportunities(), loadMySubmissions(), loadLiveJobs()]);
