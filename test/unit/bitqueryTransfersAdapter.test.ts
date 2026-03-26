import bs58 from "bs58";
import { decodeBitqueryTransferMessage } from "../../utils/bitqueryTransfersAdapter";

function b58Buffer(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

describe("bitqueryTransfersAdapter", () => {
  it("decodes token transfer messages", () => {
    const mint = "So11111111111111111111111111111111111111112";
    const sender = "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu";
    const receiver = "4Nd1mLxkQ8foh2jT2x9VY9ycYzaPt6VxDRKCVhcdtrzX";
    const signature = "5j7sGQ2rD1jz7gGfK1rGx9o9Kj6Xc7uFq8jW4i6Q6Tvd7gnP4z1SUgYG3PaY5E9sDcV1YQUAECEV4VpWwfvX2gYV";

    const decoded = decodeBitqueryTransferMessage({
      Block: { Slot: "999" },
      Transaction: {
        Signature: b58Buffer(signature),
        Status: { Success: true },
      },
      Transfer: {
        Amount: "2500000",
        Currency: {
          MintAddress: b58Buffer(mint),
          Decimals: 6,
        },
        Sender: {
          Address: b58Buffer(sender),
        },
        Receiver: {
          Address: b58Buffer(receiver),
        },
      },
    });

    expect(decoded).toEqual({
      signature,
      slot: 999,
      mint,
      sender,
      receiver,
      amount: 2.5,
    });
  });

  it("ignores failed transfer transactions", () => {
    const decoded = decodeBitqueryTransferMessage({
      Transaction: {
        Status: { Success: false },
      },
      Transfer: {},
    });

    expect(decoded).toBeNull();
  });
});
