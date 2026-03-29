import dotenv from "dotenv";
import { generateStructuredLlm, LlmTask } from "./utils/llmGateway";
import logger from "./utils/logger";

dotenv.config();

async function testGroqOnly() {
  logger.info("🧪 Iniciando teste específico da GROQ...");

  const testRequest = {
    // Definimos uma task qualquer
    task: "agent" as LlmTask,
    system: "Você é um assistente de teste da Groq. Responda apenas em JSON válido.",
    prompt: "Gere um objeto JSON com o campo 'provider' igual a 'groq' e 'working' igual a true.",
    schema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        working: { type: "boolean" }
      },
      required: ["provider", "working"]
    },
    normalizeOutput: (raw: any) => {
      if (raw && raw.provider === "groq") return raw;
      return null;
    },
    // Definimos o modelo que sabemos que a Groq tem (via .env)
    legacyModel: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
    // Sobrescrevemos o providerOrder para testar APENAS a Groq (legacy)
    googleModel: "force-failure", // Não usado se mudarmos a ordem ou forçarmos
  };

  try {
    // Guardamos o valor original para restaurar depois se necessário, 
    // ou apenas passamos no override do gateway se ele suportasse (não suporta override de ordem via parâmetro ainda).
    // Mas podemos simular mudando a env temporariamente no processo.
    process.env.LLM_PROVIDER_ORDER = "legacy";

    const result = await generateStructuredLlm(testRequest);

    logger.info(`✅ Teste da GROQ Concluído!`);
    logger.info(`📡 Provedor que Respondeu: ${result.provider}`);
    logger.info(`🤖 Modelo: ${result.model}`);
    logger.info(`📄 Saída: ${JSON.stringify(result.output)}`);
    
    if (result.provider === "legacy" || result.model.includes("llama")) {
      logger.info("🚀 A Groq está funcionando perfeitamente via gateway!");
    } else {
      logger.warn(`⚠️ O provedor que respondeu foi ${result.provider}. Verifique a ordem no .env.`);
    }

  } catch (error: any) {
    logger.error(`❌ Falha ao conectar com a Groq: ${error.message}`);
    logger.info("Dica: Verifique se o endpoint da Groq e a chave gsk_... estão corretas no .env");
  }
}

testGroqOnly();
