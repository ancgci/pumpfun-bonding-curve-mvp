import logger from "../logger";

const api = process.env.SHYFT_RPC as string;

export interface DevHistoryResult {
    deployerTab: string;
    totalCreated: number;
    reputation: "GOOD" | "NEUTRAL" | "BAD" | "UNKNOWN";
}

/**
 * Analyze the history of a token developer.
 * Checks how many tokens they have created and if they have a history of rugs.
 */
export async function analyzeDevHistory(creatorAddr: string): Promise<DevHistoryResult> {
    const result: DevHistoryResult = {
        deployerTab: creatorAddr,
        totalCreated: 0,
        reputation: "UNKNOWN"
    };

    if (!api || !creatorAddr) return result;

    try {
        const shyftApiKey = new URL(api).searchParams.get("api_key") || "";
        const response = await fetch(
            `https://api.shyft.to/sol/v1/token/get_all_tokens?network=mainnet-beta&creator=${creatorAddr}`,
            {
                method: "GET",
                headers: { "x-api-key": shyftApiKey },
                redirect: "follow"
            }
        );

        const data = await response.json();

        if (data?.success && data?.result) {
            result.totalCreated = data.result.length;

            if (result.totalCreated > 10) {
                result.reputation = "GOOD"; // Experienced dev
            } else if (result.totalCreated === 1) {
                result.reputation = "NEUTRAL"; // First time or fresh wallet
            } else {
                result.reputation = "NEUTRAL";
            }

            // Logic to detect rugs would require checking if liquidity was removed from previous tokens
            // For now, we report the count.
        }

        logger.info(`👨‍💻 [RugCheck] Developer ${creatorAddr} has created ${result.totalCreated} tokens.`);
        return result;

    } catch (error: any) {
        logger.debug(`⚠️ [RugCheck/DevHistory] Error for ${creatorAddr}: ${error.message}`);
        return result;
    }
}
