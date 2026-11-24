/** Sanitized diagnostics only. No retry authorization or paid-call changes. */
export function classifyStep7Failure({spawnError=false,decisionStatus=null,stdout='',stderr='',code=0}){
 if(spawnError)return 'runner-spawn-failed';
 if(decisionStatus==='decision-references-need-review')return decisionStatus;
 if(decisionStatus==='search-plan-needs-review')return decisionStatus;
 if(decisionStatus==='model-json-invalid')return 'response-truncated-or-invalid';
 const outcome=stdout+'\n'+stderr;
 if(/Previous paid attempt recorded|previous paid attempt|paid attempt already/i.test(outcome))return 'prior-paid-attempt-reserved';
 // HTTP codes in timestamps, filenames, counters, or source text aren't API errors.
 // Restrict provider classifications to explicit API error lines on stderr.
 const api=stderr.split(/\r?\n/).filter(line=>/^\s*(?:ApiError:|GoogleGenerativeAIError:|\[STEP5 DECISION\] API error:|\[STEP 5\] Google search call failed; previous files untouched:)/i.test(line)).join('\n');
 if(/\b429\b|RESOURCE_EXHAUSTED|quota exceeded|rate.limit/i.test(api))return 'provider-rate-limited';
 if(/\b(?:401|403)\b|PERMISSION_DENIED|invalid api.key|API_KEY_INVALID/i.test(api))return 'provider-auth-rejected';
 if(/\b(?:503|502)\b|UNAVAILABLE|overloaded|internal server error/i.test(api))return 'provider-temporarily-unavailable';
 if(/ETIMEDOUT|ECONNRESET|network error|timed out/i.test(api))return 'provider-network-or-timeout';
 if(/MAX_TOKENS|invalid-or-incomplete-json|model-json-invalid/i.test(outcome))return 'response-truncated-or-invalid';
 if(/No actual Google grounding citations|no-google-citations|no grounded sources/i.test(outcome))return 'missing-google-grounding';
 if(api||/Google search call failed|generateContent.*failed/i.test(outcome))return 'provider-call-failed';
 if(/exited 0 but did not create|snapshot.*missing/i.test(outcome))return 'snapshot-not-created';
 if(code!==0)return 'runner-exited-nonzero';
 return 'unclassified-incomplete';
}
