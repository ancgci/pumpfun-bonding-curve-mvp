import { useEffect, useRef, useState } from 'react';
import {
    Search,
    Bell,
    Settings,
    Sun,
    Moon,
    ChevronRight,
    RotateCcw,
    ScrollText,
    SlidersHorizontal,
    Wallet,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../../stores/authStore';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useThemePreference } from '../../hooks/useThemePreference';
import type { PremiumTab } from './Sidebar';

interface TopNavigationProps {
    activeTab: PremiumTab;
    isAccountActive?: boolean;
    onOpenAccount: () => void;
    onTabChange: (tab: PremiumTab) => void;
}

type SearchResult = {
    id: string;
    kind: 'Trade' | 'Position' | 'Signal';
    title: string;
    subtitle: string;
    tab: PremiumTab;
    searchValue: string;
    time: number;
    accentClassName: string;
};

type SignalItem = {
    id: string;
    tone: 'info' | 'success' | 'warning' | 'danger';
    title: string;
    description: string;
    time: number;
    tab: PremiumTab;
};

const NOTIFICATION_READ_STORAGE_KEY = 'pumpfun-dashboard-notifications-read-at';

function getTimestamp(value: unknown): number {
    if (!value) return 0;

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const date = new Date(value as string | Date);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatRelativePanelTime(time: number): string {
    if (!time) return '--';

    const date = new Date(time);
    const now = Date.now();
    const diffMinutes = Math.round((now - time) / 60000);

    if (diffMinutes <= 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 24 * 60) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitialNotificationReadAt(): number {
    if (typeof window === 'undefined') return 0;

    const savedValue = window.localStorage.getItem(NOTIFICATION_READ_STORAGE_KEY);
    const parsed = Number(savedValue || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export const TopNavigation = ({ activeTab, isAccountActive = false, onOpenAccount, onTabChange }: TopNavigationProps) => {
    const { user } = useAuthStore();
    const { logs, positions, tradeHistory, simTrades, refreshData } = useDashboardData();
    const { theme, setTheme } = useThemePreference();

    const [openPanel, setOpenPanel] = useState<'search' | 'settings' | 'signals' | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileSearchVisible, setMobileSearchVisible] = useState(false);
    const [lastNotificationReadAt, setLastNotificationReadAt] = useState<number>(() => getInitialNotificationReadAt());

    const searchRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const signalsRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const tradeSource = simTrades && simTrades.length > 0 ? simTrades : tradeHistory || [];

    const searchResults: SearchResult[] = [];
    const normalizedQuery = searchQuery.trim().toLowerCase();

    (tradeSource || []).slice(0, 30).forEach((trade: any, index: number) => {
        const symbol = trade.symbol || trade.tokenSymbol || trade.mint || trade.tokenMint || 'Unknown trade';
        const status = trade.status || trade.exitReason || 'OPEN';
        const mint = trade.mint || trade.tokenMint || '';
        const time = getTimestamp(trade.exitTime || trade.entryTime);
        searchResults.push({
            id: `trade-${mint || symbol}-${index}`,
            kind: 'Trade',
            title: String(symbol),
            subtitle: `${status} • ${trade.isSimulation === false ? 'Live' : 'Simulation'} trade`,
            tab: 'logs',
            searchValue: `${symbol} ${mint} ${status}`.toLowerCase(),
            time,
            accentClassName: 'text-cyan-300',
        });
    });

    (positions || []).slice(0, 20).forEach((position: any, index: number) => {
        const symbol = position.tokenSymbol || position.symbol || position.mint || position.tokenMint || 'Unknown position';
        const mint = position.mint || position.tokenMint || '';
        const size = position.buySolAmount ?? position.entryAmount ?? position.size_sol ?? position.amount;
        const pnl = position.unrealizedPnlPercent ?? position.pnlPercent ?? position.pnl_percent;
        const time = getTimestamp(position.entryTime || position.buyTimestamp || position.timestamp);
        searchResults.push({
            id: `position-${mint || symbol}-${index}`,
            kind: 'Position',
            title: String(symbol),
            subtitle: `Open position • ${size ? `${Number(size).toFixed(3)} SOL` : '--'} • ${pnl !== undefined && pnl !== null ? `${Number(pnl).toFixed(2)}%` : 'PnL pending'}`,
            tab: 'trading',
            searchValue: `${symbol} ${mint} ${size ?? ''} ${pnl ?? ''}`.toLowerCase(),
            time,
            accentClassName: 'text-emerald-300',
        });
    });

    (logs || []).slice(0, 30).forEach((log: any, index: number) => {
        const message = String(log.message || '').replace(/\s+/g, ' ').trim();
        const shortMessage = message.length > 90 ? `${message.slice(0, 90)}...` : message || 'Signal';
        const time = getTimestamp(log.time || log.timestamp);
        searchResults.push({
            id: `signal-${time}-${index}`,
            kind: 'Signal',
            title: shortMessage,
            subtitle: `${String(log.type || log.level || 'info').toUpperCase()} • Live log signal`,
            tab: 'logs',
            searchValue: message.toLowerCase(),
            time,
            accentClassName: log.type === 'error' || log.level === 'error' ? 'text-rose-300' : 'text-amber-300',
        });
    });

    const filteredSearchResults = searchResults
        .filter((item) => !normalizedQuery || item.searchValue.includes(normalizedQuery))
        .sort((a, b) => b.time - a.time)
        .slice(0, normalizedQuery ? 8 : 6);

    const signalItems: SignalItem[] = [];

    (tradeSource || []).slice(0, 6).forEach((trade: any, index: number) => {
        const symbol = trade.symbol || trade.tokenSymbol || trade.mint || trade.tokenMint || 'Unknown trade';
        const status = trade.status || trade.exitReason || 'OPEN';
        const pnl = Number(trade.pnl || 0);
        const time = getTimestamp(trade.exitTime || trade.entryTime);
        const tone: SignalItem['tone'] = status === 'OPEN'
            ? 'info'
            : pnl > 0
                ? 'success'
                : pnl < 0
                    ? 'danger'
                    : 'warning';

        signalItems.push({
            id: `trade-signal-${time}-${index}`,
            tone,
            title: status === 'OPEN' ? `${symbol} position opened` : `${symbol} trade closed`,
            description: status === 'OPEN'
                ? 'A new position is active in the bot feed.'
                : `${status}${trade.isSimulation === false ? ' • Live mode' : ' • Simulation mode'}`,
            time,
            tab: 'logs',
        });
    });

    (logs || [])
        .filter((log: any) => {
            const level = String(log.type || log.level || '').toLowerCase();
            const message = String(log.message || '');
            return level === 'warn' || level === 'error' || /whale|buy|sell|stop loss|take profit|block|reject/i.test(message);
        })
        .slice(0, 8)
        .forEach((log: any, index: number) => {
            const level = String(log.type || log.level || 'info').toLowerCase();
            const message = String(log.message || '').replace(/\s+/g, ' ').trim();
            const time = getTimestamp(log.time || log.timestamp);
            signalItems.push({
                id: `log-signal-${time}-${index}`,
                tone: level === 'error' ? 'danger' : level === 'warn' ? 'warning' : 'info',
                title: level === 'error' ? 'Critical signal' : level === 'warn' ? 'Warning signal' : 'Trading signal',
                description: message.length > 120 ? `${message.slice(0, 120)}...` : message,
                time,
                tab: 'logs',
            });
        });

    const notifications = signalItems
        .filter((item) => item.time > 0)
        .sort((a, b) => b.time - a.time)
        .slice(0, 8);

    const unreadNotifications = notifications.filter((item) => item.time > lastNotificationReadAt).length;

    useEffect(() => {
        if (!openPanel) return;

        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node;
            const clickedInsideSearch = searchRef.current?.contains(target);
            const clickedInsideSettings = settingsRef.current?.contains(target);
            const clickedInsideSignals = signalsRef.current?.contains(target);

            if (!clickedInsideSearch && !clickedInsideSettings && !clickedInsideSignals) {
                setOpenPanel(null);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [openPanel]);

    useEffect(() => {
        if (!mobileSearchVisible) return;
        searchInputRef.current?.focus();
    }, [mobileSearchVisible]);

    useEffect(() => {
        if (openPanel !== 'signals') return;

        const latestTimestamp = notifications[0]?.time || Date.now();
        setLastNotificationReadAt(latestTimestamp);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(NOTIFICATION_READ_STORAGE_KEY, String(latestTimestamp));
        }
    }, [notifications, openPanel]);

    const handleSearchSelection = (result: SearchResult) => {
        onTabChange(result.tab);
        setOpenPanel(null);
        setSearchQuery('');
        setMobileSearchVisible(false);
    };

    const handleSearchSubmit = () => {
        if (filteredSearchResults.length === 0) return;
        handleSearchSelection(filteredSearchResults[0]);
    };

    const handleQuickAction = async (tab?: PremiumTab) => {
        if (tab) {
            onTabChange(tab);
        }

        setOpenPanel(null);
    };

    return (
        <header className="relative flex flex-wrap items-center justify-between gap-3 py-4 md:py-6 px-4 sm:px-6 lg:px-10 bg-transparent">
            {/* Search Bar */}
            <div
                ref={searchRef}
                className={cn(
                    "relative group w-full lg:w-96",
                    mobileSearchVisible ? "block order-3 basis-full" : "hidden lg:block"
                )}
            >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                </div>
                <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onFocus={() => setOpenPanel('search')}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setOpenPanel('search');
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchSubmit();
                        }
                        if (e.key === 'Escape') {
                            setOpenPanel(null);
                            setMobileSearchVisible(false);
                        }
                    }}
                    className="block w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl leading-5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all duration-300"
                    placeholder="Search trade, token or signal..."
                />

                {openPanel === 'search' && (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-50 rounded-[1.5rem] border border-white/10 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Quick Search</p>
                                <p className="text-xs text-muted-foreground">Trades, positions and live signals</p>
                            </div>
                            {mobileSearchVisible && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOpenPanel(null);
                                        setMobileSearchVisible(false);
                                    }}
                                    className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <div className="max-h-80 overflow-y-auto">
                            {filteredSearchResults.length > 0 ? (
                                filteredSearchResults.map((result) => (
                                    <button
                                        key={result.id}
                                        type="button"
                                        onClick={() => handleSearchSelection(result)}
                                        className="w-full px-4 py-3 text-left border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                                                <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                <span className={cn("text-[10px] uppercase tracking-[0.22em]", result.accentClassName)}>
                                                    {result.kind}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">{formatRelativePanelTime(result.time)}</span>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="px-4 py-8 text-center">
                                    <p className="text-sm font-medium text-foreground">No matches found</p>
                                    <p className="text-xs text-muted-foreground mt-1">Try a token symbol, mint, trade status or log keyword.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-4 ml-auto">
                <button
                    type="button"
                    onClick={() => {
                        setMobileSearchVisible((current) => {
                            const next = !current;
                            setOpenPanel(next ? 'search' : null);
                            return next;
                        });
                    }}
                    className="lg:hidden p-2.5 bg-white/5 rounded-2xl border border-white/10 text-muted-foreground hover:text-foreground transition-all hover:bg-white/10"
                >
                    <Search className="h-4 w-4" />
                </button>

                <div className="hidden md:flex bg-white/5 p-1 rounded-2xl border border-white/10">
                    <button
                        type="button"
                        onClick={() => setTheme('light')}
                        aria-pressed={theme === 'light'}
                        className={cn(
                            "p-2 rounded-xl transition-colors",
                            theme === 'light' ? "bg-white/10 text-foreground shadow-lg backdrop-blur-md" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Sun className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        aria-pressed={theme === 'dark'}
                        className={cn(
                            "p-2 rounded-xl transition-colors",
                            theme === 'dark' ? "bg-white/10 text-foreground shadow-lg backdrop-blur-md" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Moon className="h-5 w-5" />
                    </button>
                </div>

                <div ref={settingsRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setOpenPanel((current) => current === 'settings' ? null : 'settings')}
                        className={cn(
                            "p-2.5 sm:p-3 bg-white/5 rounded-2xl border border-white/10 text-muted-foreground hover:text-foreground transition-all hover:bg-white/10",
                            openPanel === 'settings' && "text-foreground bg-white/10"
                        )}
                    >
                        <Settings className="h-5 w-5" />
                    </button>

                    {openPanel === 'settings' && (
                        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 max-w-[calc(100vw-2rem)] rounded-[1.5rem] border border-white/10 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                                <p className="text-sm font-semibold text-foreground">Quick Settings</p>
                                <p className="text-xs text-muted-foreground">Use the gear for shortcuts into the operational areas.</p>
                            </div>

                            <div className="p-3 space-y-2">
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-foreground">Theme</p>
                                            <p className="text-xs text-muted-foreground">Switch between day and night mode.</p>
                                        </div>
                                        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-background/70 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setTheme('light')}
                                                className={cn(
                                                    "p-2 rounded-xl transition-colors",
                                                    theme === 'light' ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                <Sun className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTheme('dark')}
                                                className={cn(
                                                    "p-2 rounded-xl transition-colors",
                                                    theme === 'dark' ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                <Moon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleQuickAction('trading')}
                                    className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <SlidersHorizontal className="w-4 h-4 text-primary shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground">Trading Settings</p>
                                            <p className="text-xs text-muted-foreground">Open the live configuration cards.</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleQuickAction('account')}
                                    className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Wallet className="w-4 h-4 text-primary shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground">Account Area</p>
                                            <p className="text-xs text-muted-foreground">Review user profile and premium account data.</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleQuickAction('logs')}
                                    className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <ScrollText className="w-4 h-4 text-primary shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground">Signals and Logs</p>
                                            <p className="text-xs text-muted-foreground">Jump straight to the terminal and trade history.</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </button>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        await refreshData();
                                        setOpenPanel(null);
                                    }}
                                    className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <RotateCcw className="w-4 h-4 text-primary shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground">Refresh Now</p>
                                            <p className="text-xs text-muted-foreground">Force an immediate dashboard data refresh.</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div ref={signalsRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setOpenPanel((current) => current === 'signals' ? null : 'signals')}
                        className={cn(
                            "relative p-2.5 sm:p-3 bg-white/5 rounded-2xl border border-white/10 text-muted-foreground hover:text-foreground transition-all hover:bg-white/10",
                            openPanel === 'signals' && "text-foreground bg-white/10"
                        )}
                    >
                        <Bell className="h-5 w-5" />
                        {unreadNotifications > 0 && (
                            <>
                                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-background"></span>
                                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center border border-background">
                                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                                </span>
                            </>
                        )}
                    </button>

                    {openPanel === 'signals' && (
                        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-88 max-w-[calc(100vw-2rem)] rounded-[1.5rem] border border-white/10 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
                            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Signal Center</p>
                                    <p className="text-xs text-muted-foreground">
                                        {notifications.length > 0 ? `${notifications.length} recent signals` : 'No active signals'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onTabChange('logs');
                                        setOpenPanel(null);
                                    }}
                                    className="text-xs font-medium text-primary hover:text-foreground transition-colors"
                                >
                                    Open logs
                                </button>
                            </div>

                            <div className="max-h-96 overflow-y-auto">
                                {notifications.length > 0 ? (
                                    notifications.map((notification) => (
                                        <button
                                            key={notification.id}
                                            type="button"
                                            onClick={() => {
                                                onTabChange(notification.tab);
                                                setOpenPanel(null);
                                            }}
                                            className="w-full px-4 py-3 text-left border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                                        >
                                            <div className="flex items-start gap-3">
                                                <span
                                                    className={cn(
                                                        "mt-1.5 h-2.5 w-2.5 rounded-full shrink-0",
                                                        notification.tone === 'danger' && "bg-rose-400",
                                                        notification.tone === 'warning' && "bg-amber-400",
                                                        notification.tone === 'success' && "bg-emerald-400",
                                                        notification.tone === 'info' && "bg-sky-400"
                                                    )}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <p className="text-sm font-medium text-foreground">{notification.title}</p>
                                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                                            {formatRelativePanelTime(notification.time)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">{notification.description}</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-4 py-8 text-center">
                                        <p className="text-sm font-medium text-foreground">No recent signals</p>
                                        <p className="text-xs text-muted-foreground mt-1">The bell will surface new warnings, fills and critical log events.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* User Profile */}
                <button
                    type="button"
                    onClick={onOpenAccount}
                    className={cn(
                        "flex items-center gap-2 sm:gap-4 pl-0 md:pl-4 ml-0 md:ml-2 md:border-l border-white/10 text-left transition-all rounded-2xl pr-2 sm:pr-3 py-2 hover:bg-white/5 min-w-0",
                        isAccountActive && "bg-white/5 border-white/10 shadow-[0_0_24px_rgba(162,255,218,0.08)]"
                    )}
                >
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-primary/80 mb-1">User Area</p>
                        <p className="text-sm font-semibold text-foreground">{user?.name || "Premium User"}</p>
                        <p className="text-xs text-muted-foreground">{user?.email || "bot.owner@pumpfun.io"}</p>
                    </div>
                    <div className="relative">
                        <img
                            src={user?.picture || "https://api.dicebear.com/7.x/avataaars/svg?seed=John"}
                            alt="Avatar"
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border border-white/20 object-cover shrink-0"
                        />
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${user ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                    </div>
                    <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs font-medium text-muted-foreground">
                        <span>{isAccountActive || activeTab === 'account' ? "Viewing account" : "Open account"}</span>
                        <ChevronRight className="w-4 h-4" />
                    </div>
                </button>
            </div>
        </header>
    );
};
