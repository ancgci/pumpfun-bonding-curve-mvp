"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenBalance = getTokenBalance;
exports.getTokenHolders = getTokenHolders;
exports.getTokenVolume = getTokenVolume;
exports.getTokenAge = getTokenAge;
var myHeaders = new Headers();
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const api = process.env.SHYFT_RPC;
myHeaders.append("x-api-key", api);
var requestOptions = {
    method: "GET",
    headers: myHeaders,
    redirect: "follow",
};
async function getTokenBalance(address) {
    const info = await fetch(`https://api.shyft.to/sol/v1/wallet/all_tokens?network=mainnet-beta&wallet=${address}`, requestOptions);
    const infoJson = await info.json();
    const result = infoJson?.result[0];
    const ca = result?.address;
    const name = result?.info?.name;
    const symbol = result?.info.symbol;
    const balance = result?.balance;
    return {
        name,
        symbol,
        ca,
        balance,
    };
}
async function getTokenHolders(tokenAddress) {
    try {
        const response = await fetch(`https://api.shyft.to/sol/v1/token/holders?network=mainnet-beta&token=${tokenAddress}`, requestOptions);
        const data = await response.json();
        return data?.result?.length || 0;
    }
    catch (error) {
        console.error("Error fetching token holders:", error);
        return 0;
    }
}
async function getTokenVolume(tokenAddress) {
    try {
        const response = await fetch(`https://api.shyft.to/sol/v1/token/transfers?network=mainnet-beta&token=${tokenAddress}&limit=100`, requestOptions);
        const data = await response.json();
        let totalVolume = 0;
        if (data?.result) {
            data.result.forEach(transfer => {
                totalVolume += transfer.amount;
            });
        }
        return totalVolume;
    }
    catch (error) {
        console.error("Error fetching token volume:", error);
        return 0;
    }
}
async function getTokenAge(tokenAddress) {
    try {
        const response = await fetch(`https://api.shyft.to/sol/v1/token/info?network=mainnet-beta&token=${tokenAddress}`, requestOptions);
        const data = await response.json();
        const createdAt = data?.result?.created_at;
        if (createdAt) {
            const createdTime = new Date(createdAt);
            const now = new Date();
            const diffHours = Math.floor((now.getTime() - createdTime.getTime()) / (1000 * 60 * 60));
            return `${diffHours}h`;
        }
        return "Unknown";
    }
    catch (error) {
        console.error("Error fetching token age:", error);
        return "Unknown";
    }
}
//# sourceMappingURL=token.js.map