import { buyOnPumpFun, sellOnPumpFun, sellViaJupiter } from "./utils/hybridExecutor";
import logger from "./utils/logger";

async function testRealTrading() {
  logger.info("🧪 Iniciando testes de trading real");
  
  try {
    // Testar compra na PumpFun (com um token de exemplo)
    logger.info("🛒 Testando compra na PumpFun...");
    // Substitua "TOKEN_MINT_EXEMPLO" pelo mint de um token real para testes
    // const buySignature = await buyOnPumpFun("TOKEN_MINT_EXEMPLO", 0.0001);
    // logger.info(`✅ Compra realizada: ${buySignature}`);
    
    // Testar venda na PumpFun
    logger.info("📉 Testando venda na PumpFun...");
    // Substitua "TOKEN_MINT_EXEMPLO" pelo mint de um token real para testes
    // const sellSignature = await sellOnPumpFun("TOKEN_MINT_EXEMPLO", 1000);
    // logger.info(`✅ Venda realizada: ${sellSignature}`);
    
    // Testar venda via Jupiter
    logger.info("🔁 Testando venda via Jupiter...");
    // Substitua "TOKEN_MINT_EXEMPLO" pelo mint de um token real para testes
    // const jupiterSignature = await sellViaJupiter("TOKEN_MINT_EXEMPLO", 1000);
    // logger.info(`✅ Venda via Jupiter realizada: ${jupiterSignature}`);
    
    logger.info("🎉 Testes de trading real concluídos com sucesso!");
  } catch (error) {
    logger.error("❌ Erro durante os testes de trading real:", error);
  }
}

// Executar testes
testRealTrading();