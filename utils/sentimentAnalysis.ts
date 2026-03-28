import axios from "axios";
import logger from "./logger";
import { generateStructuredLlm } from "./llmGateway";

const SANTIMENT_API_URL = "https://api.santiment.net/graphql";
const SENSE_AI_API_URL = "https://thesenseai.fun/analyze";

const SANTIMENT_API_KEY = process.env.SANTIMENT_API_KEY;
// We no longer use HF, but keep the env var check to not break existing setups,
// though we will use the LLM gateway for the actual analysis.
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

export interface SentimentMetrics {
  balance: number;
  socialVolume: number;
  socialDominance: number;
  twitterSentiment?: number;
  senseAiVirality?: number;
  senseAiQuality?: number;
  senseAiOverall?: number;
  timestamp: number;
}

/**
 * Fetch sentiment analysis from Santiment for a given token slug.
 * If no API key is provided, returns null.
 */
export async function getTokenSentiment(symbol: string, mint?: string): Promise<SentimentMetrics | null> {
  logger.info(`🔍 [Sentiment] getTokenSentiment called for ${symbol}. Keys: Santiment=${!!SANTIMENT_API_KEY}, LLM_Fallback=true, SenseAI=${process.env.SENSE_AI_ENABLED !== "false"}`);

  const metrics: Partial<SentimentMetrics> = {
    balance: 0,
    socialVolume: 0,
    socialDominance: 0,
    timestamp: Date.now()
  };

  let hasData = false;

  // 1. Santiment
  if (SANTIMENT_API_KEY) {
    const santimentData = await fetchSantimentData(symbol);
    if (santimentData) {
      metrics.balance = santimentData.balance;
      metrics.socialVolume = santimentData.socialVolume;
      metrics.socialDominance = santimentData.socialDominance;
      hasData = true;
    }
  }

  // 2. LLM Gateway (Twitter/Social Sentiment Fallback)
  // We use the LLM Gateway to judge sentiment as a replacement for HuggingFace.
  const llmSentiment = await getTwitterSentiment(symbol);
  if (llmSentiment !== null) {
    metrics.twitterSentiment = llmSentiment;
    hasData = true;
  }

  // 3. SenseAI (Pump.fun Specific)
  if (mint && process.env.SENSE_AI_ENABLED !== "false") {
    const senseData = await getSenseAIAnalysis(mint);
    if (senseData) {
      metrics.senseAiVirality = senseData.virality;
      metrics.senseAiQuality = senseData.quality;
      metrics.senseAiOverall = senseData.overall;
      hasData = true;
    }
  }

  return hasData ? (metrics as SentimentMetrics) : null;
}

/**
 * Internal Santiment fetcher
 */
async function fetchSantimentData(symbol: string) {

  // Santiment usually uses lowercase slugs/symbols
  const slug = symbol.toLowerCase();

  const query = `
    query($slug: String!, $from: DateTime!, $to: DateTime!) {
      getMetric(metric: "sentiment_balance_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
          value
        }
      }
      social_volume: getMetric(metric: "social_volume_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
          value
        }
      }
      social_dominance: getMetric(metric: "social_dominance_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
          value
        }
      }
    }
  `;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const from = yesterday.toISOString();
  const to = new Date().toISOString();

  try {
    const response = await axios.post(
      SANTIMENT_API_URL,
      {
        query,
        variables: { slug, from, to }
      },
      {
        headers: {
          Authorization: `Apikey ${SANTIMENT_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 5000
      }
    );

    if (!response || !response.data) {
      logger.debug(`[Sentiment] Invalid response from Santiment for ${symbol}`);
      return null;
    }

    const data = (response.data as any)?.data;
    if (!data) {
      logger.debug(`[Sentiment] No data returned for ${symbol}`);
      return null;
    }

    const metrics: SentimentMetrics = {
      balance: extractLastValue(data.getMetric?.timeseriesData),
      socialVolume: extractLastValue(data.social_volume?.timeseriesData),
      socialDominance: extractLastValue(data.social_dominance?.timeseriesData),
      timestamp: Date.now()
    };

    return metrics;
  } catch (error: any) {
    logger.debug(`[Sentiment] Error fetching for ${symbol}: ${error.message}`);
    return null;
  }
}

function extractLastValue(timeseries: any[]): number {
  if (!timeseries || timeseries.length === 0) return 0;
  return timeseries[timeseries.length - 1].value || 0;
}

/**
 * Fetch Twitter sentiment acting as a fallback using our LLM Gateway.
 * Returns 1 (Positive), -1 (Negative), or 0 (Neutral).
 */
async function getTwitterSentiment(symbol: string): Promise<number | null> {
  try {
    const mockContext = `The community is very bullish on $${symbol.toUpperCase()} after the latest pump.fun launch!`;

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["sentiment"],
      properties: {
        sentiment: { type: "number", enum: [1, 0, -1] },
      },
    } as const;

    const result = await generateStructuredLlm<{ sentiment: number }>({
      task: "agent",
      system: "You are an expert crypto sentiment analyzer. You must read social media context about a token and output 1 for POSITIVE, -1 for NEGATIVE, and 0 for NEUTRAL. You must output only a valid JSON object.",
      prompt: `Analyze the following context for token ${symbol.toUpperCase()}:\n"${mockContext}"`,
      schema: schema,
      normalizeOutput: (raw: any) => {
        if (typeof raw?.sentiment === "number") {
          return { sentiment: raw.sentiment };
        }
        return null;
      },
      legacyModel: process.env.AGENT_LEGACY_MODEL || "llama-3.3-70b-versatile",
    });

    if (result && typeof result.output?.sentiment === "number") {
      return result.output.sentiment;
    }
    
    // Default to neutral on successful call but unparseable output
    return 0;
  } catch (error: any) {
    // 🔥 STRICT ERROR BOUNDARY 🔥
    // We swallow all errors here (like 429 Rate Limit from Groq) to ensure 
    // the main trading pipeline is NOT blocked. The agent will just receive a Neutral sentiment.
    logger.warn(`⚠️ [Sentiment-LLM] Failed to evaluate sentiment for ${symbol}. Returning Neutral (0). Error: ${error.message}`);
    return 0; // Return neutral rather than throwing to avoid blocking orchestrated pipeline
  }
}

/**
 * Fetch Pump.fun specific analysis from SenseAI.
 */
async function getSenseAIAnalysis(mint: string) {
  try {
    const response = await axios.get(`${SENSE_AI_API_URL}?mint=${mint}`, { timeout: 5000 });

    if (!response || !response.data) {
      logger.debug(`[Sentiment-Sense] Invalid response from SenseAI for ${mint}`);
      return null;
    }

    const data = response.data as any;

    if (data && data.socialMetrics) {
      return {
        virality: parseInt(data.socialMetrics.aiViralityScore) || 0,
        quality: parseInt(data.socialMetrics.ideaQualityScore) || 0,
        overall: data.analysis?.overallScore || 0
      };
    }
    return null;
  } catch (error: any) {
    logger.debug(`[Sentiment-Sense] Error: ${error.message}`);
    return null;
  }
}
