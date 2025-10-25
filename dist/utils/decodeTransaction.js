"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeTransact = void 0;
const bs58_1 = __importDefault(require("bs58"));
function decodeTransact(data) {
    const output = data ? bs58_1.default.encode(Buffer.from(data, 'base64')) : "";
    return output;
}
exports.decodeTransact = decodeTransact;
//# sourceMappingURL=decodeTransaction.js.map