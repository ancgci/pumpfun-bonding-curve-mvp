import bs58 from "bs58";
import { decodeBitqueryBalanceUpdateMessage } from "../../utils/bitqueryBalancesAdapter";

function b58Buffer(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

describe("bitqueryBalancesAdapter", () => {
  it("decodes native SOL balance updates for tracked wallets", () => {
    const address = "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu";

    const decoded = decodeBitqueryBalanceUpdateMessage({
      Block: { Slot: "1234" },
      Transaction: {
        Status: { Success: true },
        Header: {
          Accounts: [
            { Address: b58Buffer(address) },
          ],
        },
      },
      BalanceUpdate: {
        BalanceUpdate: {
          AccountIndex: 0,
          PostBalance: "2500000000",
        },
        Currency: {
          Symbol: "SOL",
          Native: true,
          Decimals: 9,
        },
      },
    });

    expect(decoded).toEqual({
      address,
      tokenMint: null,
      uiAmount: 2.5,
      isNativeSol: true,
      slot: 1234,
    });
  });
});
