/** Saved original Wheat articles; same read-only receipt handling as Potato. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import saved from '../data/wheat_news_verified.json';

export function readVerifiedWheatNews(root=process.cwd()) {
  let current:typeof saved;
  try {current=JSON.parse(fs.readFileSync(path.join(root,'src/data/wheat_news_verified.json'),'utf8'));}catch{return [];}
  return (Array.isArray(current?.articles)?current.articles:[]).filter(article=>{
    try {
      const receipt=JSON.parse(fs.readFileSync(path.join(root,article.receipt),'utf8'));
      return receipt.status===200 && receipt.url===article.originalUrl &&
        createHash('sha256').update(receipt.html).digest('hex')===article.receiptSha256;
    } catch {return false;}
  });
}
