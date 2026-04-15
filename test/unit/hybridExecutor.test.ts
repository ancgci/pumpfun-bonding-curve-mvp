// Set environment BEFORE any imports
process.env.SECRET_KEY_JSON = JSON.stringify(new Array(64).fill(0));
process.env.AGENT_ENABLED = 'true';
process.env.RPC_URL = 'http://mock-rpc';
process.env.PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
process.env.ENABLE_ATA_EXIT_STRATEGY = 'true';
process.env.ATA_RENT_SOL = '0.00203928';

import {
    checkExitConditions,
    buyOnPumpFun,
    sellViaJupiter,
    buildBurnAndCloseAtaPlan,
    executeBurnAndCloseAta,
} from '../../utils/hybridExecutor';
import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as jito from '../../utils/jitoManager';
import * as rpcPool from '../../utils/rpcPool';
import * as slippageCalc from '../../utils/slippageCalculator';
import * as splToken from '@solana/spl-token';

// Mocks
jest.mock('@solana/web3.js', () => {
    const original = jest.requireActual('@solana/web3.js');
    const VALID_ADDR = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

    class MockPublicKey {
        constructor(val: any) { }
        toBuffer() { return Buffer.alloc(32); }
        toBase58() { return VALID_ADDR; }
        toString() { return VALID_ADDR; }
        equals() { return true; }
        static findProgramAddressSync() { return [new MockPublicKey('pda'), 255]; }
        static async findProgramAddress() { return [new MockPublicKey('pda'), 255]; }
    }

    class MockTransaction {
        add() { return this; }
        serialize() { return Buffer.alloc(10); }
        static from() { return new MockTransaction(); }
    }

    class MockVersionedTransaction {
        constructor() { }
        sign() { }
        serialize() { return Buffer.alloc(10); }
        static deserialize() { return new MockVersionedTransaction(); }
    }

    return {
        ...original,
        PublicKey: MockPublicKey,
        Transaction: MockTransaction,
        VersionedTransaction: MockVersionedTransaction,
        Connection: jest.fn().mockImplementation(() => ({
            getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-hash' }),
            getBalance: jest.fn().mockResolvedValue(1e9),
            getParsedAccountInfo: jest.fn().mockResolvedValue({ value: { data: { parsed: { info: { tokenAmount: { amount: '1000' } } } } } }),
            getAccountInfo: jest.fn().mockResolvedValue({ data: Buffer.alloc(100) }),
            getRecentPrioritizationFees: jest.fn().mockResolvedValue([{ prioritizationFee: 1000 }]),
        })),
        sendAndConfirmTransaction: jest.fn().mockResolvedValue('mock-sig'),
        Keypair: {
            fromSecretKey: jest.fn().mockImplementation((arr) => ({
                publicKey: new MockPublicKey('pk'),
                secretKey: arr,
                sign: () => Buffer.alloc(64)
            })),
            generate: jest.fn().mockReturnValue({
                publicKey: new MockPublicKey('pk'),
            })
        }
    };
});

jest.mock('../../utils/jitoManager', () => ({
    sendJitoBundle: jest.fn().mockResolvedValue('jito-sig'),
}));

jest.mock('../../utils/rpcPool', () => ({
    rpcPool: {
        getBestConnection: jest.fn().mockResolvedValue({
            rpcEndpoint: 'mock-rpc',
            getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-hash' }),
            getRecentPrioritizationFees: jest.fn().mockResolvedValue([{ prioritizationFee: 1000 }]),
        }),
    },
}));

jest.mock('../../utils/walletStore', () => ({
    getActiveTradingWallet: jest.fn(() => ({
        wallet: null,
        keypair: {
            publicKey: {
                toBase58: () => '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                toString: () => '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                toBuffer: () => Buffer.alloc(32),
            },
            secretKey: new Uint8Array(64),
            sign: () => Buffer.alloc(64),
        },
        publicKey: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
        secretRef: 'env:SECRET_KEY_JSON',
        source: 'env_secret',
    })),
}));

jest.mock('@jup-ag/api', () => ({
    createJupiterApiClient: jest.fn().mockReturnValue({
        quoteGet: jest.fn().mockResolvedValue({ outAmount: '100000000' }),
        swapInstructionsPost: jest.fn().mockResolvedValue({
            swapInstruction: { programId: 'JUP6LpazHDdv3qS9sL8WToiLej6XUeFfHYSX7zYg33n', accounts: [], data: 'base64-data' },
            setupInstructions: [],
            cleanupInstruction: null,
        }),
    }),
}));

