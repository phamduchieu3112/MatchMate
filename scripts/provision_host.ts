import { createClient } from '@supabase/supabase-js';

/**
 * Provisions a single-tenant Host user with app_metadata: { role: 'host' }.
 * Usage:
 *   HOST_EMAIL=host@example.com HOST_PASSWORD=StrongPassword123! pnpm provision:host
 */
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.HOST_EMAIL?.trim();
  const password = process.env.HOST_PASSWORD;

  if (!url || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!email || !password || password.length < 10) {
    console.error('Provide HOST_EMAIL and HOST_PASSWORD (min 10 chars)');
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listData, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    console.error('Failed to list users:', listErr.message);
    process.exit(1);
  }

  const existing = listData.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(
      existing.id,
      {
        password,
        email_confirm: true,
        app_metadata: { ...existing.app_metadata, role: 'host' },
      }
    );
    if (updateErr) {
      console.error('Failed to update host user:', updateErr.message);
      process.exit(1);
    }
    console.log('Updated existing host user:', existing.id);
    return;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'host' },
  });

  if (createErr || !created.user) {
    console.error('Failed to create host user:', createErr?.message);
    process.exit(1);
  }

  console.log('Provisioned new host user:', created.user.id);
}

main();
