import fs from "fs";
import os from "os";
import path from "path";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

const mockGetUserByEmail = jest.fn();
const mockListUserWallets = jest.fn();

jest.mock("../../utils/userAccess", () => ({
  getUserByEmail: (...args: any[]) => mockGetUserByEmail(...args),
  listUserWallets: (...args: any[]) => mockListUserWallets(...args),
}));

const LEGACY_WALLET_PATH = path.resolve(__dirname, "../../bot-wallet.json");
const realExistsSync = fs.existsSync.bind(fs);
const realReadFileSync = fs.readFileSync.bind(fs);

describe("walletStore", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.ALLOWED_EMAIL;
    delete process.env.SECRET_KEY_JSON;

    jest.spyOn(fs, "existsSync").mockImplementation((targetPath: fs.PathLike) => {
      if (String(targetPath) === LEGACY_WALLET_PATH) {
        return false;
      }
      return realExistsSync(targetPath);
    });

    jest.spyOn(fs, "readFileSync").mockImplementation((targetPath: fs.PathOrFileDescriptor, options?: any) => {
      if (String(targetPath) === LEGACY_WALLET_PATH) {
        throw new Error("legacy wallet disabled in this test");
      }
      return realReadFileSync(targetPath as any, options as any);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the env secret when the default wallet secret_ref points to a different wallet", () => {
    const staleKeypair = Keypair.generate();
    const envKeypair = Keypair.generate();
    const tempSecretRef = path.join(os.tmpdir(), `wallet-store-${Date.now()}-${Math.random()}.json`);

    try {
      fs.writeFileSync(tempSecretRef, JSON.stringify(Array.from(staleKeypair.secretKey)));

      process.env.ALLOWED_EMAIL = "admin@example.com";
      process.env.SECRET_KEY_JSON = JSON.stringify(Array.from(envKeypair.secretKey));

      mockGetUserByEmail.mockReturnValue({ id: 1 });
      mockListUserWallets.mockReturnValue([
        {
          id: 10,
          userId: 1,
          label: "Primary Bot Wallet",
          publicKey: envKeypair.publicKey.toBase58(),
          secretRef: tempSecretRef,
          status: "ACTIVE",
          isDefault: true,
          createdAt: "",
          updatedAt: "",
        },
      ]);

      const walletStore = require("../../utils/walletStore");
      const activeWallet = walletStore.getActiveTradingWallet();

      expect(activeWallet?.publicKey).toBe(envKeypair.publicKey.toBase58());
      expect(activeWallet?.keypair?.publicKey.toBase58()).toBe(envKeypair.publicKey.toBase58());
      expect(activeWallet?.secretRef).toBe("env:SECRET_KEY_JSON");
      expect(activeWallet?.source).toBe("env_secret");
      expect(walletStore.exportWalletSecretBase58(tempSecretRef, envKeypair.publicKey.toBase58())).toBeNull();
      expect(walletStore.exportWalletSecretBase58(tempSecretRef, staleKeypair.publicKey.toBase58())).toBe(
        bs58.encode(staleKeypair.secretKey),
      );
    } finally {
      if (realExistsSync(tempSecretRef)) {
        fs.unlinkSync(tempSecretRef);
      }
    }
  });

  it("prefers SECRET_KEY_JSON over the legacy bot-wallet.json fallback when both are configured", () => {
    const legacyKeypair = Keypair.generate();
    const envKeypair = Keypair.generate();

    (fs.existsSync as jest.Mock).mockImplementation((targetPath: fs.PathLike) => {
      if (String(targetPath) === LEGACY_WALLET_PATH) {
        return true;
      }
      return realExistsSync(targetPath);
    });

    (fs.readFileSync as jest.Mock).mockImplementation((targetPath: fs.PathOrFileDescriptor, options?: any) => {
      if (String(targetPath) === LEGACY_WALLET_PATH) {
        return JSON.stringify(Array.from(legacyKeypair.secretKey));
      }
      return realReadFileSync(targetPath as any, options as any);
    });

    process.env.SECRET_KEY_JSON = JSON.stringify(Array.from(envKeypair.secretKey));

    const { loadConfiguredFallbackWallet } = require("../../utils/walletStore");
    const fallback = loadConfiguredFallbackWallet();

    expect(fallback?.publicKey).toBe(envKeypair.publicKey.toBase58());
    expect(fallback?.source).toBe("env_secret");
  });
});
