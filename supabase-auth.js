import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-client.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const host = document.createElement('section');
host.className = 'section supabase-auth';
host.id = 'hub-account';
host.setAttribute('aria-labelledby', 'hub-account-title');
host.innerHTML = `
  <div class="eyebrow">YOUR GLOBAL HUB ACCOUNT</div>
  <h2 id="hub-account-title">Sign in to save opportunities.</h2>
  <p class="auth-intro">Create a free account with your email to save opportunities and suggest useful resources for human review. Your account is separate from Mauqify and GrowTrust.</p>
  <form id="hub-auth-form" class="auth-form">
    <label>Email address<input id="hub-auth-email" type="email" autocomplete="email" required maxlength="254"></label>
    <label>Password<input id="hub-auth-password" type="password" autocomplete="current-password" minlength="8" required></label>
    <div class="auth-actions">
      <button class="button primary" type="submit" data-auth-mode="signin">Sign in</button>
      <button class="button auth-secondary" type="button" id="hub-signup">Create free account</button>
      <button class="button auth-secondary" type="button" id="hub-signout" hidden>Sign out</button>
    </div>
  </form>
  <p class="auth-status" id="hub-auth-status" role="status" aria-live="polite">Use your email and password. Email confirmation may be required.</p>
  <p class="auth-user" id="hub-auth-user" hidden></p>
`;
const footer = document.querySelector('footer');
if (footer && !document.getElementById('hub-account')) footer.before(host);

const form = host.querySelector('#hub-auth-form');
const email = host.querySelector('#hub-auth-email');
const password = host.querySelector('#hub-auth-password');
const status = host.querySelector('#hub-auth-status');
const signup = host.querySelector('#hub-signup');
const signout = host.querySelector('#hub-signout');
const signin = form.querySelector('[data-auth-mode="signin"]');
const userLabel = host.querySelector('#hub-auth-user');

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.state = isError ? 'error' : 'info';
}
function showSession(user) {
  const signedIn = Boolean(user);
  email.disabled = signedIn;
  password.disabled = signedIn;
  signin.hidden = signedIn;
  signup.hidden = signedIn;
  signout.hidden = !signedIn;
  userLabel.hidden = !signedIn;
  userLabel.textContent = signedIn ? 'Signed in as ' + user.email : '';
  if (signedIn) setStatus('You are signed in. Your saved opportunities are available below.');
}
async function signIn() {
  const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
  if (error) throw error;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  signin.disabled = true;
  signup.disabled = true;
  setStatus('Signing in…');
  try {
    await signIn();
  } catch (error) {
    setStatus(error.message || 'Sign-in failed. Please try again.', true);
  } finally {
    signin.disabled = false;
    signup.disabled = false;
  }
});
signup.addEventListener('click', async () => {
  if (!email.reportValidity() || !password.reportValidity()) return;
  if (password.value.length < 8) {
    setStatus('Please use a password with at least 8 characters.', true);
    return;
  }
  signup.disabled = true;
  signin.disabled = true;
  setStatus('Creating your account…');
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.value.trim(), password: password.value });
    if (error) throw error;
    if (data.session) {
      showSession(data.user);
    } else {
      setStatus('Account request received. Check your email for a confirmation link before signing in.');
    }
  } catch (error) {
    setStatus(error.message || 'Account creation failed. Please try again.', true);
  } finally {
    signup.disabled = false;
    signin.disabled = false;
  }
});
signout.addEventListener('click', async () => {
  signout.disabled = true;
  const { error } = await supabase.auth.signOut();
  if (error) setStatus(error.message || 'Could not sign out.', true);
  else {
    password.value = '';
    setStatus('You have signed out.');
  }
  signout.disabled = false;
});
supabase.auth.onAuthStateChange((_event, session) => showSession(session?.user ?? null));
const { data: { session }, error } = await supabase.auth.getSession();
if (error) setStatus(error.message || 'Could not check the current session.', true);
showSession(session?.user ?? null);
