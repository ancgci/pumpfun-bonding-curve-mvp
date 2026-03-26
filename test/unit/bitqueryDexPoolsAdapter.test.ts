import bs58 from "bs58";
import { decodeBitqueryDexPoolMessage } from "../../utils/bitqueryDexPoolsAdapter";

function b58Buffer(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

describe("bitqueryDexPoolsAdapter", () => {
  it("decodes pumpfun pool liquidity snapshots", () => {
    const program = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    const mint = "So11111111111111111111111111111111111111112";
    const market = "4Nd1mLxkQ8foh2jT2x9VY9ycYzaPt6VxDRKCVhcdtrzX";
    const signature = "5j7sGQ2rD1jz7gGfK1rGx9o9Kj6Xc7uFq8jW4i6Q6Tvd7gnP4z1SUgYG3PaY5E9sDcV1YQUAECEV4VpWwfvX2gYV";

    const decoded = decodeBitqueryDexPoolMessage({
      Block: { Slot: "888" },
      Transaction: {
        Signature: b58Buffer(signature),
        Status: { Success: true },
      },
      PoolEvent: {
        Dex: {
          ProgramAddress: b58Buffer(program),
          ProtocolName: "pumpfun",
        },
        Market: {
          MarketAddress: b58Buffer(market),
          BaseCurrency: {
            MintAddress: b58Buffer(mint),
            Decimals: 6,
            Symbol: "TEST",
            Native: false,
          },
          QuoteCurrency: {
            MintAddress: Buffer.alloc(0),
            Decimals: 9,
            Symbol: "SOL",
            Native: true,
          },
        },
        BaseCurrency: {
          PostAmount: "2500000000",
        },
        QuoteCurrency: {
          PostAmount: "32000000000",
        },
      },
    });

    expect(decoded).toEqual({
      protocolProgram: program,
      protocolName: "pumpfun",
      marketAddress: market,
      mint,
      signature,
      slot: 888,
      poolSolPostAmount: 32,
      poolTokenPostAmount: 2500,
    });
  });
});
