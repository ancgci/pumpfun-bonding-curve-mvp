import axios from "axios";
import logger from "./logger";

/**
 * Notifica o servidor de dashboard para realizar o broadcast via WebSocket
 */
export async function notifyDashboardUpdate() {
    try {
        // O dashboard roda na porta 3001 por padrão
        await axios.post("http://localhost:3001/api/internal/broadcast", {}, { timeout: 1000 });
    } catch (error: any) {
        // Silencioso se o dashboard não estiver rodando
        if (error.code !== 'ECONNREFUSED') {
            logger.debug(`[Dashboard] Falha ao notificar broadcast: ${error.message}`);
        }
    }
}
