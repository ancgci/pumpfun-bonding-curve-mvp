import axios from "axios";
import logger from "./logger";

const SANTIMENT_API_URL = "https://api.santiment.net/graphql";
const HUGGINGFACE_API_URL = "https://router.huggingface.co/hf-inference/models/cardiffnlp/twitter-roberta-base-sentiment-latest";
const SENSE_AI_API_URL = "https://thesenseai.fun/analyze";

const SANTIMENT_API_KEY = process.env.SANTIMENT_API_KEY;
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
  logger.info(`🔍 [Sentiment] getTokenSentiment called for ${symbol}. Keys: Santiment=${!!SANTIMENT_API_KEY}, HF=${!!HF_API_KEY}, SenseAI=${process.env.SENSE_AI_ENABLED !== "false"}`);

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

  // 2. Hugging Face (Twitter Sentiment)
  if (HF_API_KEY) {
    const hfSentiment = await getTwitterSentiment(symbol);
    if (hfSentiment !== null) {
      metrics.twitterSentiment = hfSentiment;
      hasData = true;
    }
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
 * Fetch Twitter sentiment from Hugging Face Inference API.
 */
async function getTwitterSentiment(symbol: string): Promise<number | null> {
  if (!HF_API_KEY) return null;

  try {
    // Mocking social context for the model to analyze if we don't have a real scraper yet.
    // In a real scenario, this would receive raw tweets from a scraper.
    const mockContext = `The community is very bullish on $${symbol.toUpperCase()} after the latest pump.fun launch!`;

    const response = await axios.post(
      HUGGINGFACE_API_URL,
      { inputs: mockContext },
      {
        headers: { Authorization: `Bearer ${HF_API_KEY}` },
        timeout: 5000
      }
    );

    const results = response.data;
    if (Array.isArray(results) && results[0] && Array.isArray(results[0])) {
      // Logic for twitter-roberta-base-sentiment-latest:
      // Index 0: Negative, 1: Neutral, 2: Positive
      const positive = results[0].find((r: any) => r.label === "positive")?.score || 0;
      const negative = results[0].find((r: any) => r.label === "negative")?.score || 0;
      return positive - negative; // Score between -1 and 1
    }
    return null;
  } catch (error: any) {
    logger.error(`[Sentiment-HF] Error: ${error.message}`);
    if (error.response?.data) {
      logger.error(`[Sentiment-HF] Response: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

/**
 * Fetch Pump.fun specific analysis from SenseAI.
 */
async function getSenseAIAnalysis(mint: string) {
  try {
    const response = await axios.get(`${SENSE_AI_API_URL}?mint=${mint}`, { timeout: 5000 });
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
