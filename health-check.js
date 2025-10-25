const http = require('http');
const fs = require('fs');
const path = require('path');

// Função para verificar se o processo principal está rodando
function checkProcessHealth() {
  try {
    // Verificar se o arquivo de PID existe
    const pidFile = path.join(__dirname, 'bot.pid');
    if (fs.existsSync(pidFile)) {
      const pid = fs.readFileSync(pidFile, 'utf8').trim();
      // Tentar enviar um sinal 0 para verificar se o processo existe
      process.kill(pid, 0);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Função para verificar o arquivo de endereços monitorados
function checkAddressesFile() {
  try {
    const addressesFile = path.join(__dirname, 'sent_addresses.json');
    return fs.existsSync(addressesFile);
  } catch (error) {
    return false;
  }
}

// Função para verificar os arquivos de log
function checkLogFiles() {
  try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      return false;
    }
    
    const logFiles = ['combined.log', 'error.log', 'alerts.log'];
    return logFiles.every(file => fs.existsSync(path.join(logsDir, file)));
  } catch (error) {
    return false;
  }
}

// Criar servidor HTTP
const server = http.createServer((req, res) => {
  // Configurar cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Responder a requisições OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Verificar saúde do sistema
  const processHealthy = checkProcessHealth();
  const addressesFileExists = checkAddressesFile();
  const logsHealthy = checkLogFiles();
  
  const overallHealth = processHealthy && addressesFileExists && logsHealthy;
  
  const healthData = {
    status: overallHealth ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      process: {
        status: processHealthy ? 'ok' : 'error',
        details: processHealthy ? 'Processo principal está rodando' : 'Processo principal não encontrado'
      },
      addressesFile: {
        status: addressesFileExists ? 'ok' : 'warning',
        details: addressesFileExists ? 'Arquivo de endereços encontrado' : 'Arquivo de endereços não encontrado'
      },
      logs: {
        status: logsHealthy ? 'ok' : 'warning',
        details: logsHealthy ? 'Arquivos de log encontrados' : 'Arquivos de log não encontrados'
      }
    },
    uptime: process.uptime()
  };
  
  res.writeHead(overallHealth ? 200 : 503, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(healthData, null, 2));
});

// Iniciar servidor na porta 3000
const PORT = process.env.HEALTH_CHECK_PORT || 3000;
server.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down health check server...');
  server.close(() => {
    console.log('Health check server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down health check server...');
  server.close(() => {
    console.log('Health check server closed.');
    process.exit(0);
  });
});