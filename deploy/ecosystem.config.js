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

const PROJECT_DIR = '/home/srant/projects/pumpfun-bonding-curve-Test';

module.exports = {
    apps: [
        // ── Trading Bot ────────────────────────────────────────────
        {
            name: 'bot',
            script: 'npx',
            args: 'ts-node index.ts',
            cwd: PROJECT_DIR,
            node_args: '--max-old-space-size=8192',
            env: {
                NODE_ENV: 'production',
            },
            // Restart policy
            max_restarts: 10,
            min_uptime: '10s',
            restart_delay: 5000,
            autorestart: true,
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
            script: 'npx',
            args: 'ts-node server.ts',
            cwd: `${PROJECT_DIR}/dashboard-api`,
            env: {
                NODE_ENV: 'production',
            },
            // Restart policy
            max_restarts: 10,
            min_uptime: '5s',
            restart_delay: 3000,
            autorestart: true,
            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: `${PROJECT_DIR}/logs/api-error.log`,
            out_file: `${PROJECT_DIR}/logs/api-out.log`,
            merge_logs: true,
            max_size: '20M',
            retain: 5,
        },
    ],
};
