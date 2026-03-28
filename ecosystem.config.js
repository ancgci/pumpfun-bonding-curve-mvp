/**
 * PM2 Ecosystem Configuration
 * Manages the bot and dashboard API processes.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 status
 *   pm2 logs
 */

const fs = require('fs');
const path = require('path');

const ROOT_CANDIDATES = [__dirname, path.resolve(__dirname, '..')];
const PROJECT_DIR = ROOT_CANDIDATES.find((dir) =>
    fs.existsSync(path.join(dir, 'package.json')) &&
    fs.existsSync(path.join(dir, 'index.ts'))
) || __dirname;
const TS_NODE_BIN = path.join(PROJECT_DIR, 'node_modules', 'ts-node', 'dist', 'bin.js');

module.exports = {
    apps: [
        // ── Trading Bot ────────────────────────────────────────────
        {
            name: 'bot',
            script: TS_NODE_BIN,
            args: 'index.ts',
            interpreter: 'node',
            cwd: PROJECT_DIR,
            node_args: '--max-old-space-size=8192',
            env: {
                NODE_ENV: 'production',
                POSTMORTEM_AGENT_ENABLED: process.env.POSTMORTEM_AGENT_ENABLED || 'true',
                POSTMORTEM_LLM_ENABLED: process.env.POSTMORTEM_LLM_ENABLED || 'false',
                POSTMORTEM_BATCH_SIZE: process.env.POSTMORTEM_BATCH_SIZE || '20',
                POSTMORTEM_INTERVAL_MS: process.env.POSTMORTEM_INTERVAL_MS || '300000',
                LEARNER_INTERVAL_MS: process.env.LEARNER_INTERVAL_MS || '3600000',
            },
            // Restart policy
            max_restarts: 10,
            min_uptime: '10s',
            restart_delay: 5000,
            autorestart: true,
            kill_timeout: 10000,
            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: `${PROJECT_DIR}/logs/bot-error.log`,
            out_file: `${PROJECT_DIR}/logs/bot-out.log`,
            merge_logs: true,
            max_size: '50M',      // rotate logs at 50MB
            retain: 5,            // keep 5 rotated files
        },

        // ── Dashboard API ──────────────────────────────────────────
        {
            name: 'dashboard-api',
            script: TS_NODE_BIN,
            args: 'server.ts',
            interpreter: 'node',
            cwd: `${PROJECT_DIR}/dashboard-api`,
            env: {
                NODE_ENV: 'production',
            },
            // Restart policy
            max_restarts: 10,
            min_uptime: '5s',
            restart_delay: 3000,
            autorestart: true,
            kill_timeout: 10000,
            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: `${PROJECT_DIR}/logs/api-error.log`,
            out_file: `${PROJECT_DIR}/logs/api-out.log`,
            merge_logs: true,
            max_size: '20M',
            retain: 5,
        },

        // ── Telegram ChatOps ───────────────────────────────────────
        {
            name: 'chatops',
            script: TS_NODE_BIN,
            args: 'scripts/telegram-chatops.ts',
            interpreter: 'node',
            cwd: PROJECT_DIR,
            env: {
                NODE_ENV: 'production',
            },
            max_restarts: 10,
            autorestart: true,
            kill_timeout: 3000,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: `${PROJECT_DIR}/logs/chatops-error.log`,
            out_file: `${PROJECT_DIR}/logs/chatops-out.log`,
            merge_logs: true,
            max_size: '10M',
        },
    ],
};
