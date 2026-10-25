// Only an existing saved daily publication determines the issue, never a run
// attempt, source observation, snapshot timestamp or the current calendar date.
let publishedIssue: string | null = null;

// Header polling and PDF exports share the same publication selection.
export async function loadDailyPublicationIssue(): Promise<string | null> {
  const response = await fetch('/api/rms/free-publication', { cache: 'no-store' });
  if (!response.ok) return null;
  const issue = dailyPublicationIssue(await response.json());
  if (issue) publishedIssue = issue;
  return issue;
}

export async function getDailyPublicationIssue(): Promise<string> {
  const issue = publishedIssue || await loadDailyPublicationIssue();
  if (!issue) throw new Error('No saved daily publication is available for export');
  return issue;
}

export function dailyPublicationIssue(publication: { publishedAt?: string; revision?: string; data?: unknown } | null): string | null {
  if (!publication?.revision || !publication.data || !publication.publishedAt) return null;
  const date = new Date(publication.publishedAt);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('');
}
