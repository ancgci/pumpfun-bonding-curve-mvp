import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

const shyft = process.env.SHYFT_RPC as string;
console.log("RPC URL:", shyft);

const connection = new Connection(shyft, 'confirmed');

async function testConnection() {
  try {
    const slot = await connection.getSlot();
    console.log("Conexão bem-sucedida! Slot atual:", slot);
    
    // Testar uma conta conhecida
    const publicKey = new PublicKey("11111111111111111111111111111111");
    const accountInfo = await connection.getAccountInfo(publicKey);
    console.log("Conta 1111 info:", accountInfo !== null);
  } catch (error) {
    console.error("Erro na conexão:", error);
  }
}

testConnection();