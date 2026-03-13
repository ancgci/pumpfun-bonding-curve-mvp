"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const logsDir = path_1.default.join(__dirname, '..', 'logs');
try {
    require('fs').mkdirSync(logsDir, { recursive: true });
}
catch (error) {
}
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
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({
        format: timezoned
    }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json()),
    defaultMeta: { service: 'pumpfun-monitor' },
    transports: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'alerts.log'),
            level: 'warn',
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});
logger.add(new winston_1.default.transports.Console({
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({
        format: timezoned
    }), winston_1.default.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} ${level}: ${message}`;
    }))
}));
exports.default = logger;
//# sourceMappingURL=logger.js.map