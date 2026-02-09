import fs from "fs/promises";
import path from "path";
import logger from "./logger";

// Interface para posições persistidas
export interface Position {
    mint: string;
    bondingCurve: string;
    buySignature: string;
    buySolAmount: number;
    buyTokenAmount: number;
    buyTimestamp: number;
    takeProfit: number;
    stopLoss: number;
    isActive: boolean;
    lastCheckedAt?: number;
}

const POSITIONS_FILE = path.join(__dirname, "../data/positions.json");
const DATA_DIR = path.join(__dirname, "../data");

class PositionManager {
    private positions: Map<string, Position> = new Map();

    constructor() {
        this.ensureDataDirectory();
    }

    /**
     * Garante que o diretório de dados existe
     */
    private async ensureDataDirectory(): Promise<void> {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            logger.info(`✅ Diretório de dados criado/verificado: ${DATA_DIR}`);
        } catch (error: any) {
            logger.error(`❌ Erro ao criar diretório de dados:`, error.message);
        }
    }

    /**
     * Salvar uma posição
     */
    async savePosition(position: Position): Promise<void> {
        try {
            this.positions.set(position.mint, position);
            await this.persistToDisk();
            logger.info(`💾 Posição salva: ${position.mint} (${position.buySolAmount} SOL)`);
        } catch (error: any) {
            logger.error(`❌ Erro ao salvar posição ${position.mint}:`, error.message);
            throw error;
        }
    }

    /**
     * Atualizar uma posição existente
     */
    async updatePosition(mint: string, updates: Partial<Position>): Promise<void> {
        try {
            const existing = this.positions.get(mint);
            if (!existing) {
                throw new Error(`Posição ${mint} não encontrada`);
            }

            const updated = { ...existing, ...updates, lastCheckedAt: Date.now() };
            this.positions.set(mint, updated);
            await this.persistToDisk();

            logger.debug(`🔄 Posição atualizada: ${mint}`);
        } catch (error: any) {
            logger.error(`❌ Erro ao atualizar posição ${mint}:`, error.message);
            throw error;
        }
    }

    /**
     * Marcar posição como inativa (vendida)
     */
    async closePosition(mint: string): Promise<void> {
        try {
            const position = this.positions.get(mint);
            if (position) {
                position.isActive = false;
                position.lastCheckedAt = Date.now();
                await this.persistToDisk();
                logger.info(`✅ Posição fechada: ${mint}`);
            }
        } catch (error: any) {
            logger.error(`❌ Erro ao fechar posição ${mint}:`, error.message);
        }
    }

    /**
     * Obter posição específica
     */
    getPosition(mint: string): Position | undefined {
        return this.positions.get(mint);
    }

    /**
     * Obter todas as posições ativas
     */
    getActivePositions(): Position[] {
        return Array.from(this.positions.values()).filter(p => p.isActive);
    }

    /**
     * Obter todas as posições (ativas e inativas)
     */
    getAllPositions(): Position[] {
        return Array.from(this.positions.values());
    }

    /**
     * Persistir no disco
     */
    private async persistToDisk(): Promise<void> {
        try {
            const data = JSON.stringify(Array.from(this.positions.values()), null, 2);
            await fs.writeFile(POSITIONS_FILE, data, "utf-8");
        } catch (error: any) {
            logger.error(`❌ Erro ao persistir posições no disco:`, error.message);
            throw error;
        }
    }

    /**
     * Carregar posições do disco (recovery após restart)
     */
    async loadFromDisk(): Promise<void> {
        try {
            const exists = await fs.stat(POSITIONS_FILE).catch(() => null);
            if (!exists) {
                logger.info("📝 Nenhum arquivo de posições encontrado. Iniciando com Map vazio.");
                return;
            }

            const data = await fs.readFile(POSITIONS_FILE, "utf-8");
            const positions: Position[] = JSON.parse(data);

            this.positions.clear();
            positions.forEach(p => this.positions.set(p.mint, p));

            const activeCount = positions.filter(p => p.isActive).length;
            logger.info(`🔄 ${positions.length} posições carregadas do disco (${activeCount} ativas)`);

            // Log de posições ativas recuperadas
            if (activeCount > 0) {
                logger.warn(`⚠️  RECUPERADAS ${activeCount} POSIÇÕES ATIVAS APÓS RESTART:`);
                positions.filter(p => p.isActive).forEach(p => {
                    logger.warn(`   📌 ${p.mint}: ${p.buySolAmount} SOL (TP: ${p.takeProfit}%, SL: ${p.stopLoss}%)`);
                });
            }
        } catch (error: any) {
            logger.error(`❌ Erro ao carregar posições do disco:`, error.message);
            logger.info("📝 Iniciando com Map vazio de posições.");
        }
    }

    /**
     * Limpar posições inativas antigas (mais de 7 dias)
     */
    async cleanupOldPositions(): Promise<void> {
        try {
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            let removedCount = 0;

            for (const [mint, position] of this.positions.entries()) {
                if (!position.isActive && position.buyTimestamp < sevenDaysAgo) {
                    this.positions.delete(mint);
                    removedCount++;
                }
            }

            if (removedCount > 0) {
                await this.persistToDisk();
                logger.info(`🧹 ${removedCount} posições antigas removidas`);
            }
        } catch (error: any) {
            logger.error(`❌ Erro ao limpar posições antigas:`, error.message);
        }
    }

    /**
     * Obter estatísticas de posições
     */
    getStats() {
        const all = this.getAllPositions();
        const active = all.filter(p => p.isActive);
        const closed = all.filter(p => !p.isActive);

        const totalInvested = active.reduce((sum, p) => sum + p.buySolAmount, 0);

        return {
            total: all.length,
            active: active.length,
            closed: closed.length,
            totalInvested: totalInvested.toFixed(4),
        };
    }
}

// Singleton para uso global
export const positionManager = new PositionManager();

// Carregar posições existentes ao inicializar
positionManager.loadFromDisk().catch(err => {
    logger.error("❌ Falha crítica ao carregar posições:", err);
});

// Limpar posições antigas periodicamente (a cada 24h)
setInterval(() => {
    positionManager.cleanupOldPositions();
}, 24 * 60 * 60 * 1000);
