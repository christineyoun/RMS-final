/** Validate only this optional field. No report-level audit or call depends on it. */
import {readOverviewTakeawayText} from '../../src/utils/overviewTakeaway.ts';
import type {EvidenceSource} from './step7-core.ts';

export type Step7OverviewTakeaway = {text: string; sourceIds: string[]; excerptIds: string[]};

function ids(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= limit &&
    value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 40) &&
    new Set(value).size === value.length;
}

export function parseOverviewTakeaway(value: unknown): Step7OverviewTakeaway | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Partial<Step7OverviewTakeaway>;
  const text = readOverviewTakeawayText(v.text);
  if (!text || !ids(v.sourceIds, 4) || !ids(v.excerptIds, 8)) return;
  return {text, sourceIds: v.sourceIds, excerptIds: v.excerptIds};
}

export function bindOverviewTakeaway(value: unknown, citedSources: readonly EvidenceSource[]) {
  const takeaway = parseOverviewTakeaway(value);
  if (!takeaway) return;
  const linked = citedSources.filter(s => takeaway.sourceIds.includes(s.id) && s.grade === 'A' &&
    s.excerpts.some(e => takeaway.excerptIds.includes(e.id) && e.text.trim()));
  if (new Set(linked.map(s => s.id)).size !== takeaway.sourceIds.length ||
      !takeaway.excerptIds.every(id => linked.some(s => s.excerpts.some(e => e.id === id && e.text.trim())))) return;
  return {text: takeaway.text, sourceUrls: [...new Set(linked.map(s => s.url!))]};
}
