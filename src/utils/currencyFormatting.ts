import type {Currency} from '../types';
/** Prefix an already formatted amount without changing rounding, precision or units. */
export const prefixCurrency = (formattedAmount: string, symbol: string): string => {
  const negative = /^[-−](?=[0-9])/.test(formattedAmount);
  return negative ? `−${symbol}${formattedAmount.slice(1)}` : `${symbol}${formattedAmount}`;
};

/** Omit a redundant currency code only when the displayed symbol identifies it. */
export const priceUnit = (currency: string, symbol = ''): string => {
  const symbols: Record<string, string> = {KRW: '₩', USD: '$', EUR: '€'};
  return symbols[currency] && symbol === symbols[currency] ? '/MT' : `${currency}/MT`;
};

/** Common display rounding for canonical prices, chart quotes and absolute moves. */
export function formatCurrencyAmount(value:number,currency:Currency,decimals=2):string {
 if(!Number.isFinite(value))return '--';
 return currency==='KRW'?Math.round(value).toLocaleString('en-US'):value.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
}
