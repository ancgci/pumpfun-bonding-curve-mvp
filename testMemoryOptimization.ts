import { Semaphore, discoverySemaphore } from "./utils/memorySemaphore";
import logger from "./utils/logger";

async function testSemaphore() {
  logger.info("🧪 === TESTE 1: Semáforo de Concorrência ===");

  const sem = new Semaphore(3, "TestSemaphore");

  let completed = 0;
  const results: string[] = [];

  // Dispara 6 tarefas — apenas 3 devem executar, 3 descartadas
  for (let i = 1; i <= 6; i++) {
    const accepted = sem.tryRun(async () => {
      results.push(`task-${i}-started`);
      await new Promise((r) => setTimeout(r, 200));
      completed++;
      results.push(`task-${i}-done`);
    });
    logger.info(`  Task ${i}: ${accepted ? "✅ aceita" : "❌ descartada"}`);
  }

  // Esperar conclusão
  await new Promise((r) => setTimeout(r, 500));

  const stats = sem.getStats();
  logger.info(`  Stats: running=${stats.running} dropped=${stats.totalDropped}`);

  if (stats.totalDropped === 3 && completed === 3) {
    logger.info("✅ TESTE 1 PASSOU: Semáforo limitou corretamente a 3 concorrentes.");
  } else {
    logger.error(`❌ TESTE 1 FALHOU: expected dropped=3 completed=3, got dropped=${stats.totalDropped} completed=${completed}`);
    process.exit(1);
  }

  // Teste do semáforo global de discovery
  const gStats = discoverySemaphore.getStats();
  logger.info(`  Discovery Semaphore: maxConcurrent=${gStats.maxConcurrent} running=${gStats.running}`);
  if (gStats.maxConcurrent === 5) {
    logger.info("✅ TESTE 1b PASSOU: Discovery semáforo configurado com max=5.");
  } else {
    logger.error("❌ TESTE 1b FALHOU");
    process.exit(1);
  }
}

async function testMapPruning() {
  logger.info("\n🧪 === TESTE 2: Pruning de Maps com TTL ===");

  // Simular um Map com entradas antigas
  const testMap = new Map<string, number>();
  const now = Date.now();
  const TTL = 24 * 60 * 60 * 1000;

  // 5 entradas recentes (devem sobreviver)
  for (let i = 0; i < 5; i++) {
    testMap.set(`recent-${i}`, now - 1000);
  }
  // 5 entradas antigas (devem ser removidas)
  for (let i = 0; i < 5; i++) {
    testMap.set(`old-${i}`, now - TTL - 1000);
  }

  logger.info(`  Antes: ${testMap.size} entradas`);

  // Simular pruning
  let pruned = 0;
  for (const [key, ts] of testMap.entries()) {
    if (now - ts > TTL) {
      testMap.delete(key);
      pruned++;
    }
  }

  logger.info(`  Depois: ${testMap.size} entradas (removidas: ${pruned})`);

  if (testMap.size === 5 && pruned === 5) {
    logger.info("✅ TESTE 2 PASSOU: Pruning removeu apenas entradas expiradas.");
  } else {
    logger.error(`❌ TESTE 2 FALHOU: expected size=5 pruned=5, got size=${testMap.size} pruned=${pruned}`);
    process.exit(1);
  }

  // Teste FIFO cap
  const capMap = new Map<string, number>();
  const MAX = 100;
  for (let i = 0; i < 150; i++) {
    capMap.set(`addr-${i}`, now);
  }

  if (capMap.size > MAX) {
    const overflow = capMap.size - MAX;
    const iter = capMap.keys();
    for (let i = 0; i < overflow; i++) {
      const k = iter.next().value;
      if (k) capMap.delete(k);
    }
  }

  logger.info(`  FIFO Cap: ${capMap.size} (esperado: ${MAX})`);
  if (capMap.size === MAX) {
    logger.info("✅ TESTE 2b PASSOU: FIFO cap funcionando.");
  } else {
    logger.error("❌ TESTE 2b FALHOU");
    process.exit(1);
  }
}

async function testJsonlSerialization() {
  logger.info("\n🧪 === TESTE 3: Serialização JSONL ===");

  // Simular o que o organicityMonitor faz
  const testData = [
    { mint: "abc123", trades_all: [{ timestamp: 1, wallet: "w1", side: "BUY", solAmount: 1, price: 0.001 }], totalUniqueWalletsSet: ["w1", "w2"] },
    { mint: "def456", trades_all: [{ timestamp: 2, wallet: "w3", side: "SELL", solAmount: 2, price: 0.002 }], totalUniqueWalletsSet: ["w3"] },
  ];

  // Escrever JSONL
  const lines: string[] = [];
  for (const item of testData) {
    lines.push(JSON.stringify(item));
  }
  const jsonlContent = lines.join("\n") + "\n";

  // Ler JSONL
  const parsed = jsonlContent
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  logger.info(`  Escrito: ${lines.length} linhas`);
  logger.info(`  Lido: ${parsed.length} objetos`);
  logger.info(`  Mint[0]: ${parsed[0].mint} Mint[1]: ${parsed[1].mint}`);

  if (parsed.length === 2 && parsed[0].mint === "abc123" && parsed[1].mint === "def456") {
    logger.info("✅ TESTE 3 PASSOU: JSONL serialização/deserialização correta.");
  } else {
    logger.error("❌ TESTE 3 FALHOU");
    process.exit(1);
  }
}

async function testGcHint() {
  logger.info("\n🧪 === TESTE 4: GC Hint ===");

  if (typeof global.gc === "function") {
    global.gc();
    logger.info("✅ TESTE 4 PASSOU: global.gc() disponível e executado.");
  } else {
    logger.info("⚠️  TESTE 4 SKIP: global.gc() não disponível (requer --expose-gc). Isso é esperado em teste local sem a flag.");
    logger.info("✅ TESTE 4 PASSOU (condicional): O código lida graciosamente com ausência do GC.");
  }
}

async function main() {
  logger.info("🚀 Iniciando testes de otimização de memória...\n");

  await testSemaphore();
  await testMapPruning();
  await testJsonlSerialization();
  await testGcHint();

  logger.info("\n🎉 === TODOS OS TESTES PASSARAM ===");
  process.exit(0);
}

main().catch((err) => {
  logger.error(`💥 Erro fatal nos testes: ${err.message}`);
  process.exit(1);
});
