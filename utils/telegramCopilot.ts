import { generateStructuredLlm } from "./llmGateway";
import logger from "./logger";
import { buildDashboardCopilotContext, getDashboardSnapshot, type DashboardSnapshot } from "./dashboardSnapshot";

export interface TelegramCopilotResult {
  reply: string;
  snapshot: DashboardSnapshot;
  provider: string;
  model: string;
}

export async function answerTelegramCopilotQuestion(
  question: string,
  options?: { includeLogs?: boolean }
): Promise<TelegramCopilotResult> {
  const snapshot = getDashboardSnapshot({
    includeLogs: options?.includeLogs !== false,
    recentLogsLimit: 10,
    recentTradesLimit: 5,
    recentPositionsLimit: 6,
    recentFunnelEventsLimit: 5,
  });

  const systemPrompt = [
    "Você é o Antigravity Copilot, assistente operacional via Telegram de um bot de trading Solana.",
    "Responda sempre em pt-BR.",
    "Seja curto, direto e objetivo. Use no máximo 4 frases curtas.",
    "Baseie-se apenas no contexto fornecido do dashboard e logs recentes.",
    "Quando citar causa, métrica ou estado, use os dados do contexto; não invente.",
    "Se o contexto não bastar, diga isso explicitamente.",
    "Se houver risco operacional evidente, aponte em 1 frase final.",
    'Sua saída final deve ser JSON puro no formato {"reply":"..."} sem markdown.',
  ].join(" ");

  const prompt = [
    `Pergunta do usuário: ${question.trim()}`,
    "",
    "[CONTEXTO ATUAL DO DASHBOARD]",
    buildDashboardCopilotContext(snapshot),
  ].join("\n");

  const result = await generateStructuredLlm<{ reply: string }>({
    task: "chatops_copilot",
    legacyModel: process.env.NVIDIA_FALLBACK_MODEL || "z-ai/glm5",
    googleModel: process.env.CHATOPS_GOOGLE_LLM_MODEL || process.env.GOOGLE_LLM_MODEL || "gemini-2.5-flash",
    system: systemPrompt,
    prompt,
    schema: {
      type: "object",
      required: ["reply"],
      properties: {
        reply: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    normalizeOutput: (raw) => {
      if (!raw || typeof raw.reply !== "string") return null;
      const reply = raw.reply.trim();
      return reply ? { reply } : null;
    },
    maxOutputTokens: 400,
    temperature: 0.15,
  });

  logger.info(
    `[TelegramCopilot] pergunta respondida via ${result.provider}/${result.model} ` +
    `(steps=${result.steps}, toolCalls=${result.toolCalls.join(",") || "none"})`
  );

  return {
    reply: result.output.reply,
    snapshot,
    provider: result.provider,
    model: result.model,
  };
}
