import { useState, useEffect } from 'react';
import { PremiumLayout } from './PremiumLayout';
import { PremiumCard } from './PremiumCard';
import { PaymentOnTimeChart } from './PaymentOnTimeChart';
import {
    Wallet,
    Target,
    RotateCcw,
    Settings as SettingsIcon,
    Power
} from 'lucide-react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useAuthStore } from '../../stores/authStore';
import type { PremiumTab } from './Sidebar';
import { WalletDashboard } from './WalletDashboard';
import { PerformanceOverview } from './PerformanceOverview';
import { LearningBlocks } from './LearningBlocks';
import { SimulationReadiness } from './SimulationReadiness';
import { UserAccountArea } from './UserAccountArea';

// Classic component imports
import { TradingParameters } from '../dashboard/TradingParameters';
import { ControlPanel } from '../dashboard/ControlPanel';
import { ActiveProtocols } from '../dashboard/ActiveProtocols';
import { AgentStatus } from '../dashboard/AgentStatus';
import { LearnedRules } from '../dashboard/LearnedRules';
import { TradeHistory } from '../dashboard/TradeHistory';
import { AgentLiveTerminal } from '../dashboard/AgentLiveTerminal';
import { PositionsList } from '../dashboard/PositionsList';

function formatActivityTime(time: unknown): string {
    if (!time) return "--:--:--";

    const date = new Date(time as string | number | Date);
    if (!Number.isNaN(date.getTime())) {
        return date.toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }

    const raw = String(time);
    const hhmmss = raw.match(/(\d{2}:\d{2}:\d{2})/);
    if (hhmmss) return hhmmss[1];

    return "--:--:--";
}

