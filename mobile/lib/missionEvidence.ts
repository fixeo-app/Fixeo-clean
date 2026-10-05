import { supabase } from './supabase';

export type MissionEvidence = {
  id: string;
  kind: 'before' | 'after';
  mime_type: string;
  created_at: string;
  signed_url?: string | null;
};

export async function uploadMissionEvidence(
  missionId: string,
  kind: 'before' | 'after',
  uri: string,
  mimeType = 'image/jpeg',
) {
  const ticket = await supabase.functions.invoke('mobile-mission-evidence', {
    body: {
      action: 'create_upload',
      mission_id: missionId,
      kind,
      mime_type: mimeType,
    },
  });
  if (ticket.error || !ticket.data?.ok) {
    throw new Error(String(ticket.data?.error || ticket.error?.message || 'upload_ticket_failed'));
  }

  const fileResponse = await fetch(uri);
  if (!fileResponse.ok) throw new Error('local_media_unavailable');
  const bytes = await fileResponse.arrayBuffer();

  const uploaded = await supabase.storage
    .from(String(ticket.data.bucket))
    .uploadToSignedUrl(
      String(ticket.data.path),
      String(ticket.data.token),
      bytes,
      { contentType: mimeType, upsert: false },
    );
  if (uploaded.error) throw uploaded.error;

  const confirmed = await supabase.functions.invoke('mobile-mission-evidence', {
    body: {
      action: 'confirm_upload',
      evidence_id: ticket.data.evidence_id,
    },
  });
  if (confirmed.error || !confirmed.data?.ok) {
    throw new Error(String(confirmed.data?.error || confirmed.error?.message || 'evidence_confirm_failed'));
  }

  return String(ticket.data.evidence_id);
}

export async function listMissionEvidence(missionId: string): Promise<MissionEvidence[]> {
  const result = await supabase.functions.invoke('mobile-mission-evidence', {
    body: { action: 'list', mission_id: missionId },
  });
  if (result.error || !result.data?.ok) {
    throw new Error(String(result.data?.error || result.error?.message || 'evidence_lookup_failed'));
  }
  return Array.isArray(result.data.evidence) ? result.data.evidence : [];
}
