export type ExitAction = "SELL" | "BURN_AND_CLOSE_ATA";

export interface ExitStrategyInput {
  tokenMarketValueSol: number | null | undefined;
  estimatedSellFeesSol: number | null | undefined;
  estimatedSellSlippageSol: number | null | undefined;
  ataRentSol: number | null | undefined;
  burnFeeSol: number | null | undefined;
  closeAtaFeeSol: number | null | undefined;
  sellRouteAvailable?: boolean;
}

export interface ExitStrategyDecision {
  action: ExitAction;
  netSellValue: number;
  netAtaCloseValue: number;
  reason: string;
}

function toFiniteNonNegative(value: number | null | undefined): number {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }

  return normalized;
}

function roundSol(value: number): number {
  return Number(value.toFixed(9));
}

export function clampExitValueForDisplay(value: number | null | undefined): number {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }

  return roundSol(normalized);
}

export function decideExitAction(input: ExitStrategyInput): ExitStrategyDecision {
  const sellRouteAvailable = input.sellRouteAvailable !== false;
  const tokenMarketValueSol = sellRouteAvailable ? toFiniteNonNegative(input.tokenMarketValueSol) : 0;
  const estimatedSellFeesSol = toFiniteNonNegative(input.estimatedSellFeesSol);
  const estimatedSellSlippageSol = toFiniteNonNegative(input.estimatedSellSlippageSol);
  const ataRentSol = toFiniteNonNegative(input.ataRentSol);
  const burnFeeSol = toFiniteNonNegative(input.burnFeeSol);
  const closeAtaFeeSol = toFiniteNonNegative(input.closeAtaFeeSol);

  const netSellValue = roundSol(tokenMarketValueSol - estimatedSellFeesSol - estimatedSellSlippageSol);
  const netAtaCloseValue = roundSol(ataRentSol - burnFeeSol - closeAtaFeeSol);

  if (netSellValue <= netAtaCloseValue) {
    const reason = !sellRouteAvailable
      ? `No executable sell route available; ATA close recovers ${netAtaCloseValue.toFixed(9)} SOL versus sell ${netSellValue.toFixed(9)} SOL`
      : `Net ATA close value ${netAtaCloseValue.toFixed(9)} SOL is greater than or equal to net sell value ${netSellValue.toFixed(9)} SOL`;

    return {
      action: "BURN_AND_CLOSE_ATA",
      netSellValue,
      netAtaCloseValue,
      reason,
    };
  }

  return {
    action: "SELL",
    netSellValue,
    netAtaCloseValue,
    reason: `Net sell value ${netSellValue.toFixed(9)} SOL is greater than ATA close value ${netAtaCloseValue.toFixed(9)} SOL`,
  };
}
