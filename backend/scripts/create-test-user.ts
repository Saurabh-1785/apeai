/**
 * ApeAI — create (or reset) a ready-to-use account for local testing.
 *
 * The account's email is marked as confirmed, so it signs in with email +
 * password straight away: no verification code, no Google/OAuth.
 * Running it again for the same email resets the password.
 *
 *   npm run create-user                                  # admin@apeai.test, random password
 *   TEST_USER_EMAIL=you@company.com npm run create-user  # pick the email
 *   TEST_USER_PASSWORD='…' npm run create-user           # pick the password
 *
 * Uses the service_role key (SUPABASE_KEY) from the root .env. It runs on
 * your machine only; the key is never sent to the browser.
 */

import crypto from 'crypto';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import settings from '../src/config';

const EMAIL = (process.env.TEST_USER_EMAIL || 'admin@apeai.test').trim().toLowerCase();
const NAME = process.env.TEST_USER_NAME || 'ApeAI Admin';

function generatePassword(): string {
  return `ape-${crypto.randomBytes(12).toString('base64url')}`;
}

function serverClient(): SupabaseClient {
  return createClient(settings.supabaseUrl, settings.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findUserByEmail(client: SupabaseClient, email: string): Promise<User | undefined> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return undefined;
  }
}

async function main(): Promise<void> {
  if (!settings.supabaseConfigured) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in the root .env.');
  }

  const chosenPassword = process.env.TEST_USER_PASSWORD;
  const password = chosenPassword || generatePassword();
  const admin = serverClient();

  const existing = await findUserByEmail(admin, EMAIL);
  let userId: string;

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      ban_duration: 'none',
    });
    if (error) throw error;
    userId = existing.id;
    console.log(`Found ${EMAIL}: password reset, email marked as confirmed.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: NAME },
    });
    if (error || !data.user) throw error ?? new Error('Supabase returned no user.');
    userId = data.user.id;
    console.log(`Created ${EMAIL} with a confirmed email.`);
  }

  // Profile row, so /profile and the user menu show a name.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: userId, email: EMAIL, full_name: NAME }, { onConflict: 'id' });
  if (profileError) {
    console.warn(`Profile row not written (${profileError.message}). You can fill it in on /profile.`);
  }

  // Prove the credentials work exactly the way the login page uses them.
  const { error: signInError } = await serverClient().auth.signInWithPassword({ email: EMAIL, password });
  if (signInError) {
    throw new Error(`Account is ready but a test password sign-in failed: ${signInError.message}`);
  }
  console.log('Checked: password sign-in works.\n');

  console.log(`  Email:     ${EMAIL}`);
  console.log(`  Password:  ${chosenPassword ? '(the TEST_USER_PASSWORD you set)' : password}\n`);
}

main().catch((err) => {
  console.error(`Could not set up the test account: ${err?.message ?? err}`);
  process.exit(1);
});
