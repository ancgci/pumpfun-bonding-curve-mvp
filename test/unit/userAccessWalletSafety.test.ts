import fs from "fs";
import os from "os";
import path from "path";

process.env.NODE_ENV = "test";
process.env.SQLITE_DB_PATH = path.join(os.tmpdir(), `pumpfun-user-access-${process.pid}.db`);

const db = require("../../utils/db").default;
const {
  createUser,
  deleteUserWallet,
  ensureBootstrapAdminUser,
  ensureUserWallet,
  listUserWallets,
} = require("../../utils/userAccess");

describe("userAccess wallet safety", () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM user_trading_configs;
      DELETE FROM user_trades;
      DELETE FROM user_positions;
      DELETE FROM user_wallets;
      DELETE FROM users;
    `);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(process.env.SQLITE_DB_PATH!)) {
      fs.unlinkSync(process.env.SQLITE_DB_PATH!);
    }
  });

  it("does not let bootstrap reset the default wallet after a user already switched wallets", () => {
    const admin = ensureBootstrapAdminUser({
      email: "admin@example.com",
      name: "Admin",
      walletPublicKey: "OLD_WALLET",
      walletSecretRef: "old-secret",
    });

    ensureUserWallet({
      userId: admin.id,
      publicKey: "NEW_WALLET",
      secretRef: "new-secret",
      label: "New Primary",
      status: "ACTIVE",
      isDefault: true,
    });

    ensureBootstrapAdminUser({
      email: "admin@example.com",
      name: "Admin",
      walletPublicKey: "OLD_WALLET",
      walletSecretRef: "old-secret",
    });

    const wallets = listUserWallets(admin.id);

    expect(wallets).toHaveLength(2);
    expect(wallets.find((wallet: any) => wallet.isDefault)?.publicKey).toBe("NEW_WALLET");
  });

  it("keeps the secret file when another wallet still references the same secret_ref", () => {
    const user = createUser({
      email: "wallet-owner@example.com",
      name: "Wallet Owner",
    });

    const sharedSecretRef = path.join(os.tmpdir(), `shared-wallet-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(sharedSecretRef, JSON.stringify([1, 2, 3]));

    try {
      ensureUserWallet({
        userId: user.id,
        publicKey: "KEEP_WALLET",
        secretRef: sharedSecretRef,
        label: "Keep",
        status: "ACTIVE",
        isDefault: true,
      });

      const deletableWallet = ensureUserWallet({
        userId: user.id,
        publicKey: "DROP_WALLET",
        secretRef: sharedSecretRef,
        label: "Drop",
        status: "ACTIVE",
        isDefault: false,
      });

      deleteUserWallet(user.id, deletableWallet.id);

      expect(fs.existsSync(sharedSecretRef)).toBe(true);
      expect(listUserWallets(user.id).map((wallet: any) => wallet.publicKey)).toEqual(["KEEP_WALLET"]);
    } finally {
      if (fs.existsSync(sharedSecretRef)) {
        fs.unlinkSync(sharedSecretRef);
      }
    }
  });
});
