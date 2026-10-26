/** Compatibility readers only. Never create financial observations or sample analyses. */
import fs from 'node:fs';import path from 'node:path';import {readScheduledContent} from './scheduledContent.ts';import {snapshotIssues} from './mvpEvidence.ts';
export interface AiAnalysisData {
  confidenceScore: number;
  deskRecommendation: string;
  executiveSummary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  watchItems: string[];
}
export interface ScmPolicyAlert {
  headline: string;
  subline: string;
  change: string;
  status: string;
  badgeType: 'red' | 'green' | 'amber';
  note: string;
}
export interface LiveTradePolicyAlert {
  title: string;
  summary: string;
  statusTag: string;
  statusType: 'favorable' | 'warning' | 'neutral';
  sourceUrl: string;
}
export interface LiveMarketIssue {
  title: string;
  riskLevel: '고위험' | '중위험' | '저위험';
  impactDirection: '상승' | '하락' | '보합';
  dateStr: string;
  publisher: string;
  sourceUrl: string;
}
export async function generateAiAnalysis(commodityId:string,_customPromptName?:string,_forceRefresh=false):Promise<AiAnalysisData>{
 const id=commodityId.toLowerCase().replace(/_/g,'-');
 if(!['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'].includes(id))throw Error('Unknown commodity');
 let payload=readScheduledContent('analysis-'+id)?.payload;
 if(!payload)try{payload=JSON.parse(fs.readFileSync(path.join(process.cwd(),'.rms-stage3/snapshots/analysis-'+id+'.json'),'utf8')).payload;}catch{}
 if(!payload||snapshotIssues('analysis-'+id,payload).length)throw Error('Verified saved analysis unavailable');
 return payload.data;
}
export async function fetchLatestScmPolicyAlerts():Promise<ScmPolicyAlert>{throw Error('Verified policy publication unavailable');}
export async function getLiveTradePolicyAlert():Promise<LiveTradePolicyAlert>{throw Error('Verified trade policy publication unavailable');}
export async function fetchLiveMarketIssues(_force=false):Promise<LiveMarketIssue[]>{return [];}
