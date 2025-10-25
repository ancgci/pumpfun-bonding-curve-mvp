export function transactionOutput(txn: any) {
    const type = txn.instructions[0].name === "sell" ? "SELL" : "BUY";
    
    // Tentar obter dados dos eventos primeiro
    let events = txn.events[0]?.data;
    
    // Extrair dados das instruções se os eventos não estiverem disponíveis
    let bondingCurve, mint, solAmount, tokenAmount, user, name, symbol, uri;
    
    if (txn.instructions[0].accounts && txn.instructions[0].accounts.length > 3) {
        bondingCurve = txn.instructions[0].accounts[3]?.pubkey;
    }
    
    if (events) {
        // Se houver eventos, usar os dados deles
        mint = events?.mint;
        solAmount = events?.solAmount ? events.solAmount / 1000000000 : 0;
        tokenAmount = events?.tokenAmount;
        user = events?.user;
        
        // Extrair metadados se disponíveis
        name = events?.name;
        symbol = events?.symbol;
        uri = events?.uri;
    } else if (txn.instructions[0]?.data) {
        // Se não houver eventos, tentar extrair dados das instruções
        const data = txn.instructions[0].data;
        // Os valores podem estar nos dados da instrução, mas precisamos decodificá-los
        // De acordo com o IDL, para buy:
        // args: [{name: "amount", type: "u64"}, {name: "maxSolCost", type: "u64"}]
        // Para sell:
        // args: [{name: "amount", type: "u64"}, {name: "minSolOutput", type: "u64"}]
        
        if (data.amount) {
            tokenAmount = Number(data.amount);
        }
        if (data.maxSolCost || data.minSolOutput) {
            solAmount = (data.maxSolCost || data.minSolOutput) / 1000000000;
        }
        
        // Extrair metadados da instrução create, se for o caso
        if (txn.instructions[0].name === "create") {
            name = data?.name;
            symbol = data?.symbol;
            uri = data?.uri;
        }
    }
    
    // Extrair informações adicionais da transação
    let timestamp, slot, signature;
    if (txn.transaction) {
        signature = txn.transaction.signatures?.[0];
        slot = txn.slot;
        // Tentar obter timestamp do bloco se disponível
        timestamp = txn.blockTime;
    }
    
    return {
        type,
        mint,
        solAmount: solAmount || 0,
        tokenAmount,
        user,
        bondingCurve,
        name,
        symbol,
        uri,
        timestamp,
        slot,
        signature
    };
}