"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flashLoan = void 0;
const klend_sdk_1 = require("@kamino-finance/klend-sdk");
const web3_js_1 = require("@solana/web3.js");
async function flashLoan(borrowAmount, payer, tokenAccount) {
    const LENDING_PROGRAM_ID = new web3_js_1.PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
    const LENDING_MARKET_AUTHORITY = new web3_js_1.PublicKey("9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo");
    const LENDING_MARKET = new web3_js_1.PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF");
    const RESERVE_ADDRESS = new web3_js_1.PublicKey("D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59");
    const RESERVE_LIQUIDITY_MINT = new web3_js_1.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const SRC_LIQUIDITY_ADDRESS = new web3_js_1.PublicKey("Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6");
    const FEE_RECEIVER_ADDRESS = new web3_js_1.PublicKey("BbDUrk1bVtSixgQsPLBJFZEF7mwGstnD5joA1WzYvYFX");
    const REFERRER = new web3_js_1.PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
    const sysvarInfo = new web3_js_1.PublicKey("Sysvar1nstructions1111111111111111111111111");
    const tokenProgram = new web3_js_1.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const borrowInstruction = (0, klend_sdk_1.flashBorrowReserveLiquidity)({
        liquidityAmount: borrowAmount,
    }, {
        userTransferAuthority: payer.publicKey,
        lendingMarketAuthority: LENDING_MARKET_AUTHORITY,
        lendingMarket: LENDING_MARKET,
        reserve: RESERVE_ADDRESS,
        reserveLiquidityMint: RESERVE_LIQUIDITY_MINT,
        reserveSourceLiquidity: SRC_LIQUIDITY_ADDRESS,
        userDestinationLiquidity: tokenAccount,
        reserveLiquidityFeeReceiver: FEE_RECEIVER_ADDRESS,
        referrerTokenState: REFERRER,
        referrerAccount: REFERRER,
        sysvarInfo,
        tokenProgram,
    }, LENDING_PROGRAM_ID);
    const repayInstruction = (0, klend_sdk_1.flashRepayReserveLiquidity)({
        liquidityAmount: borrowAmount,
        borrowInstructionIndex: 0,
    }, {
        userTransferAuthority: payer.publicKey,
        lendingMarketAuthority: LENDING_MARKET_AUTHORITY,
        lendingMarket: LENDING_MARKET,
        reserve: RESERVE_ADDRESS,
        reserveLiquidityMint: RESERVE_LIQUIDITY_MINT,
        reserveDestinationLiquidity: SRC_LIQUIDITY_ADDRESS,
        userSourceLiquidity: tokenAccount,
        reserveLiquidityFeeReceiver: FEE_RECEIVER_ADDRESS,
        referrerTokenState: REFERRER,
        referrerAccount: REFERRER,
        sysvarInfo,
        tokenProgram,
    }, LENDING_PROGRAM_ID);
    return [borrowInstruction, repayInstruction];
}
exports.flashLoan = flashLoan;
//# sourceMappingURL=usdcflashloan.js.map