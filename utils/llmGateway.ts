import axios from "axios";
import { generateObject, generateText, jsonSchema, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import logger from "./logger";

export type LlmProvider = "google" | "legacy" | "legacy_fallback";
export type LlmTask = "agent" | "learner" | "postmortem";

type ToolMap = Record<string, any>;

const DEFAULT_LEGACY_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_PROVIDER_ORDER: LlmProvider[] = ["legacy", "google"];

export interface LlmAttempt {
  provider: LlmProvider;
  model: string;
  success: boolean;
  reason?: string;
}

export interface StructuredLlmRequest<TOutput> {
  task: LlmTask;
  system: string;
  prompt: string;
  schema: any;
  normalizeOutput: (raw: any) => TOutput | null;
  temperature?: number;
  maxOutputTokens?: number;
  googleModel?: string;
  legacyModel: string;
  legacyApiUrl?: string;
  legacyApiKey?: string;
  legacyTimeoutMs?: number;
  tools?: ToolMap;
  toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string };
  stopWhenSteps?: number;
}

export interface StructuredLlmResult<TOutput> {
  output: TOutput;
  provider: LlmProvider;
  model: string;
  attempts: LlmAttempt[];
  toolCalls: string[];
  steps: number;
  rawText?: string;
}

function normalizeProviderName(value: string): LlmProvider | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "google" || normalized === "gemini") return "google";
  if (normalized === "legacy_fallback" || normalized === "nvidia") return "legacy_fallback";
  if (normalized === "legacy" || normalized === "groq") return "legacy";
  return null;
}

function parseProviderOrder(raw: string | undefined): LlmProvider[] {
  if (!raw) return DEFAULT_PROVIDER_ORDER;

  const providers = raw
    .split(",")
    .map(normalizeProviderName)
    .filter((provider): provider is LlmProvider => provider !== null);

  if (providers.length === 0) return DEFAULT_PROVIDER_ORDER;
  return Array.from(new Set(providers));
}

function getProviderOrder(task: LlmTask): LlmProvider[] {
  const taskSpecific = task === "agent"
    ? process.env.LLM_PROVIDER_ORDER
    : task === "learner"
      ? process.env.LEARNER_LLM_PROVIDER_ORDER
      : process.env.POSTMORTEM_LLM_PROVIDER_ORDER;

  return parseProviderOrder(taskSpecific || process.env.LLM_PROVIDER_ORDER);
}

function getGoogleApiKey(): string {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  ).trim();
}

function getGoogleModel(task: LlmTask, override?: string): string {
  if (override) return override;

  if (task === "learner" && process.env.LEARNER_GOOGLE_LLM_MODEL) {
    return process.env.LEARNER_GOOGLE_LLM_MODEL;
  }
  if (task === "postmortem" && process.env.POSTMORTEM_GOOGLE_LLM_MODEL) {
    return process.env.POSTMORTEM_GOOGLE_LLM_MODEL;
  }
  return process.env.GOOGLE_LLM_MODEL || "gemini-2.5-flash";
}

function getLegacyApiUrl(override?: string): string {
  return (
    override ||
    process.env.LEGACY_LLM_API_URL ||
    process.env.NVIDIA_LLM_API_URL ||
    DEFAULT_LEGACY_API_URL
  ).trim();
}

function normalizeLegacyModel(model: string): string {
  const normalized = model.trim();
  if (!normalized) return normalized;

  // NVIDIA currently exposes GLM-5 under `z-ai/glm5`. Keep this alias to avoid
  // silent 404 regressions when older envs still use the dashed variant.
  if (normalized === "z-ai/glm-5") {
    return "z-ai/glm5";
  }

  return normalized;
}

