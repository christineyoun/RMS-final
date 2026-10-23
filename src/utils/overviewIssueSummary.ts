/** Extract complete saved sentences; never rewrite figures or add an interpretation. */
export function overviewIssueSummary(summary?: string): string {
  const sentences = String(summary || '').trim().split(/(?<=[.!?])\s+/u).filter(Boolean);
  if (!sentences.length) return '';
  const supporting = sentences.slice(1);
  const implication = supporting.find(sentence => /수요|공급|가격|조달|원료 확보|가공 수율|선적/.test(sentence));
  return [sentences[0], implication || supporting[0]].filter(Boolean).join(' ');
}
