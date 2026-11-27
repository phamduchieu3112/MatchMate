import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Creates a server-only Supabase admin client using SUPABASE_SERVICE_ROLE_KEY.
 * Never import this file from Client Components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase server environment configuration');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
