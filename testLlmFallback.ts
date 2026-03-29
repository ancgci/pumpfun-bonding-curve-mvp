import dotenv from "dotenv";
import { generateStructuredLlm, LlmTask } from "./utils/llmGateway";
import logger from "./utils/logger";

dotenv.config();

async function testLlmFallback() {
  logger.info("🧪 Iniciando teste de FALLBACK do LLM Gateway...");

  const testRequest = {
    task: "agent" as LlmTask,
    system: "Você é um assistente de teste. Responda apenas em JSON válido.",
    prompt: "Gere um objeto JSON com o campo 'status' igual a 'ok'.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string" }
      },
      required: ["status"]
    },
    normalizeOutput: (raw: any) => {
      if (raw && raw.status === "ok") return raw;
      return null;
    },
    // FORÇANDO FALHA NO GOOGLE usando um modelo inexistente
    googleModel: "modelo-inexistente-para-testar-fallback",
    legacyModel: process.env.NVIDIA_FALLBACK_MODEL || "z-ai/glm5"
  };

  try {
    const result = await generateStructuredLlm(testRequest);
    logger.info(`✅ Teste de FALLBACK concluído!`);
    logger.info(`📡 Provedor que Respondeu: ${result.provider}`);
    logger.info(`🤖 Modelo: ${result.model}`);
    
    logger.info("📋 Histórico de tentativas:");
    result.attempts.forEach((att, i) => {
      logger.info(`   [${i+1}] ${att.provider} (${att.model}): ${att.success ? "SUCESSO" : "FALHA (" + att.reason + ")"}`);
    });

    if (result.provider !== "google") {
      logger.info("🚀 O Fallback funcionou corretamente!");
    } else {
      logger.error("❌ O Fallback NÃO foi acionado (o Google respondeu mesmo com modelo inválido?)");
    }

  } catch (error: any) {
    logger.error(`❌ Falha total: ${error.message}`);
  }
}

testLlmFallback();
