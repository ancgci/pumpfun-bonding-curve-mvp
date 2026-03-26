import bs58 from "bs58";
import { decodeBitqueryDexOrderMessage } from "../../utils/bitqueryDexOrdersAdapter";

function b58Buffer(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

describe("bitqueryDexOrdersAdapter", () => {
  it("decodes pumpfun buy-side order pressure on token versus sol markets", () => {
    const mint = "So11111111111111111111111111111111111111112";
    const market = "4Nd1mLxkQ8foh2jT2x9VY9ycYzaPt6VxDRKCVhcdtrzX";
    const owner = "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu";
    const signature = "5j7sGQ2rD1jz7gGfK1rGx9o9Kj6Xc7uFq8jW4i6Q6Tvd7gnP4z1SUgYG3PaY5E9sDcV1YQUAECEV4VpWwfvX2gYV";

    const decoded = decodeBitqueryDexOrderMessage({
      Block: { Slot: "777" },
      Transaction: {
        Signature: b58Buffer(signature),
        Status: { Success: true },
      },
      Order: {
        Type: "OPEN",
        Dex: {
          ProgramAddress: b58Buffer("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
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
        Order: {
          Owner: b58Buffer(owner),
          BuySide: true,
          LimitAmount: "1500000",
        },
      },
    });

    expect(decoded).toEqual({
      signature,
      slot: 777,
      mint,
      marketAddress: market,
      type: "OPEN",
      side: "BUY",
      amount: 1.5,
      owner,
    });
  });
});
