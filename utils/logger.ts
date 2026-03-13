import winston from 'winston';
import path from 'path';

// Cria o diretório de logs se não existir
const logsDir = path.join(__dirname, '..', 'logs');
try {
  require('fs').mkdirSync(logsDir, { recursive: true });
} catch (error) {
  // O diretório pode já existir
}

// Helper custom para forçar fuso horário de Brasília (GMT-3)
const timezoned = () => {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(',', '');
};

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: timezoned
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'pumpfun-monitor' },
  transports: [
    // Escreve todos os logs com nível `info` e abaixo para `combined.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // Escreve todos os logs de erro para `error.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // Escreve logs de alerta para `alerts.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'alerts.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Sempre loga no console para que o usuário veja a execução
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
      format: timezoned
    }),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  )
}));

export default logger;