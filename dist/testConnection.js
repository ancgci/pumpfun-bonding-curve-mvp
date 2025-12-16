"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const shyft = process.env.SHYFT_RPC;
console.log("RPC URL:", shyft);
const connection = new web3_js_1.Connection(shyft, 'confirmed');
async function testConnection() {
    try {
        const slot = await connection.getSlot();
        console.log("Conexão bem-sucedida! Slot atual:", slot);
        const publicKey = new web3_js_1.PublicKey("11111111111111111111111111111111");
        const accountInfo = await connection.getAccountInfo(publicKey);
        console.log("Conta 1111 info:", accountInfo !== null);
    }
    catch (error) {
        console.error("Erro na conexão:", error);
    }
}
testConnection();
//# sourceMappingURL=testConnection.js.map