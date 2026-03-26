import axios from "axios";
import logger from "./logger";
import { recordPriceSample } from "./volatilityMonitor";
import { recordOrganicityTrade } from "./organicityMonitor";

/**
 * PUMPFUN HISTORY UTILITY
 * Fetches historical trades from PumpFun API to backfill TA and Organicity monitors
 * upon token discovery. This avoids "INSUFFICIENT_DATA" errors for mature tokens.
 */

interface PumpTrade {
    signature: string;
    mint: string;
    sol_amount: number;
    token_amount: number;
    is_buy: boolean;
    user: string;
    timestamp: number;
    price?: number; // Calculated or from API
}

export const DEFAULT_PUMPFUN_BACKFILL_TRADES = 200;

/**
 * Fetches the last N trades for a token and populates the monitors.
 * @param mint Token address
 * @param limit Number of trades to fetch (default: 200)
 */
export async function backfillTokenHistory(
    mint: string,
    limit: number = DEFAULT_PUMPFUN_BACKFILL_TRADES
): Promise<void> {
    try {
        const url = `https://frontend-api.pump.fun/trades/all/${mint}?limit=${limit}&offset=0`;
        logger.info(`🔄 [History] Buscando backfill para ${mint}...`);

        const response = await axios.get(url, { timeout: 5000 });

        if (!response.data || !Array.isArray(response.data)) {
            logger.warn(`⚠️ [History] Nenhum histórico encontrado para ${mint} (ou erro na API).`);
            return;
        }

        const trades: any[] = response.data;
        // A API retorna do mais recente para o mais antigo, precisamos inverter para popular o monitor na ordem correta.
        const chronologicalTrades = trades.reverse();

        logger.info(`📥 [History] Injetando ${chronologicalTrades.length} trades históricos para ${mint}.`);

        for (const t of chronologicalTrades) {
            const timestamp = t.timestamp * 1000; // API utiliza segundos
            const solAmount = Number(t.sol_amount) / 1e9; // API retorna lamelas? Verificar
            // Nota: A API geralmente retorna valores já formatados ou brutos. 
            // Baseado em observações, sol_amount na frontend-api costuma vir em lamelas (Solana units).

            const sol = Number(t.sol_amount) / 1e9;
            const tokens = Number(t.token_amount) / 1e6;
            const price = tokens > 0 ? sol / tokens : 0;

            if (price > 0) {
                // Enviar para Volatility Monitor (TA)
                recordPriceSample(mint, price, sol, timestamp);

                // Enviar para Organicity Monitor
                // Como não temos o progress exato de cada trade passado, usamos 0 ou um placeholder seguro.
                // O organicityMonitor usa progress apenas para snapshots de milestones, que não afetarão o backfill se for 0.
                recordOrganicityTrade(
                    mint,
                    t.user,
                    t.is_buy ? "BUY" : "SELL",
                    sol,
                    price,
                    0,
                    timestamp
                );
            }
        }

        logger.info(`✅ [History] Backfill concluído para ${mint}.`);
    } catch (error: any) {
        logger.error(`❌ [History] Erro ao buscar backfill para ${mint}: ${error.message}`);
    }
}
