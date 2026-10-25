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
