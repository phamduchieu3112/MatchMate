import { redirect } from 'next/navigation';
import { getAuthenticatedHost } from '@/lib/supabase/server';
import { CreateMatchForm } from '@/components/host/CreateMatchForm';

export const dynamic = 'force-dynamic';

export default async function HostNewMatchPage() {
  const { user, isHost } = await getAuthenticatedHost();
  if (!user || !isHost) {
    redirect('/host/login');
  }

  return <CreateMatchForm />;
}