function extractBalancedSegment(text: string, start: number, openChar: string, closeChar: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractJsonValue(text: string): string | null {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");

  const candidates = [objectStart, arrayStart]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  for (const start of candidates) {
    const openChar = text[start];
    const closeChar = openChar === "{" ? "}" : "]";
    const segment = extractBalancedSegment(text, start, openChar, closeChar);
    if (segment) return segment;
  }

  return null;
}

function tryParseJson(text: string): any | null {
  if (!text || !text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractJsonValue(text);
    if (!extracted) return null;
    try {
      return JSON.parse(extracted);
    } catch {
      return null;
    }
  }
}

function flattenMessageContent(content: any): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function parseLegacyChatResponse(data: any): { parsed: any | null; rawText: string } {
  const message = data?.choices?.[0]?.message;
  const content = flattenMessageContent(message?.content);
  const reasoning = String(message?.reasoning_content || message?.reasoning || "").trim();
  const rawText = content || reasoning;

  for (const candidate of [content, reasoning]) {
    const parsed = tryParseJson(candidate);
    if (parsed !== null) {
      return { parsed, rawText: candidate };
    }
  }

  return { parsed: null, rawText };
}

function formatAttempts(attempts: LlmAttempt[]): string {
  return attempts
    .map((attempt) => `${attempt.provider}:${attempt.model}:${attempt.success ? "ok" : attempt.reason || "failed"}`)
    .join(" | ");
}

export async function generateStructuredLlm<TOutput>(
  request: StructuredLlmRequest<TOutput>
): Promise<StructuredLlmResult<TOutput>> {
  const attempts: LlmAttempt[] = [];
  const providerOrder = getProviderOrder(request.task);
  const hasTools = !!request.tools && Object.keys(request.tools).length > 0;

  for (const provider of providerOrder) {
    if (provider === "google") {
      const apiKey = getGoogleApiKey();
      const model = getGoogleModel(request.task, request.googleModel);

      if (!apiKey) {
        attempts.push({ provider, model, success: false, reason: "missing_google_api_key" });
        continue;
      }

      try {
        const google = createGoogleGenerativeAI({ apiKey });
        const toolCalls = new Set<string>();
        let normalized: TOutput | null = null;
        let steps = 1;
        let rawText = "";

        if (hasTools) {
          const result: any = await generateText({
            model: google(model as any),
            system: `${request.system}\n\nAfter using tools, return exactly one JSON object and no markdown fences.`,
            prompt: request.prompt,
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: request.maxOutputTokens ?? 1024,
            tools: request.tools,
            toolChoice: request.toolChoice ?? "auto",
            stopWhen: stepCountIs(request.stopWhenSteps ?? 4),
            onStepFinish({ toolCalls: stepToolCalls }: any) {
              for (const toolCall of stepToolCalls || []) {
                if (toolCall?.toolName) toolCalls.add(toolCall.toolName);
              }
            },
          });

          rawText = String(result.text || "").trim();
          normalized = request.normalizeOutput(tryParseJson(rawText));
          steps = Array.isArray(result.steps) ? result.steps.length : 1;
        } else {
          try {
            const result: any = await generateObject({
              model: google(model as any),
              system: request.system,
              prompt: request.prompt,
              schema: jsonSchema(request.schema),
              schemaName: `${request.task}Response`,
              schemaDescription: `Structured response for ${request.task} task`,
              temperature: request.temperature ?? 0.2,
              maxOutputTokens: request.maxOutputTokens ?? 1024,
            });

            normalized = request.normalizeOutput(result.object);
            rawText = JSON.stringify(result.object);
          } catch {
            const result: any = await generateText({
              model: google(model as any),
              system: `${request.system}\n\nReturn exactly one JSON object and no markdown fences.`,
              prompt: request.prompt,
              temperature: request.temperature ?? 0.2,
              maxOutputTokens: request.maxOutputTokens ?? 1024,
            });

            rawText = String(result.text || "").trim();
            normalized = request.normalizeOutput(tryParseJson(rawText));
            steps = Array.isArray(result.steps) ? result.steps.length : 1;
          }
        }

        if (!normalized) {
          throw new Error(`google_structured_output_invalid:${rawText.slice(0, 120)}`);
        }

        attempts.push({ provider, model, success: true });

        return {
          output: normalized,
          provider,
          model,
          attempts,
          toolCalls: Array.from(toolCalls),
          steps,
          rawText,
        };
      } catch (error: any) {
        attempts.push({ provider, model, success: false, reason: error.message });
        logger.warn(`[LLM Gateway] Google ${request.task} failed: ${error.message}`);
        continue;
      }
    }

    let model = normalizeLegacyModel(request.legacyModel);
    let legacyApiUrl = getLegacyApiUrl(request.legacyApiUrl);
    let apiKey = (request.legacyApiKey || "").trim();

    if (provider === "legacy_fallback") {
      model = normalizeLegacyModel(process.env.NVIDIA_FALLBACK_MODEL || "z-ai/glm5");
      legacyApiUrl = (process.env.NVIDIA_FALLBACK_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions").trim();
      apiKey = (process.env.NVIDIA_FALLBACK_API_KEY || "").trim();
    }

    if (!apiKey) {
      attempts.push({ provider, model, success: false, reason: "missing_legacy_api_key" });
      continue;
    }

    try {
      const response = await axios.post(
        legacyApiUrl,
        {
          model,
          max_tokens: request.maxOutputTokens ?? 1024,
          temperature: request.temperature ?? 0.2,
          stream: false,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: request.legacyTimeoutMs ?? 20000,
        }
      );

      const { parsed, rawText } = parseLegacyChatResponse(response.data);
      const normalized = request.normalizeOutput(parsed);
      if (!normalized) {
        throw new Error(`legacy_structured_output_invalid:${rawText.slice(0, 120)}`);
      }

      attempts.push({ provider, model, success: true });

      return {
        output: normalized,
        provider,
        model,
        attempts,
        toolCalls: [],
        steps: 1,
        rawText,
      };
    } catch (error: any) {
      attempts.push({ provider, model, success: false, reason: error.message });
      logger.warn(`[LLM Gateway] ${provider} ${request.task} failed: ${error.message}`);
    }
  }

  throw new Error(`No LLM provider succeeded for ${request.task}. Attempts: ${formatAttempts(attempts)}`);
}
