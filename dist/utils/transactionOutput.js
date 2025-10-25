"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionOutput = void 0;
function transactionOutput(txn) {
    const type = txn.instructions[0].name === "sell" ? "SELL" : "BUY";
    let events = txn.events[0]?.data;
    let bondingCurve, mint, solAmount, tokenAmount, user;
    if (txn.instructions[0].accounts && txn.instructions[0].accounts.length > 3) {
        bondingCurve = txn.instructions[0].accounts[3]?.pubkey;
    }
    if (events) {
        mint = events?.mint;
        solAmount = events?.solAmount ? events.solAmount / 1000000000 : 0;
        tokenAmount = events?.tokenAmount;
        user = events?.user;
    }
    else if (txn.instructions[0]?.data) {
        const data = txn.instructions[0].data;
        if (data.amount) {
            tokenAmount = Number(data.amount);
        }
        if (data.maxSolCost || data.minSolOutput) {
            solAmount = (data.maxSolCost || data.minSolOutput) / 1000000000;
        }
    }
    return {
        type,
        mint,
        solAmount: solAmount || 0,
        tokenAmount,
        user,
        bondingCurve
    };
}
exports.transactionOutput = transactionOutput;
//# sourceMappingURL=transactionOutput.js.map