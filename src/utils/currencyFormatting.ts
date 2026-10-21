/** Prefix an already formatted amount without changing rounding, precision or units. */
export const prefixCurrency = (formattedAmount: string, symbol: string): string => {
  const negative = /^[-−](?=[0-9])/.test(formattedAmount);
  return negative ? `−${symbol}${formattedAmount.slice(1)}` : `${symbol}${formattedAmount}`;
};
