export function isNarrativeMarketDocument(input:{
  headline:string;
  articleText:string;
  mainText:string;
  paragraphs:string[];
  hasArticleMarkup:boolean;
}):boolean {
  const normalize=(s:string)=>String(s||'').replace(/\s+/g,' ').trim();
  const headline=normalize(input.headline);
  const text=normalize(input.articleText || input.mainText);
  const paragraphs=input.paragraphs.map(normalize).filter(Boolean);
  const standaloneQuote=/(?:\b(?:live|interactive|real[ -]?time)\s+(?:price|quote|chart)\b|\b(?:price|futures?|stock)\s+chart\b|\b(?:historical\s+(?:prices?|data)|technical\s+analysis|contract\s+specifications|live\s+quotes?)\b)/i.test(headline);
  const narrative=paragraphs.filter(p=>p.length>=85 && /[.!?。！？]/.test(p) && /\b(?:rose|fell|increased|decreased|reported|announced|said|according|expected|forecast|demand|supply|exports?|imports?|production|consumption|prices?|market|trade|harvest|stocks?)\b|(?:가격|생산|수출|수입|공급|수요|재고|전망|발표)/i.test(p));
  if(standaloneQuote && !(input.hasArticleMarkup && narrative.length>=2))return false;
  return !!text;
}
