import winston from 'winston';
import path from 'path';

// Cria o diretório de logs se não existir
const logsDir = path.join(__dirname, '..', 'logs');
try {
  require('fs').mkdirSync(logsDir, { recursive: true });
} catch (error) {
  // O diretório pode já existir
}

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
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

// Se não estiver em produção, também loga no console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} ${level}: ${message}`;
      })
    )
  }));
}

export default logger;