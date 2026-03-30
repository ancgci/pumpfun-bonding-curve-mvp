import bs58 from "bs58";
import { decodeBitqueryDexTradeMessage } from "../../utils/bitqueryGrpcAdapter";

function b58(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

describe("bitqueryGrpcAdapter", () => {
  it("decodes pumpfun buy trades from CoreCast dex trade messages", () => {
    const mint = "So11111111111111111111111111111111111111112";
    const market = "4Nd1mLxkQ8foh2jT2x9VY9ycYzaPt6VxDRKCVhcdtrzX";
    const trader = "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu";
    const signature = "5j7sGQ2rD1jz7gGfK1rGx9o9Kj6Xc7uFq8jW4i6Q6Tvd7gnP4z1SUgYG3PaY5E9sDcV1YQUAECEV4VpWwfvX2gYV";
    const blockTimestamp = 1_712_345_678;

    const decoded = decodeBitqueryDexTradeMessage({
      Block: { Slot: "123456", Timestamp: String(blockTimestamp) },
      Transaction: { Signature: b58(signature) },
      Trade: {
        Dex: {
          ProgramAddress: b58("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
          ProtocolName: "pumpfun",
          ProtocolFamily: "pumpfun",
        },
        Market: {
          MarketAddress: b58(market),
        },
        Buy: {
          Amount: "1250000",
          Currency: {
            MintAddress: b58(mint),
            Decimals: 6,
            Symbol: "TEST",
            Native: false,
            Wrapped: false,
          },
          Order: {
            Owner: b58(trader),
          },
        },
        Sell: {
          Amount: "25000000",
          Currency: {
            MintAddress: Buffer.alloc(0),
            Decimals: 9,
            Symbol: "SOL",
            Native: true,
            Wrapped: false,
          },
          Order: {
            Owner: b58(trader),
          },
        },
      },
    });

    expect(decoded).toEqual({
      protocolProgram: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      protocolName: "pumpfun",
      protocolFamily: "pumpfun",
      marketAddress: market,
      signature,
      slot: 123456,
      timestamp: blockTimestamp * 1000,
      mint,
      trader,
      type: "BUY",
      tokenAmount: 1.25,
      solAmount: 0.025,
    });
  });

  it("ignores dex trades that are not token versus sol pairs", () => {
    const decoded = decodeBitqueryDexTradeMessage({
      Block: { Slot: "10" },
      Transaction: { Signature: Buffer.alloc(0) },
      Trade: {
        Dex: {
          ProgramAddress: Buffer.alloc(0),
          ProtocolName: "unknown",
          ProtocolFamily: "unknown",
        },
        Market: { MarketAddress: Buffer.alloc(0) },
        Buy: {
          Amount: "100",
          Currency: { MintAddress: Buffer.alloc(0), Decimals: 6, Symbol: "AAA", Native: false, Wrapped: false },
        },
        Sell: {
          Amount: "100",
          Currency: { MintAddress: Buffer.alloc(0), Decimals: 6, Symbol: "BBB", Native: false, Wrapped: false },
        },
      },
    });

    expect(decoded).toBeNull();
  });

  it("ignores failed transactions", () => {
    const decoded = decodeBitqueryDexTradeMessage({
      Block: { Slot: "10" },
      Transaction: {
        Signature: Buffer.alloc(0),
        Status: {
          Success: false,
          ErrorMessage: "instruction failed",
        },
      },
      Trade: {
        Dex: {
          ProgramAddress: Buffer.alloc(0),
          ProtocolName: "pumpfun",
          ProtocolFamily: "pumpfun",
        },
        Market: { MarketAddress: Buffer.alloc(0) },
        Buy: {
          Amount: "1000000",
          Currency: { MintAddress: Buffer.alloc(0), Decimals: 6, Symbol: "AAA", Native: false, Wrapped: false },
        },
        Sell: {
          Amount: "1000000000",
          Currency: { MintAddress: Buffer.alloc(0), Decimals: 9, Symbol: "SOL", Native: true, Wrapped: false },
        },
      },
    });

    expect(decoded).toBeNull();
  });
});
