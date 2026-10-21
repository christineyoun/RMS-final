/** Bounded observability, never a substitute for publisher citation verification.
 * Tool arguments, response bodies, search queries and credentials are not copied.
 * Missing counters mean unreported, not zero calls or zero cost.
 */
export function searchGroundingDiagnostic(response:any) {
  const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:undefined;
  const toolType=(v:unknown)=>['GOOGLE_SEARCH_WEB','GOOGLE_SEARCH_IMAGE','URL_CONTEXT','GOOGLE_MAPS'].includes(String(v))?String(v):'OTHER';
  const candidates=Array.isArray(response?.candidates)?response.candidates.slice(0,8):[];
  const billed=response?.usageMetadata?.billedToolCalls;
  return {
    responseId:typeof response?.responseId==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(response.responseId)?response.responseId:undefined,
    candidates:candidates.map((c:any)=>{
      const parts=Array.isArray(c?.content?.parts)?c.content.parts.slice(0,128):[];
      return {
        groundingMetadataPresent:!!c?.groundingMetadata,
        webSearchQueryCount:Array.isArray(c?.groundingMetadata?.webSearchQueries)?c.groundingMetadata.webSearchQueries.length:undefined,
        groundingChunkCount:Array.isArray(c?.groundingMetadata?.groundingChunks)?c.groundingMetadata.groundingChunks.length:undefined,
        // A call alone is a predicted invocation; a response/billed count is a
        // separate signal. Neither supplies missing publisher citations.
        toolCalls:parts.filter((p:any)=>p?.toolCall).map((p:any)=>({toolType:toolType(p.toolCall.toolType)})),
        toolResponses:parts.filter((p:any)=>p?.toolResponse).map((p:any)=>({toolType:toolType(p.toolResponse.toolType)})),
      };
    }),
    toolUsePromptTokenCount:count(response?.usageMetadata?.toolUsePromptTokenCount),
    billedToolCallsPresent:billed!==undefined,
    // The installed SDK preserves unknown Developer API usage fields. Its
    // TypeScript interface does not yet declare billedToolCalls.
    billedToolCalls:Array.isArray(billed)?billed.slice(0,32).map((v:any)=>({
      toolType:toolType(v?.toolType),successfulToolCallCount:count(v?.successfulToolCallCount),
      failedToolCallCount:count(v?.failedToolCallCount),
    })):undefined,
  };
}
