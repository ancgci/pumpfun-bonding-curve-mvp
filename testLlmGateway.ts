import dotenv from "dotenv";
import { generateStructuredLlm, LlmTask } from "./utils/llmGateway";
import logger from "./utils/logger";

dotenv.config();

async function testLlmGateway() {
  logger.info("🧪 Iniciando teste do LLM Gateway...");

  const testRequest = {
    task: "agent" as LlmTask,
    system: "Você é um assistente de teste. Responda apenas em JSON válido.",
    prompt: "Gere um objeto JSON com o campo 'status' igual a 'ok' e 'message' igual a 'Teste concluído com sucesso'.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        message: { type: "string" }
      },
      required: ["status", "message"]
    },
    normalizeOutput: (raw: any) => {
      if (raw && raw.status === "ok") return raw;
      return null;
    },
    googleModel: process.env.GOOGLE_LLM_MODEL,
    legacyModel: process.env.LLM_MODEL || "llama-3.3-70b-versatile"
  };

  try {
    const result = await generateStructuredLlm(testRequest);
    logger.info(`✅ Teste bem-sucedido!`);
    logger.info(`📡 Provedor Utilizado: ${result.provider}`);
    logger.info(`🤖 Modelo: ${result.model}`);
    logger.info(`📄 Saída: ${JSON.stringify(result.output)}`);
    
    if (result.attempts.length > 1) {
      logger.warn("⚠️ Houve falhas em provedores anteriores:");
      result.attempts.forEach((att, i) => {
        if (!att.success) {
          logger.warn(`   - Tentativa ${i+1} (${att.provider}): ${att.reason}`);
        }
      });
    }

  } catch (error: any) {
    logger.error(`❌ Falha total no LLM Gateway: ${error.message}`);
  }
}

testLlmGateway();
