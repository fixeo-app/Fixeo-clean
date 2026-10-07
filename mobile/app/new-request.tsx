import { useLocalSearchParams } from 'expo-router';
import ClientRequestComposer from '@/components/ClientRequestComposer';
export default function NewRequest() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  return <ClientRequestComposer key={draftId || 'new'} resumeDraftId={typeof draftId === 'string' ? draftId : undefined} />;
}
