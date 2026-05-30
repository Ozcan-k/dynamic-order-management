// Format a quantity for display — integers render bare ("5", not "5.0"),
// decimals keep at most 2 places with trailing zeros stripped ("68.04",
// "11.34", "20.2"). Guards against floating-point noise like
// 22.68 * 3 = 68.03999999999999 by rounding to 2 dp before display.
export function formatQty(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(2).replace(/\.?0+$/, '')
}
