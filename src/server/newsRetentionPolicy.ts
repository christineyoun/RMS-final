/** Reusable news-age policy, not a fixed article/date or approval override.
 * A slower-moving starch sector may retain older VERIFIED reporting.
 * Source relevance, evidence and date remain mandatory for publication.
 */
export const newsRetentionDays=(commodity:string):number=>commodity==='potato-starch'?60:30;
