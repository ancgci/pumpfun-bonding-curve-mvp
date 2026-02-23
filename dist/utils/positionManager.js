"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.positionManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
const POSITIONS_FILE = path_1.default.join(__dirname, "../data/positions.json");
const DATA_DIR = path_1.default.join(__dirname, "../data");
class PositionManager {
    positions = new Map();
    constructor() {
        this.ensureDataDirectory();
    }
    async ensureDataDirectory() {
        try {
            await promises_1.default.mkdir(DATA_DIR, { recursive: true });
            logger_1.default.info(`✅ Diretório de dados criado/verificado: ${DATA_DIR}`);
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao criar diretório de dados:`, error.message);
        }
    }
    async savePosition(position) {
        try {
            this.positions.set(position.mint, position);
            await this.persistToDisk();
            logger_1.default.info(`💾 Posição salva: ${position.mint} (${position.buySolAmount} SOL)`);
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao salvar posição ${position.mint}:`, error.message);
            throw error;
        }
    }
    async updatePosition(mint, updates) {
        try {
            const existing = this.positions.get(mint);
            if (!existing) {
                throw new Error(`Posição ${mint} não encontrada`);
            }
            const updated = { ...existing, ...updates, lastCheckedAt: Date.now() };
            this.positions.set(mint, updated);
            await this.persistToDisk();
            logger_1.default.debug(`🔄 Posição atualizada: ${mint}`);
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao atualizar posição ${mint}:`, error.message);
            throw error;
        }
    }
    async closePosition(mint) {
        try {
            const position = this.positions.get(mint);
            if (position) {
                position.isActive = false;
                position.lastCheckedAt = Date.now();
                await this.persistToDisk();
                logger_1.default.info(`✅ Posição fechada: ${mint}`);
            }
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao fechar posição ${mint}:`, error.message);
        }
    }
    getPosition(mint) {
        return this.positions.get(mint);
    }
    getActivePositions() {
        return Array.from(this.positions.values()).filter(p => p.isActive);
    }
    getAllPositions() {
        return Array.from(this.positions.values());
    }
    async persistToDisk() {
        try {
            const data = JSON.stringify(Array.from(this.positions.values()), null, 2);
            await promises_1.default.writeFile(POSITIONS_FILE, data, "utf-8");
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao persistir posições no disco:`, error.message);
            throw error;
        }
    }
    async loadFromDisk() {
        try {
            const exists = await promises_1.default.stat(POSITIONS_FILE).catch(() => null);
            if (!exists) {
                logger_1.default.info("📝 Nenhum arquivo de posições encontrado. Iniciando com Map vazio.");
                return;
            }
            const data = await promises_1.default.readFile(POSITIONS_FILE, "utf-8");
            const positions = JSON.parse(data);
            this.positions.clear();
            positions.forEach(p => this.positions.set(p.mint, p));
            const activeCount = positions.filter(p => p.isActive).length;
            logger_1.default.info(`🔄 ${positions.length} posições carregadas do disco (${activeCount} ativas)`);
            if (activeCount > 0) {
                logger_1.default.warn(`⚠️  RECUPERADAS ${activeCount} POSIÇÕES ATIVAS APÓS RESTART:`);
                positions.filter(p => p.isActive).forEach(p => {
                    logger_1.default.warn(`   📌 ${p.mint}: ${p.buySolAmount} SOL (TP: ${p.takeProfit}%, SL: ${p.stopLoss}%)`);
                });
            }
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao carregar posições do disco:`, error.message);
            logger_1.default.info("📝 Iniciando com Map vazio de posições.");
        }
    }
    async cleanupOldPositions() {
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
                logger_1.default.info(`🧹 ${removedCount} posições antigas removidas`);
            }
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao limpar posições antigas:`, error.message);
        }
    }
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
exports.positionManager = new PositionManager();
exports.positionManager.loadFromDisk().catch(err => {
    logger_1.default.error("❌ Falha crítica ao carregar posições:", err);
});
setInterval(() => {
    exports.positionManager.cleanupOldPositions();
}, 24 * 60 * 60 * 1000);
//# sourceMappingURL=positionManager.js.map