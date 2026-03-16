import { useState } from 'react';
import { RefreshCcw, Coins, Search, ExternalLink, Loader2 } from 'lucide-react';

export const CurrencyExchangeWidget = () => {
    const [fromToken, setFromToken] = useState('SOL');
    const [toToken, setToToken] = useState('PUMP');
    const [amount, setAmount] = useState('1.0');
    const [searchAddress, setSearchAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [prices, setPrices] = useState({
        SOL: 145.20,
        PUMP: 0.000042,
        custom: 0
    });
    const [customTokenSymbol, setCustomTokenSymbol] = useState('');

    const fetchTokenPrice = async (address: string) => {
        if (!address || address.length < 32) return;
        setLoading(true);
        try {
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
            const data = await response.json();
            if (data.pairs && data.pairs.length > 0) {
                const pair = data.pairs[0];
                const price = parseFloat(pair.priceUsd);
                setPrices(prev => ({ ...prev, custom: price }));
                setCustomTokenSymbol(pair.baseToken.symbol);
                setToToken(pair.baseToken.symbol);
            }
        } catch (error) {
            console.error('Error fetching token price:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateExchange = () => {
        const val = parseFloat(amount) || 0;
        const fromPrice = fromToken === 'SOL' ? prices.SOL : (fromToken === 'PUMP' ? prices.PUMP : prices.custom);
        const toPrice = toToken === 'SOL' ? prices.SOL : (toToken === 'PUMP' ? prices.PUMP : prices.custom);

        if (toPrice === 0) return '0.00';
        return (val * fromPrice / toPrice).toLocaleString(undefined, { maximumFractionDigits: 6 });
    };

    return (
        <div className="space-y-6">
            {/* Search Section */}
            <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </div>
                <input
                    type="text"
                    placeholder="Search by Contract Address..."
                    value={searchAddress}
                    onChange={(e) => setSearchAddress(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchTokenPrice(searchAddress)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-all"
                />
                {customTokenSymbol && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20 uppercase">
                            {customTokenSymbol} Found
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-4">
                {/* From Token */}
                <div
                    onClick={() => setFromToken(fromToken === 'SOL' ? (customTokenSymbol || 'PUMP') : 'SOL')}
                    className="flex-1 p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-3">
                        <Coins className={`w-6 h-6 ${fromToken === 'SOL' ? 'text-yellow-500' : 'text-primary'}`} />
                        <span className="font-semibold text-foreground">{fromToken}</span>
                    </div>
                </div>

                {/* Swap Icon */}
                <div
                    onClick={() => {
                        const temp = fromToken;
                        setFromToken(toToken);
                        setToToken(temp);
                    }}
                    className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors cursor-pointer group"
                >
                    <RefreshCcw className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>

                {/* To Token */}
                <div
                    onClick={() => setToToken(toToken === 'SOL' ? (customTokenSymbol || 'PUMP') : 'SOL')}
                    className="flex-1 p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-3">
                        <Coins className={`w-6 h-6 ${toToken === 'SOL' ? 'text-yellow-500' : 'text-primary'}`} />
                        <span className="font-semibold text-foreground">{toToken}</span>
                    </div>
                </div>
            </div>

            <div className="relative">
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-2xl font-bold text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground bg-background/50 px-2 py-1 rounded-lg border border-white/5 flex items-center gap-2">
                    ≈ {calculateExchange()} {toToken}
                </div>
            </div>

            {searchAddress && (
                <div className="flex justify-center">
                    <a
                        href={`https://dexscreener.com/solana/${searchAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-bold"
                    >
                        View on DexScreener <ExternalLink className="w-3 h-3" />
                    </a>
                </div>
            )}

            <button
                onClick={() => fetchTokenPrice(searchAddress)}
                className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-[0_10px_30px_rgba(162,255,218,0.2)] hover:shadow-[0_10px_30px_rgba(162,255,218,0.4)] hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Fetch Latest Prices'}
            </button>
        </div>
    );
};
