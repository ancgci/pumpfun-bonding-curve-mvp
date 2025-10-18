var myHeaders = new Headers();
import dotenv from "dotenv";

dotenv.config();

const api = process.env.SHYFT_RPC as string;
myHeaders.append("x-api-key", api);

var requestOptions: any = {
  method: "GET",
  headers: myHeaders,
  redirect: "follow",
};
export async function getTokenBalance(address) {
  const info = await fetch(
    `https://api.shyft.to/sol/v1/wallet/all_tokens?network=mainnet-beta&wallet=${address}`,
    requestOptions
  );
  const infoJson = await info.json();
  const result = infoJson?.result[0];
  const ca = result?.address;
  const name = result?.info?.name;
  const symbol = result?.info.symbol;
  const balance = result?.balance;
  return {
    name,
    symbol,
    ca,
    balance,
  };
}

// Função para obter número de holders
export async function getTokenHolders(tokenAddress: string) {
  try {
    const response = await fetch(
      `https://api.shyft.to/sol/v1/token/holders?network=mainnet-beta&token=${tokenAddress}`,
      requestOptions
    );
    const data = await response.json();
    return data?.result?.length || 0;
  } catch (error) {
    console.error("Error fetching token holders:", error);
    return 0;
  }
}

// Função para obter volume de transações
export async function getTokenVolume(tokenAddress: string) {
  try {
    // Esta é uma implementação simplificada
    // Na prática, você precisaria buscar transações reais e calcular o volume
    const response = await fetch(
      `https://api.shyft.to/sol/v1/token/transfers?network=mainnet-beta&token=${tokenAddress}&limit=100`,
      requestOptions
    );
    const data = await response.json();
    // Calcular volume total em SOL
    let totalVolume = 0;
    if (data?.result) {
      data.result.forEach(transfer => {
        totalVolume += transfer.amount;
      });
    }
    return totalVolume;
  } catch (error) {
    console.error("Error fetching token volume:", error);
    return 0;
  }
}

// Função para obter tempo desde a criação
export async function getTokenAge(tokenAddress: string) {
  try {
    const response = await fetch(
      `https://api.shyft.to/sol/v1/token/info?network=mainnet-beta&token=${tokenAddress}`,
      requestOptions
    );
    const data = await response.json();
    const createdAt = data?.result?.created_at;
    if (createdAt) {
      const createdTime = new Date(createdAt);
      const now = new Date();
      const diffHours = Math.floor((now.getTime() - createdTime.getTime()) / (1000 * 60 * 60));
      return `${diffHours}h`;
    }
    return "Unknown";
  } catch (error) {
    console.error("Error fetching token age:", error);
    return "Unknown";
  }
}
