import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-client.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const identity = document.getElementById('admin-identity');
const message = document.getElementById('admin-message');
const list = document.getElementById('admin-list');
const filter = document.getElementById('status-filter');
const loginLink = document.querySelector('.admin-login-link');

const typeLabels = {
  job_source: 'Job or internship',
  project: 'Open-source project',
  resource: 'Grant or learning resource',
  correction: 'Correction',
  other: 'Other opportunity'
};

function setMessage(text, state = 'info') {
  message.textContent = text;
  message.dataset.state = state;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function makeText(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value ?? '';
  return node;
}

function render(items) {
  list.replaceChildren();
  if (!items.length) {
    list.append(makeText('p', 'admin-empty', 'No submissions in this view.'));
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'admin-card';
    const top = document.createElement('div');
    top.className = 'admin-card-top';
    top.append(
      makeText('span', 'admin-type', typeLabels[item.submission_type] || 'Community suggestion'),
      makeText('span', 'submission-status', item.status === 'pending' ? 'Pending review' : item.status === 'approved' ? 'Approved' : 'Rejected')
    );
    const title = makeText('h3', '', item.title);
    const date = makeText('small', 'admin-date', 'Submitted ' + new Date(item.created_at).toLocaleString());
    card.append(top, title, date);
    if (item.notes) card.append(makeText('p', 'admin-notes', item.notes));

    const url = safeHttpsUrl(item.url);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open original source ↗';
      card.append(link);
    } else {
      card.append(makeText('p', 'admin-warning', 'The submitted URL is not a valid HTTPS link.'));
    }

    if (item.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'admin-actions';
      const approve = makeText('button', 'admin-approve', 'Approve & publish');
      approve.type = 'button';
      const reject = makeText('button', 'admin-reject', 'Reject');
      reject.type = 'button';
      approve.addEventListener('click', () => review(item.id, 'approved', approve, reject));
      reject.addEventListener('click', () => review(item.id, 'rejected', approve, reject));
      actions.append(approve, reject);
      card.append(actions);
      if (item.submission_type === 'correction') {
        card.append(makeText('small', 'admin-note', 'Approval records the correction for follow-up; it will not create a new public listing.'));
      } else {
        card.append(makeText('small', 'admin-note', 'Approval publishes this suggestion as a public Hub opportunity.'));
      }
    }
    list.append(card);
  }
}

async function loadSubmissions() {
  setMessage('Loading submissions…');
  const selected = filter.value;
  let query = supabase.from('submissions')
    .select('id,submission_type,title,url,notes,status,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (selected !== 'all') query = query.eq('status', selected);
  const { data, error } = await query;
  if (error) {
    setMessage(error.message || 'Could not load the review queue.', 'error');
    return;
  }
  setMessage(data.length + ' submission' + (data.length === 1 ? '' : 's') + ' in this view.');
  render(data);
}

async function review(id, decision, approve, reject) {
  approve.disabled = true;
  reject.disabled = true;
  setMessage(decision === 'approved' ? 'Approving and publishing…' : 'Rejecting submission…');
  const { data, error } = await supabase.rpc('review_community_submission', {
    p_submission_id: id,
    p_decision: decision
  });
  if (error) {
    setMessage(error.message || 'The review action failed.', 'error');
    approve.disabled = false;
    reject.disabled = false;
    return;
  }
  const result = Array.isArray(data) ? data[0] : data;
  setMessage(decision === 'approved'
    ? (result?.published_opportunity_id ? 'Approved and published to the Hub.' : 'Correction approved for follow-up.')
    : 'Submission rejected.');
  await loadSubmissions();
}

filter.addEventListener('change', () => void loadSubmissions());

const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) {
  identity.textContent = 'No signed-in account detected.';
  setMessage('Please sign in with your Global Open Source Hub account first.', 'error');
} else if (user.app_metadata?.hub_role !== 'admin') {
  identity.textContent = 'Signed in, but this account is not an administrator.';
  setMessage('Access denied. Admin permissions are required.', 'error');
} else {
  identity.textContent = 'Administrator session verified.';
  loginLink.hidden = true;
  await loadSubmissions();
}