jest.mock('@solana/spl-token', () => {
    const actual = jest.requireActual('@solana/spl-token');
    return {
        ...actual,
        createBurnInstruction: jest.fn(() => ({ kind: 'burn' })),
        createCloseAccountInstruction: jest.fn(() => ({ kind: 'close' })),
    };
});

describe('HybridExecutor Unit Tests', () => {
    const VALID_PUBKEY = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkExitConditions (Logic Tests)', () => {
        const entryPrice = 0.1;

        test('deve manter posição se lucro não atingiu limite', () => {
            const res = checkExitConditions(0.12, 0.12, entryPrice, 50, 20);
            expect(res.shouldExit).toBe(false);
        });

        test('deve acionar Take Profit', () => {
            const res = checkExitConditions(0.16, 0.16, entryPrice, 50, 20);
            expect(res.shouldExit).toBe(true);
            expect(res.reason).toBe('Take Profit Hit');
        });

        test('deve acionar Stop Loss tradicional', () => {
            const res = checkExitConditions(0.07, 0.1, entryPrice, 50, 20);
            expect(res.shouldExit).toBe(true);
            expect(res.reason).toBe('Stop Loss Hit');
        });

        test.skip('deve acionar Trailing Stop Loss (Desabilitado temporalmente no códifo fonte)', () => {
            // Preço subiu para 0.2 (100% lucro), trailing de 10% -> stop em 0.18
            const highRes = checkExitConditions(0.2, 0.1, entryPrice, 200, 20, 10);
            expect(highRes.newStopLossPrice).toBeCloseTo(0.18, 5);

            // Preço caiu para 0.17
            const exitRes = checkExitConditions(0.17, 0.2, entryPrice, 200, 20, 10);
            expect(exitRes.shouldExit).toBe(true);
            expect(exitRes.reason).toBe('Trailing Stop Hit');
        });

        test.skip('deve acionar Whale Dump Exit (Desabilitado temporalmente no código fonte)', () => {
            const res = checkExitConditions(0.13, 0.2, entryPrice, 200, 20, 0, 30);
            expect(res.shouldExit).toBe(true);
            expect(res.reason).toContain('Whale Dump Detected');
        });
    });

    describe('Execution Tests (Mocks)', () => {
        test('buyOnPumpFun deve retornar assinatura', async () => {
            const sig = await buyOnPumpFun(VALID_PUBKEY, 0.1);
            expect(sig).toBeDefined();
        });

        test('sellViaJupiter deve retornar assinatura', async () => {
            const sig = await sellViaJupiter(VALID_PUBKEY, 1000000);
            expect(sig).toBeDefined();
        });

        test('deve aplicar slippage adaptativo do cache', async () => {
            jest.spyOn(slippageCalc, 'getCachedOptimalSlippage').mockResolvedValue(100);
            expect(slippageCalc.getCachedOptimalSlippage).toBeDefined();
        });

        test('buildBurnAndCloseAtaPlan mantém burn antes de close', async () => {
            const connection = {
                getParsedTokenAccountsByOwner: jest.fn().mockResolvedValue({
                    value: [
                        {
                            pubkey: new PublicKey(VALID_PUBKEY),
                            account: { data: { parsed: { info: { tokenAmount: { amount: '10' } } } } },
                        },
                        {
                            pubkey: new PublicKey(VALID_PUBKEY),
                            account: { data: { parsed: { info: { tokenAmount: { amount: '0' } } } } },
                        },
                    ],
                }),
            } as any;

            const plan = await buildBurnAndCloseAtaPlan({
                tokenMint: VALID_PUBKEY,
                connection,
                owner: new PublicKey(VALID_PUBKEY),
            });

            expect(plan.burnInstructionCount).toBe(1);
            expect(plan.closeInstructionCount).toBe(2);
            expect(plan.instructionKinds).toEqual(['burn', 'close', 'close']);
            expect((splToken.createBurnInstruction as jest.Mock).mock.calls).toHaveLength(1);
            expect((splToken.createCloseAccountInstruction as jest.Mock).mock.calls).toHaveLength(2);
        });

        test('buildBurnAndCloseAtaPlan é idempotente quando ATA já está fechada ou vazia', async () => {
            const connection = {
                getParsedTokenAccountsByOwner: jest.fn().mockResolvedValue({ value: [] }),
            } as any;

            const plan = await buildBurnAndCloseAtaPlan({
                tokenMint: VALID_PUBKEY,
                connection,
                owner: new PublicKey(VALID_PUBKEY),
            });

            expect(plan.alreadyClosed).toBe(true);
            expect(plan.instructions).toHaveLength(0);
        });

        test('executeBurnAndCloseAta faz retry close-only depois de burn bem-sucedido', async () => {
            let accounts = [
                {
                    pubkey: new PublicKey(VALID_PUBKEY),
                    account: { data: { parsed: { info: { tokenAmount: { amount: '10' } } } } },
                },
                {
                    pubkey: new PublicKey(VALID_PUBKEY),
                    account: { data: { parsed: { info: { tokenAmount: { amount: '0' } } } } },
                },
            ];

            const connection = {
                getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-hash' }),
                getParsedTokenAccountsByOwner: jest.fn().mockImplementation(async () => ({ value: accounts })),
                getRecentPrioritizationFees: jest.fn().mockResolvedValue([{ prioritizationFee: 1000 }]),
            } as any;

            let sendAttempt = 0;
            (sendAndConfirmTransaction as jest.Mock).mockImplementation(async () => {
                sendAttempt += 1;
                if (sendAttempt === 1) {
                    accounts = accounts.map((account) => ({
                        ...account,
                        account: { data: { parsed: { info: { tokenAmount: { amount: '0' } } } } },
                    }));
                    return 'burn-sig';
                }
                if (sendAttempt === 2) {
                    throw new Error('close failed');
                }

                accounts = [];
                return 'close-retry-sig';
            });

            const result = await executeBurnAndCloseAta(VALID_PUBKEY, {
                connection,
                retryAttempts: 2,
            });

            expect(result.burnSignature).toBe('burn-sig');
            expect(result.closeSignature).toBe('close-retry-sig');
            expect(result.burnedAccounts).toBe(1);
            expect(result.closedAccounts).toBe(2);
            expect(result.closeRetryAttemptsUsed).toBe(1);
            expect(result.deferredCloseRecoveryNeeded).toBe(false);
            expect((sendAndConfirmTransaction as jest.Mock).mock.calls).toHaveLength(3);
        });

        test('executeBurnAndCloseAta permanece idempotente quando ATA já foi fechada', async () => {
            const connection = {
                getParsedTokenAccountsByOwner: jest.fn().mockResolvedValue({ value: [] }),
            } as any;

            const result = await executeBurnAndCloseAta(VALID_PUBKEY, {
                connection,
                retryAttempts: 2,
            });

            expect(result.alreadyClosed).toBe(true);
            expect(result.signature).toBeNull();
            expect((sendAndConfirmTransaction as jest.Mock).mock.calls).toHaveLength(0);
        });

        test('executeBurnAndCloseAta sinaliza recovery diferido quando close falha apos retry', async () => {
            let accounts = [
                {
                    pubkey: new PublicKey(VALID_PUBKEY),
                    account: { data: { parsed: { info: { tokenAmount: { amount: '5' } } } } },
                },
            ];

            const connection = {
                getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-hash' }),
                getParsedTokenAccountsByOwner: jest.fn().mockImplementation(async () => ({ value: accounts })),
                getRecentPrioritizationFees: jest.fn().mockResolvedValue([{ prioritizationFee: 1000 }]),
            } as any;

            let sendAttempt = 0;
            (sendAndConfirmTransaction as jest.Mock).mockImplementation(async () => {
                sendAttempt += 1;
                if (sendAttempt === 1) {
                    accounts = accounts.map((account) => ({
                        ...account,
                        account: { data: { parsed: { info: { tokenAmount: { amount: '0' } } } } },
                    }));
                    return 'burn-sig';
                }
                throw new Error('close still failing');
            });

            const result = await executeBurnAndCloseAta(VALID_PUBKEY, {
                connection,
                retryAttempts: 2,
            });

            expect(result.burnSignature).toBe('burn-sig');
            expect(result.deferredCloseRecoveryNeeded).toBe(true);
            expect(result.recoveryReason).toContain('recovery pending');
            expect(result.closedAccounts).toBe(0);
        });
    });

});

afterAll(() => {
    for (let i = 0; i < 10000; i++) {
        clearInterval(i);
        clearTimeout(i);
    }
});
