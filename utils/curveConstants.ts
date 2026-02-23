export const CURVE_CONSTANTS = {
  a: 0.00022500443612959005,
  b: -0.04465309899499017,
  c: 3.3439469804363813,
  d: 1.7232697904532974,
};

export function calculateCurveProgress(solBalance: number): number {
  const { a, b, c, d } = CURVE_CONSTANTS;
  const progress = a * Math.pow(solBalance, 3) + b * Math.pow(solBalance, 2) + c * solBalance + d;
  return Math.max(0, Math.min(100, Number(progress)));
}
