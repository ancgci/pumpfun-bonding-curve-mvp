import fs from "fs";
import path from "path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { getUserByEmail, listUserWallets, type UserWalletRecord } from "./userAccess";

const LEGACY_BOT_WALLET_FILE = path.join(__dirname, "../bot-wallet.json");
const WALLET_ADDRESS_ENV = process.env.WALLET_PUBLIC_ADDRESS || process.env.WALLET_ADDRESS || null;
const ADMIN_WALLET_DIR = process.env.NODE_ENV === "test"
  ? path.join("/tmp", "pumpfun-wallet-secrets")
  : path.join(__dirname, "../data/wallet-secrets");

function ensureWalletDir() {
  if (!fs.existsSync(ADMIN_WALLET_DIR)) {
    fs.mkdirSync(ADMIN_WALLET_DIR, { recursive: true });
  }
}

function loadKeypairFromArray(raw: unknown): Keypair | null {
  if (!Array.isArray(raw) || raw.length !== 64) return null;
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadEnvKeypair(): Keypair | null {
  if (!process.env.SECRET_KEY_JSON) return null;
  try {
    const parsed = JSON.parse(process.env.SECRET_KEY_JSON);
    return loadKeypairFromArray(parsed);
  } catch {
    return null;
  }
}

function keypairMatchesPublicKey(keypair: Keypair | null, expectedPublicKey?: string | null) {
  if (!keypair || !expectedPublicKey) return false;
  return keypair.publicKey.toBase58() === expectedPublicKey;
}

function loadFallbackWalletCandidates() {
  const envKeypair = loadEnvKeypair();
  const legacy = loadLegacyBotWallet();

  const candidates = [];

  if (envKeypair) {
    candidates.push({
      keypair: envKeypair,
      publicKey: envKeypair.publicKey.toBase58(),
      secretRef: "env:SECRET_KEY_JSON",
      source: "env_secret" as const,
    });
  }

  if (legacy) {
    candidates.push(legacy);
  }

  if (WALLET_ADDRESS_ENV) {
    candidates.push({
      keypair: null,
      publicKey: WALLET_ADDRESS_ENV,
      secretRef: null,
      source: "env_address" as const,
    });
  }

  return candidates;
}

export function loadLegacyBotWallet() {
  try {
    if (!fs.existsSync(LEGACY_BOT_WALLET_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LEGACY_BOT_WALLET_FILE, "utf-8"));
    const keypair = loadKeypairFromArray(raw);
    if (!keypair) return null;
    return {
      keypair,
      publicKey: keypair.publicKey.toBase58(),
      secretRef: LEGACY_BOT_WALLET_FILE,
      source: "legacy_file" as const,
    };
  } catch {
    return null;
  }
}

export function loadConfiguredFallbackWallet() {
  return loadFallbackWalletCandidates()[0] || null;
}

export function loadKeypairFromSecretRef(secretRef?: string | null): Keypair | null {
  if (!secretRef) return null;

  if (secretRef === "env:SECRET_KEY_JSON") {
    return loadEnvKeypair();
  }

  try {
    if (!fs.existsSync(secretRef)) return null;
    const raw = JSON.parse(fs.readFileSync(secretRef, "utf-8"));
    return loadKeypairFromArray(raw);
  } catch {
    return null;
  }
}

export function createManagedWalletSecret(keypair: Keypair) {
  ensureWalletDir();
  const publicKey = keypair.publicKey.toBase58();
  const secretRef = path.join(ADMIN_WALLET_DIR, `${publicKey}.json`);
  fs.writeFileSync(secretRef, JSON.stringify(Array.from(keypair.secretKey), null, 2), { mode: 0o600 });
  return {
    publicKey,
    secretRef,
    secretBase58: bs58.encode(keypair.secretKey),
  };
}

export function exportWalletSecretBase58(secretRef?: string | null, expectedPublicKey?: string | null) {
  const keypair = loadKeypairFromSecretRef(secretRef);
  if (!keypair) return null;
  if (expectedPublicKey && !keypairMatchesPublicKey(keypair, expectedPublicKey)) {
    return null;
  }
  return bs58.encode(keypair.secretKey);
}

export function getDefaultAdminWalletRecord(): UserWalletRecord | null {
  const adminEmail = (process.env.ALLOWED_EMAIL || "").trim().toLowerCase();
  if (!adminEmail) return null;
  const adminUser = getUserByEmail(adminEmail);
  if (!adminUser) return null;
  const wallets = listUserWallets(adminUser.id);
  return wallets.find((wallet) => wallet.isDefault) || wallets.find((wallet) => wallet.status === "ACTIVE") || wallets[0] || null;
}

export function getActiveTradingWallet() {
  const defaultWallet = getDefaultAdminWalletRecord();
  const fallback = loadConfiguredFallbackWallet();

  if (defaultWallet) {
    const dbKeypair = loadKeypairFromSecretRef(defaultWallet.secretRef);
    if (keypairMatchesPublicKey(dbKeypair, defaultWallet.publicKey)) {
      return {
        wallet: defaultWallet,
        keypair: dbKeypair!,
        publicKey: defaultWallet.publicKey,
        secretRef: defaultWallet.secretRef,
        source: "db_wallet" as const,
      };
    }

    if (fallback?.keypair && fallback.publicKey === defaultWallet.publicKey) {
      return {
        wallet: defaultWallet,
        keypair: fallback.keypair,
        publicKey: defaultWallet.publicKey,
        secretRef: fallback.secretRef,
        source: fallback.source,
      };
    }

    return {
      wallet: defaultWallet,
      keypair: null,
      publicKey: defaultWallet.publicKey,
      secretRef: defaultWallet.secretRef,
      source: "db_wallet_no_secret" as const,
    };
  }

  if (!fallback) return null;
  return {
    wallet: null,
    keypair: fallback.keypair,
    publicKey: fallback.publicKey,
    secretRef: fallback.secretRef,
    source: fallback.source,
  };
}

export function getActiveTradingWalletAddress() {
  return getActiveTradingWallet()?.publicKey || null;
}
