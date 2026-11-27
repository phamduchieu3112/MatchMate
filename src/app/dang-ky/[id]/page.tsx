import { RegistrationTracker } from '@/components/player/RegistrationTracker';

export const dynamic = 'force-dynamic';

export default async function RegistrationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RegistrationTracker id={id} />;
}
