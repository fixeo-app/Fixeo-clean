export type VoiceCommitMode = 'replace' | 'append';
export type PreviousDescription = { problem: string; declaredService: string; problemConfirmedFromRafi: boolean };

/** A transcript is a proposal. Only the explicit acceptance handler calls this. */
export function applyVoiceProposal(current: string, transcript: string, mode: VoiceCommitMode) {
  const proposal = transcript.trim();
  if (!proposal) return current;
  return mode === 'append' ? [current.trim(), proposal].filter(Boolean).join(' ') : proposal;
}