export const PremiumDashboardPage = () => {
    const [activeTab, setActiveTab] = useState<PremiumTab>('overview');
    const {
        logs,
        positions,
        simTrades,
        botHealth,
        agentStatus,
        tradingConfig,
        isAgentActive,
        isBotOnline,
        tradeHistory,
    } = useDashboardData();

    const { user } = useAuthStore();

    const tabTitles: Record<PremiumTab, string> = {
        overview: 'Overview',
        trading: 'Trading',
        logs: 'Logs',
        ai: 'AI',
        wallet: 'Wallet',
        account: 'Account',
    };

    const [cardOrders, setCardOrders] = useState<Record<string, string[]>>({
        overview: ['performance', 'accuracy', 'activity', 'health', 'positions'],
        trading: ['settings', 'automation', 'protocols', 'positions'],
        logs: ['terminal', 'history'],
        ai: ['rules', 'status'],
    });
    const [draggedCard, setDraggedCard] = useState<{ tab: string | null; id: string | null }>({ tab: null, id: null });
    const { refreshData } = useDashboardData();

    // Re-fetch data when mode or tab changes
    useEffect(() => {
        refreshData();
    }, [agentStatus?.mode, activeTab, refreshData]);

    const performanceTrades = simTrades && simTrades.length > 0 ? simTrades : tradeHistory || [];

    const quickPositions = (positions || []).length > 0
        ? positions.map((pos: any) => {
            const size = pos.buySolAmount ?? pos.entryAmount ?? pos.size_sol ?? pos.amount ?? null;
            const pnl = pos.unrealizedPnl ?? pos.pnl ?? null;
            const pnlPercent = pos.unrealizedPnlPercent ?? pos.pnlPercent ?? pos.pnl_percent ?? (pnl && size ? (pnl / size) * 100 : null);
            const entry = pos.entryTime ?? pos.buyTimestamp ?? pos.timestamp ?? null;
            const label = pos.tokenSymbol || pos.symbol || pos.mint || pos.tokenMint || 'Unknown';
            return { label, pnlPercent, pnl, size, entry };
        })
        : (performanceTrades || []).filter((t: any) => t.status === 'OPEN').map((t: any) => ({
            label: t.tokenSymbol || t.symbol || t.tokenMint || t.mint || 'Unknown',
            pnlPercent: t.pnlPercent ?? t.pnl_percent ?? null,
            pnl: t.pnl ?? null,
            size: t.entryAmount ?? t.buyAmountSol ?? null,
            entry: t.entryTime ?? null,
        }));

    const llmStatusLabel = agentStatus?.rateLimited
        ? "Rate Limited"
        : botHealth?.status
            ? botHealth.status.replace(/_/g, " ").toUpperCase()
            : "Unknown";

    const rpcLatencyMs = (botHealth as any)?.latencyMs ?? null;
    const botLiveLabel = isBotOnline
        ? "Bot Live"
        : isAgentActive
            ? "Bot Stalled"
            : "Bot Off";

    const handleDragStart = (tab: string, id: string) => {
        setDraggedCard({ tab, id });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (tab: string, targetId: string) => {
        if (!draggedCard.id || draggedCard.tab !== tab || draggedCard.id === targetId) return;

        const current = cardOrders[tab] || [];
        const newOrder = [...current];
        const draggedIdx = newOrder.indexOf(draggedCard.id);
        const targetIdx = newOrder.indexOf(targetId);
        if (draggedIdx === -1 || targetIdx === -1) return;

        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, draggedCard.id);

        setCardOrders({ ...cardOrders, [tab]: newOrder });
        setDraggedCard({ tab: null, id: null });
    };

    const renderCard = (id: string) => {
        switch (id) {
            case 'performance':
                return (
                    <PremiumCard
                        key="performance"
                        id="performance"
                        draggable
                        onDragStart={() => handleDragStart('overview', 'performance')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('overview', 'performance')}
                        className="xl:col-span-2"
                        title="Performance"
                        icon={Wallet}
                        actions={
                            <button
                                onClick={() => refreshData()}
                                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors text-muted-foreground hover:text-primary"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                        }
                    >
                        <PerformanceOverview />
                    </PremiumCard>
                );
            case 'accuracy':
                return (
                    <PremiumCard
                        key="accuracy"
                        id="accuracy"
                        draggable
                        onDragStart={() => handleDragStart('overview', 'accuracy')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('overview', 'accuracy')}
                        title="Trade Accuracy"
                        icon={Target}
                    >
                        <PaymentOnTimeChart trades={performanceTrades} />
                    </PremiumCard>
                );
            case 'activity':
                return (
                    <PremiumCard
                        key="activity"
                        id="activity"
                        draggable
                        onDragStart={() => handleDragStart('overview', 'activity')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('overview', 'activity')}
                        title="Recent Activity"
                    >
                        <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                            {logs.length > 0 ? logs.slice(0, 8).map((log, i) => (
                                <div key={i} className="flex gap-3 items-start p-3 bg-white/5 rounded-2xl border border-white/5">
                                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${log.type === 'error' ? 'bg-red-500' :
                                        log.type === 'warn' ? 'bg-yellow-500' : 'bg-primary'
                                        }`}></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-foreground font-medium line-clamp-2">{log.message}</p>
                                        <p className="text-[10px] text-muted-foreground mt-1">{formatActivityTime(log.time)}</p>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-muted-foreground italic py-10">No recent activity...</p>
                            )}
                        </div>
                    </PremiumCard>
                );
            case 'health':
                return (
                    <PremiumCard
                        key="health"
                        id="health"
                        draggable
                        onDragStart={() => handleDragStart('overview', 'health')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('overview', 'health')}
                        title="Bot Health"
                    >
                        <div className="space-y-6 py-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground tracking-wider uppercase">Confidence Target</span>
                                    <span className="text-foreground font-bold">{tradingConfig?.agentMinConfidence || 0}%</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary shadow-[0_0_10px_rgba(162,255,218,0.5)] transition-all duration-1000"
                                        style={{ width: `${tradingConfig?.agentMinConfidence || 0}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">LLM Status</p>
                                    <p className={`text-sm font-bold ${agentStatus?.rateLimited ? 'text-red-400' : 'text-green-400'}`}>
                                        {llmStatusLabel}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">RPC Latency</p>
                                    <p className="text-sm font-bold text-primary">{rpcLatencyMs ? `${rpcLatencyMs} ms` : '--'}</p>
                                </div>
                            </div>
                        </div>
                    </PremiumCard>
                );
            case 'score':
                return null;
            case 'positions':
                return (
                    <PremiumCard
                        key="positions"
                        id="positions"
                        draggable
                        onDragStart={() => handleDragStart('overview', 'positions')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('overview', 'positions')}
                        title="Quick Positions View"
                    >
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {quickPositions.length > 0 ? quickPositions.map((pos, i) => (
                                <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                                    <div className="flex justify-between items-start">
                                        <p className="font-bold text-foreground text-sm truncate max-w-[120px]">{pos.label}</p>
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${Number(pos.pnlPercent || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500'}`}>
                                            {pos.pnlPercent !== null && pos.pnlPercent !== undefined
                                                ? `${pos.pnlPercent >= 0 ? '+' : ''}${Number(pos.pnlPercent).toFixed(2)}%`
                                                : '--'}
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>Size: {pos.size ? `${Number(pos.size).toFixed(3)} SOL` : '--'}</span>
                                        <span>{pos.entry ? new Date(pos.entry).toLocaleTimeString() : '--'}</span>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-muted-foreground italic py-10">No active positions...</p>
                            )}
                        </div>
                    </PremiumCard>
                );
            default:
                return null;
        }
    };

    const renderTradingCard = (id: string) => {
        switch (id) {
            case 'settings':
                return (
                    <PremiumCard
                        key="settings"
                        id="settings"
                        draggable
                        className="xl:col-span-2"
                        onDragStart={() => handleDragStart('trading', 'settings')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('trading', 'settings')}
                        title="Settings"
                        icon={SettingsIcon}
                    >
                        <TradingParameters />
                    </PremiumCard>
                );
            case 'automation':
                return (
                    <PremiumCard
                        key="automation"
                        id="automation"
                    draggable
                    onDragStart={() => handleDragStart('trading', 'automation')}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop('trading', 'automation')}
                    title="Control Center"
                    icon={Power}
                >
                    <ControlPanel />
                </PremiumCard>
            );
            case 'protocols':
                return (
                    <PremiumCard
                        key="protocols"
                        id="protocols"
                        draggable
                        onDragStart={() => handleDragStart('trading', 'protocols')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('trading', 'protocols')}
                        title="Active Protocols"
                    >
                        <ActiveProtocols />
                    </PremiumCard>
                );
            case 'positions':
                return (
                    <PremiumCard
                        key="positions-trading"
                        id="positions-trading"
                        draggable
                        className="xl:col-span-2"
                        onDragStart={() => handleDragStart('trading', 'positions')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('trading', 'positions')}
                        title="Detailed Asset Management"
                    >
                        <PositionsList />
                    </PremiumCard>
                );
            default:
                return null;
        }
    };

    const renderLogsCard = (id: string) => {
        switch (id) {
            case 'terminal':
                return (
                    <div
                        key="terminal"
                        draggable
                        onDragStart={() => handleDragStart('logs', 'terminal')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('logs', 'terminal')}
                        className="drag-wrapper"
                    >
                        <AgentLiveTerminal />
                    </div>
                );
            case 'history':
                return (
                    <PremiumCard
                        key="history"
                        id="history"
                        draggable
                        onDragStart={() => handleDragStart('logs', 'history')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('logs', 'history')}
                        title="Full Trade History"
                    >
                        <TradeHistory expanded />
                    </PremiumCard>
                );
            default:
                return null;
        }
    };

    const renderAiCard = (id: string) => {
        switch (id) {
            case 'learning':
                return (
                    <LearningBlocks />
                );
            case 'readiness':
                return (
                    <SimulationReadiness />
                );
            case 'rules':
                return (
                    <PremiumCard
                        key="rules"
                        id="rules"
                        draggable
                        onDragStart={() => handleDragStart('ai', 'rules')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('ai', 'rules')}
                        title="Learned Evolution Rules"
                    >
                        <LearnedRules />
                    </PremiumCard>
                );
            case 'status':
                return (
                    <PremiumCard
                        key="status"
                        id="status"
                        draggable
                        onDragStart={() => handleDragStart('ai', 'status')}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('ai', 'status')}
                        title="Agent Intelligence Status"
                    >
                        <AgentStatus />
                    </PremiumCard>
                );
            default:
                return null;
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'trading':
                return (
                    <div className="space-y-6 lg:space-y-10">
                        <div className="space-y-6">
                            {renderTradingCard('settings')}
                            {renderTradingCard('automation')}
                            {renderTradingCard('protocols')}
                            {renderTradingCard('positions')}
                        </div>
                    </div>
                );
            case 'logs':
                return (
                    <div className="space-y-6 lg:space-y-10">
                        {cardOrders.logs.map(renderLogsCard)}
                    </div>
                );
            case 'ai':
                return (
                    <div className="space-y-6 lg:space-y-10">
                        {[ 'learning', 'readiness', ...cardOrders.ai ].map(renderAiCard)}
                    </div>
                );
            case 'wallet':
                return <WalletDashboard />;
            case 'account':
                return <UserAccountArea />;
            default:
                return (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-10">
                        <div className="xl:col-span-2 space-y-6 lg:space-y-10">
                            {cardOrders.overview.filter(id => ['performance', 'accuracy', 'activity', 'health'].includes(id)).map(id => renderCard(id))}
                        </div>

                        <div className="space-y-6 lg:space-y-10">
                            {cardOrders.overview.filter(id => ['score', 'converter', 'positions'].includes(id)).map(id => renderCard(id))}
                        </div>
                    </div>
                );
        }
    };

    return (
        <PremiumLayout activeTab={activeTab} onTabChange={setActiveTab}>
            <div className="space-y-6 lg:space-y-10">
                {/* Welcome Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 lg:gap-6">
                    <div className="space-y-2">
                        <p className="text-primary font-medium flex items-center gap-2">
                            👋 Welcome In, {user?.name?.split(' ')[0] || "Trader"}!
                        </p>
                        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                            {tabTitles[activeTab]}
                        </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div
                            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 border border-white/10 rounded-2xl text-sm font-medium transition-all ${agentStatus?.mode === "SIMULATION"
                                ? "bg-purple-500/20 text-purple-300"
                                : "bg-red-500/20 text-red-300"
                                }`}
                        >
                            <span>{agentStatus?.mode || "SIMULATION"}</span>
                        </div>

                        <div
                            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 border border-white/10 rounded-2xl text-sm font-medium transition-all ${isBotOnline
                                ? "bg-green-500/20 text-green-200"
                                : isAgentActive
                                    ? "bg-amber-500/20 text-amber-200"
                                : "bg-white/10 text-muted-foreground"
                                }`}
                        >
                            <span>{botLiveLabel}</span>
                            <div className={`w-2 h-2 rounded-full ${isBotOnline ? "bg-green-300 animate-pulse" : isAgentActive ? "bg-amber-300" : "bg-white/40"}`}></div>
                        </div>

                        {/* Bot toggle permanece disponível dentro do menu Trading */}
                    </div>
                </div>

                {/* Content rendering based on active tab */}
                {renderContent()}
            </div>
        </PremiumLayout>
    );
};
