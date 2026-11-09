import { isSupabaseConfigured } from './supabase';

/**
 * Turns raw Supabase auth / database errors into copy a person can act on.
 *
 * Supabase messages such as "Invalid API key" or "Token has expired or is
 * invalid" describe what failed inside the system, not what the user should
 * do next. Every message here says what happened in plain words and, where
 * there is one, offers the next step. The raw error is still logged to the
 * console so developers can debug it.
 */

export type FriendlyError = {
  message: string;
  /** Optional next step rendered as a link under the message. */
  action?: { label: string; href: string };
  /** Shown only in development: what to fix in the setup. */
  devHint?: string;
};

export type AuthAction = 'signin' | 'signup' | 'verify' | 'resend' | 'profile' | 'avatar';

type RawError = {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
};

const MISSING_KEYS_HINT =
  'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Add the project URL and the anon (public) key from Supabase → Project Settings → API to the root .env, then restart the frontend.';
const BAD_KEY_HINT =
  'Supabase rejected the anon key. Check NEXT_PUBLIC_SUPABASE_ANON_KEY in the root .env matches the anon (public) key for this project, then restart the frontend.';

const SERVICE_UNAVAILABLE =
  "We can't reach the account service right now, so signing in and signing up won't work. This isn't something you did. Try again in a few minutes, and contact your workspace admin if it keeps happening.";

function has(raw: RawError, ...needles: string[]) {
  const msg = (raw.message || '').toLowerCase();
  return needles.some((n) => msg.includes(n));
}

export function friendlyAuthError(
  error: unknown,
  action: AuthAction,
  context: { email?: string } = {},
): FriendlyError {
  const raw: RawError = (error && typeof error === 'object' ? error : { message: String(error ?? '') }) as RawError;
  const code = raw.code || '';
  const status = raw.status ?? 0;

  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[auth:${action}]`, { code: code || undefined, status: status || undefined, message: raw.message });
  }

  // ── Setup problems: the app itself can't talk to Supabase ──
  if (!isSupabaseConfigured) {
    return { message: SERVICE_UNAVAILABLE, devHint: MISSING_KEYS_HINT };
  }
  if (has(raw, 'invalid api key', 'no api key', 'apikey')) {
    return { message: SERVICE_UNAVAILABLE, devHint: BAD_KEY_HINT };
  }

  // ── Connection problems ──
  if (raw.name === 'AuthRetryableFetchError' || has(raw, 'failed to fetch', 'network', 'load failed') || code === 'request_timeout') {
    return { message: "We couldn't connect. Check your internet connection, then try again." };
  }

  // ── Too many attempts ──
  if (code === 'over_email_send_rate_limit' || has(raw, 'email rate limit')) {
    return { message: "We've sent several emails to this address in a short time. Wait a few minutes before asking for another one." };
  }
  if (code === 'over_request_rate_limit' || status === 429 || has(raw, 'rate limit', 'too many')) {
    return { message: 'Too many attempts in a short time. Wait a minute, then try again.' };
  }

  // ── Account and credential problems ──
  if (code === 'invalid_credentials' || has(raw, 'invalid login credentials')) {
    return { message: "That email and password don't match an account. Check both for typos and try again." };
  }
  if (code === 'email_not_confirmed' || has(raw, 'email not confirmed')) {
    return {
      message: "This email isn't confirmed yet. Enter the 6-digit code we emailed you to finish setting up your account.",
      action: context.email
        ? { label: 'Enter your code', href: `/verify-otp?email=${encodeURIComponent(context.email)}` }
        : undefined,
    };
  }
  if (code === 'user_already_exists' || code === 'email_exists' || has(raw, 'already registered', 'already exists')) {
    return { message: 'There’s already an account with this email.', action: { label: 'Sign in instead', href: '/login' } };
  }
  if (code === 'user_banned') {
    return { message: 'This account has been suspended. Contact your workspace admin to restore access.' };
  }
  if (code === 'weak_password' || has(raw, 'password should', 'weak password')) {
    return { message: 'That password is too easy to guess. Make it longer and mix letters, numbers and symbols.' };
  }
  if (code === 'same_password') {
    return { message: 'Your new password needs to be different from your current one.' };
  }
  if (code === 'email_address_invalid' || (has(raw, 'unable to validate email', 'email address') && has(raw, 'invalid'))) {
    return { message: "That email address can't receive mail. Check it for typos, or use a different address." };
  }
  if (code === 'email_address_not_authorized') {
    return {
      message: "We can't send email to this address yet. Use a different email, or ask your workspace admin to finish email setup.",
      devHint: 'The project uses Supabase’s built-in email service, which only delivers to team members. Set up custom SMTP in Supabase → Authentication → Emails.',
    };
  }
  if (code === 'signup_disabled' || code === 'email_provider_disabled') {
    return { message: 'New sign-ups are turned off for this workspace. Ask your workspace admin for an invite.' };
  }

  // ── One-time codes ──
  if (code === 'otp_expired' || (action === 'verify' && has(raw, 'token has expired', 'invalid'))) {
    return {
      message: "That code has expired or doesn't match. Send a new code and use the one from the newest email.",
    };
  }

  // ── Session problems ──
  if (code === 'session_expired' || code === 'session_not_found' || code === 'bad_jwt' || status === 401 || has(raw, 'jwt')) {
    return { message: 'Your session has ended. Sign in again to continue.', action: { label: 'Sign in', href: '/login' } };
  }

  // ── Saving profile data ──
  if (action === 'avatar') {
    return { message: "We couldn't upload that photo. Try again, or choose a different image." };
  }
  if (action === 'profile') {
    return { message: "We couldn't save your profile. Your changes are still here, so try again in a moment." };
  }

  // ── Anything else ──
  const verb = { signin: 'signing you in', signup: 'creating your account', verify: 'checking your code', resend: 'sending a new code' }[action];
  return {
    message: `Something went wrong while ${verb}. Try again in a moment.`,
    devHint: raw.message ? `Supabase said: ${raw.message}${code ? ` (${code})` : ''}` : undefined,
  };
}
