import { PublicKey } from "@solana/web3.js";
import logger from "./logger";
import { rpcPool } from "./rpcPool";
import { getActiveTradingWallet } from "./walletStore";
import { validateTradeExecution } from "./tradeExecutionValidator";
import {
  PortfolioGovernorConfig,
  PortfolioGovernorResult,
  buildPortfolioSnapshot,
  evaluatePortfolioGovernor,
} from "./portfolioGovernor";

export type ExecutionPreflightAction = "ALLOW" | "RECHECK" | "BLOCK";

export interface ExecutionPreflightInput {
  mint: string;
  symbol: string;
  entryPrice: number;
  candidateEntrySol: number;
  agentMode: "SIMULATION" | "LIVE";
  maxSpikePct: number;
  creatorWallet?: string | null;
  portfolioConfig: PortfolioGovernorConfig;
  balanceBufferSol: number;
  enabled: boolean;
}

export interface ExecutionPreflightResult {
  action: ExecutionPreflightAction;
  reason: string;
  walletBalanceSol: number | null;
  priceValidation: { isValid: boolean; reason?: string };
  portfolio: PortfolioGovernorResult;
  recommendedPositionCap: number;
}

async function getActiveWalletBalanceSol(): Promise<number> {
  const activeWallet = getActiveTradingWallet();
  if (!activeWallet?.wallet?.publicKey) {
    throw new Error("NO_ACTIVE_TRADING_WALLET");
  }

  const connection = await rpcPool.getBestConnection();
  const balanceLamports = await connection.getBalance(new PublicKey(activeWallet.wallet.publicKey));
  return balanceLamports / 1e9;
}

export async function runExecutionPreflight(input: ExecutionPreflightInput): Promise<ExecutionPreflightResult> {
  const snapshot = buildPortfolioSnapshot(input.creatorWallet);
  const portfolio = evaluatePortfolioGovernor({
    config: input.portfolioConfig,
    snapshot,
    candidateEntrySol: input.candidateEntrySol,
  });

  if (!input.enabled) {
    return {
      action: "ALLOW",
      reason: "EXECUTION_PREFLIGHT_DISABLED",
      walletBalanceSol: null,
      priceValidation: { isValid: true },
      portfolio: {
        ...portfolio,
        action: "ALLOW",
        reason: "PORTFOLIO_GOVERNOR_DISABLED",
        recommendedPositionCap: 1,
      },
      recommendedPositionCap: 1,
    };
  }

  const priceValidation = validateTradeExecution(input.mint, input.symbol, input.entryPrice, input.maxSpikePct);
  if (!priceValidation.isValid) {
    return {
      action: "BLOCK",
      reason: priceValidation.reason || "PRICE_VALIDATION_FAILED",
      walletBalanceSol: null,
      priceValidation,
      portfolio,
      recommendedPositionCap: portfolio.recommendedPositionCap,
    };
  }

  if (portfolio.action === "BLOCK") {
    return {
      action: "BLOCK",
      reason: portfolio.reason,
      walletBalanceSol: null,
      priceValidation,
      portfolio,
      recommendedPositionCap: portfolio.recommendedPositionCap,
    };
  }

  if (portfolio.action === "RECHECK") {
    return {
      action: "RECHECK",
      reason: portfolio.reason,
      walletBalanceSol: null,
      priceValidation,
      portfolio,
      recommendedPositionCap: portfolio.recommendedPositionCap,
    };
  }

  if (input.agentMode === "LIVE") {
    try {
      const walletBalanceSol = await getActiveWalletBalanceSol();
      const requiredSol = input.candidateEntrySol + Math.max(0, input.balanceBufferSol);
      if (walletBalanceSol < requiredSol) {
        return {
          action: "BLOCK",
          reason: `INSUFFICIENT_SOL_BALANCE:${walletBalanceSol.toFixed(4)}<${requiredSol.toFixed(4)}`,
          walletBalanceSol,
          priceValidation,
          portfolio,
          recommendedPositionCap: portfolio.recommendedPositionCap,
        };
      }

      return {
        action: "ALLOW",
        reason: "EXECUTION_PREFLIGHT_OK",
        walletBalanceSol,
        priceValidation,
        portfolio,
        recommendedPositionCap: portfolio.recommendedPositionCap,
      };
    } catch (error: any) {
      logger.warn(`⚠️ [Execution Preflight] Wallet balance check failed for ${input.symbol}: ${error.message}`);
      return {
        action: "RECHECK",
        reason: `BALANCE_CHECK_FAILED:${error.message}`,
        walletBalanceSol: null,
        priceValidation,
        portfolio,
        recommendedPositionCap: portfolio.recommendedPositionCap,
      };
    }
  }

  return {
    action: "ALLOW",
    reason: "EXECUTION_PREFLIGHT_OK",
    walletBalanceSol: null,
    priceValidation,
    portfolio,
    recommendedPositionCap: portfolio.recommendedPositionCap,
  };
}
