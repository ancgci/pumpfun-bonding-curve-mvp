import bs58 from "bs58";
import { decodeBitqueryPumpFunTransactionMessage } from "../../utils/bitqueryTransactionsAdapter";

function b58Buffer(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

describe("bitqueryTransactionsAdapter", () => {
  it("decodes pumpfun buy transactions from parsed idl stream", () => {
    const program = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    const mint = "So11111111111111111111111111111111111111112";
    const bondingCurve = "4Nd1mLxkQ8foh2jT2x9VY9ycYzaPt6VxDRKCVhcdtrzX";
    const trader = "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu";
    const signature = "5j7sGQ2rD1jz7gGfK1rGx9o9Kj6Xc7uFq8jW4i6Q6Tvd7gnP4z1SUgYG3PaY5E9sDcV1YQUAECEV4VpWwfvX2gYV";

    const decoded = decodeBitqueryPumpFunTransactionMessage(
      {
        Block: { Slot: "777" },
        Transaction: {
          Signature: b58Buffer(signature),
          Status: { Success: true },
          Header: { Signer: b58Buffer(trader) },
          ParsedIdlInstructions: [
            {
              Program: {
                Address: b58Buffer(program),
                Method: "buy",
                AccountNames: ["global", "mint", "bondingCurve", "user"],
                Arguments: [
                  { Name: "amount", UInt: "1500000" },
                  { Name: "maxSolCost", UInt: "25000000" },
                ],
              },
              Accounts: [
                { Address: Buffer.alloc(0) },
                { Address: b58Buffer(mint), Token: { Mint: b58Buffer(mint), Decimals: 6 } },
                { Address: b58Buffer(bondingCurve) },
                { Address: b58Buffer(trader) },
              ],
            },
          ],
        },
      },
      program
    );

    expect(decoded).toEqual({
      protocolProgram: program,
      signature,
      slot: 777,
      mint,
      trader,
      bondingCurveAddress: bondingCurve,
      type: "BUY",
      tokenAmount: 1.5,
      solAmount: 0.025,
      method: "buy",
    });
  });
});
