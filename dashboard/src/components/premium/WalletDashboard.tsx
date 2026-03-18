import { useState, useEffect } from 'react';
import {
    Wallet,
    ArrowDownLeft,
    ArrowUpRight,
    History,
    Settings,
    Copy,
    Check,
    ExternalLink,
    Search,
    Filter
} from 'lucide-react';
import { PremiumCard } from './PremiumCard';
import { useDashboardData } from '../../hooks/useDashboardData';
import api, { API_BASE } from '@/lib/axios';

type WalletTab = 'saldo' | 'depositar' | 'sacar' | 'historico' | 'configuracoes';

export const WalletDashboard = () => {
    const [activeTab, setActiveTab] = useState<WalletTab>('saldo');
    const { stats, tradeHistory, walletBalances } = useDashboardData();
    const [copied, setCopied] = useState(false);
    const [exportedSecret, setExportedSecret] = useState<string>('');
    const [walletAddressState, setWalletAddressState] = useState<string>((stats as any)?.walletAddress || "");
    const [loadingWallet, setLoadingWallet] = useState(false);

    const solBalance = Number(walletBalances?.solBalance ?? (stats as any)?.walletSol ?? stats?.totalPnL ?? 0);
    const walletAddress = walletAddressState || walletBalances?.address || (stats as any)?.walletAddress || "";

    const copyAddress = () => {
        if (!walletAddress) return;
        navigator.clipboard.writeText(walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        if (walletBalances?.address) {
            setWalletAddressState(walletBalances.address);
        }
    }, [walletBalances]);

    const copySecret = () => {
        if (!exportedSecret) return;
        navigator.clipboard.writeText(exportedSecret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleExportWallet = async () => {
        try {
            setLoadingWallet(true);
            const { data } = await api.get(`${API_BASE}/wallet/export`);
            setExportedSecret(data.secretBase58 || '');
            if (data.publicKey) setWalletAddressState(data.publicKey);
        } catch (err) {
            console.error('Export wallet failed', err);
            alert('Erro ao exportar carteira. Verifique o backend.');
        } finally {
            setLoadingWallet(false);
        }
    };

    const handleCreateWallet = async () => {
        if (!confirm('Gerar nova carteira irá sobrescrever a chave atual do bot. Deseja continuar?')) return;
        try {
            setLoadingWallet(true);
            const { data } = await api.post(`${API_BASE}/wallet/new`);
            setExportedSecret(data.secretBase58 || '');
            if (data.publicKey) setWalletAddressState(data.publicKey);
        } catch (err) {
            console.error('Create wallet failed', err);
            alert('Erro ao criar carteira. Verifique logs do backend.');
        } finally {
            setLoadingWallet(false);
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'saldo':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-6 bg-primary/10 border border-primary/20 rounded-3xl space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <p className="text-xs text-primary font-bold uppercase tracking-widest">Main Balance</p>
                                    <h3 className="text-3xl sm:text-4xl font-bold text-foreground">{solBalance.toFixed(4)} SOL</h3>
                                </div>
                                <div className="p-3 bg-primary/20 rounded-2xl">
                                    <Wallet className="w-6 h-6 text-primary" />
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground font-medium">≈ $ {(solBalance * 145.20).toLocaleString()} USD</p>
                        </div>

                        <div className="p-6 bg-white/5 border border-white/10 rounded-3xl space-y-4 font-mono">
                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Wallet Address</p>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-black/20 p-4 rounded-2xl border border-white/5">
                                <span className="text-sm text-foreground break-all">{walletAddress || "Configure walletAddress na API"}</span>
                                <button onClick={copyAddress} className="p-2 hover:bg-white/5 rounded-xl transition-colors" disabled={!walletAddress}>
                                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                                </button>
                            </div>
                        </div>
                        </div>

                        <PremiumCard title="Asset Portfolio">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 font-bold">S</div>
                                        <div>
                                            <p className="font-bold text-foreground">Solana</p>
                                            <p className="text-xs text-muted-foreground">SOL</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-foreground">{solBalance.toFixed(4)}</p>
                                        <p className="text-xs text-primary font-medium">--</p>
                                    </div>
                                </div>
                                {(walletBalances?.tokens || []).map((tok: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                                {tok.symbol?.[0] || 'T'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-foreground">{tok.symbol || tok.mint?.slice(0, 6)}</p>
                                                <p className="text-xs text-muted-foreground break-all">{tok.mint}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-foreground">{Number(tok.uiAmount || 0).toFixed(tok.decimals || 2)}</p>
                                            <p className="text-xs text-muted-foreground font-medium">decimals: {tok.decimals}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </PremiumCard>
                    </div>
                );
            case 'depositar':
                return (
                    <div className="max-w-md mx-auto space-y-8 py-10">
                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-bold text-foreground">Deposit Crypto</h3>
                            <p className="text-sm text-muted-foreground">Scan the QR code or copy the address below to fund your bot.</p>
                        </div>

                        <div className="aspect-square w-64 mx-auto bg-white p-4 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)]">
                            {/* QR Code Placeholder */}
                            <div className="w-full h-full bg-gray-200 rounded-2xl flex items-center justify-center text-gray-400">
                                [QR CODE]
                            </div>
                        </div>

                        <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Your Solana Deposit Address</p>
                            <div className="flex items-center justify-between font-mono">
                                <span className="text-sm text-foreground">{walletAddress || "Configurar walletAddress"}</span>
                                <button onClick={copyAddress} className="p-2 hover:bg-white/10 rounded-xl">
                                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
                            <span className="text-yellow-500 text-lg">⚠️</span>
                            <p className="text-xs text-yellow-500/80 leading-relaxed italic">
                                Only send SOL or SPL tokens to this address on the Solana network. Losses may occur if sent on other networks.
                            </p>
                        </div>
                    </div>
                );
            case 'sacar':
                return (
                    <div className="max-w-md mx-auto space-y-8 py-10">
                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-bold text-foreground">Withdraw Funds</h3>
                            <p className="text-sm text-muted-foreground">Send SOL or tokens to an external wallet address.</p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Recipient Address</label>
                                <input
                                    type="text"
                                    placeholder="Enter Solana Address..."
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Amount</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                                    />
                                    <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary hover:text-white transition-colors">MAX</button>
                                </div>
                            </div>
                        </div>

                        <button className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-lg hover:shadow-primary/20 hover:-translate-y-1 transition-all">
                            Confirm Withdrawal
                        </button>
                    </div>
                );
            case 'historico':
                return (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search Hash..."
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-2 pl-12 pr-4 text-xs text-foreground outline-none focus:border-primary/50"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-2xl text-xs text-muted-foreground hover:bg-white/10">
                                    <Filter className="w-3 h-3" /> Filter
                                </button>
                                <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-2xl text-xs text-muted-foreground hover:bg-white/10 font-bold">
                                    Export CSV
                                </button>
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-x-auto min-h-[400px]">
                            <table className="w-full min-w-[680px] border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-white/10 bg-white/5 uppercase tracking-widest text-muted-foreground font-bold">
                                        <th className="p-4 text-left">Type</th>
                                        <th className="p-4 text-left">Date</th>
                                        <th className="p-4 text-left">Amount</th>
                                        <th className="p-4 text-left">Asset</th>
                                        <th className="p-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tradeHistory.slice(0, 10).map((trade, i) => (
                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-lg ${trade.pnl >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        {trade.pnl >= 0 ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                                    </div>
                                                    <span className="font-medium text-foreground">{trade.pnl >= 0 ? 'Deposit' : 'Withdrawal'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-muted-foreground">{new Date(trade.timestamp).toLocaleDateString()}</td>
                                            <td className="p-4 font-bold text-foreground">{(Math.abs(trade.pnl || 0.1)).toFixed(2)}</td>
                                            <td className="p-4">SOL</td>
                                            <td className="p-4 text-right">
                                                <button className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                                                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {tradeHistory.length === 0 && (
                                <div className="py-20 text-center italic text-muted-foreground">No transactions found...</div>
                            )}
                        </div>
                    </div>
                );
            case 'configuracoes':
                return (
                    <div className="space-y-10 max-w-2xl mx-auto py-6">
                        <div className="space-y-6">
                            <h4 className="text-sm font-bold text-primary uppercase tracking-widest border-b border-primary/20 pb-2">Wallet Security</h4>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <div>
                                    <p className="font-bold text-foreground">Withdrawal Confirmation</p>
                                    <p className="text-xs text-muted-foreground">Require confirmation via dashboard for all sends.</p>
                                </div>
                                <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h4 className="text-sm font-bold text-primary uppercase tracking-widest border-b border-primary/20 pb-2">Notifications</h4>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-foreground">Push Notifications for Deposits</p>
                                    <input type="checkbox" defaultChecked className="accent-primary" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-foreground">Email Confirmation for Withdrawals</p>
                                    <input type="checkbox" defaultChecked className="accent-primary" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest border-b border-red-400/20 pb-2">Advanced</h4>
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-3">
                                <p className="text-xs text-red-400/80 font-medium">Reset Wallet Keys</p>
                                <button className="px-4 py-2 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-colors uppercase">Execute Reset</button>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
            {/* Horizontal Sub-Navigation */}
            <div className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-3xl w-full md:w-fit mx-auto md:mx-0 overflow-x-auto no-scrollbar">
                {[
                    { id: 'saldo', label: 'Saldo', icon: Wallet },
                    { id: 'depositar', label: 'Depositar', icon: ArrowDownLeft },
                    { id: 'sacar', label: 'Sacar', icon: ArrowUpRight },
                    { id: 'historico', label: 'Histórico', icon: History },
                    { id: 'configuracoes', label: 'Configurações', icon: Settings },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as WalletTab)}
                        className={`flex items-center gap-2 px-3 md:px-6 py-2.5 md:py-3 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Viewport Card */}
            <PremiumCard
                title={`Carteira Cripto › ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportWallet}
                            disabled={loadingWallet}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
                        >
                            {loadingWallet ? '...' : 'Exportar chave'}
                        </button>
                        <button
                            onClick={handleCreateWallet}
                            disabled={loadingWallet}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30 disabled:opacity-50"
                        >
                            {loadingWallet ? '...' : 'Criar nova carteira'}
                        </button>
                    </div>
                }
            >
                <div className="min-h-[420px] md:min-h-[500px] space-y-4">
                    {renderContent()}

                    {exportedSecret && (
                        <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground uppercase tracking-widest">Chave Privada (base58)</p>
                                <button
                                    onClick={copySecret}
                                    className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                                >
                                    Copiar
                                </button>
                            </div>
                            <p className="text-[11px] font-mono break-all text-foreground">{exportedSecret}</p>
                            <p className="text-[10px] text-red-400">⚠️ Guarde essa chave com segurança. Quem tiver acesso pode movimentar os fundos.</p>
                        </div>
                    )}
                </div>
            </PremiumCard>
        </div>
    );
};
