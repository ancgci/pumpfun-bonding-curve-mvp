import {
    LayoutGrid,
    BarChart3,
    Wallet,
    Hexagon,
    Terminal,
    Brain,
    UserRound,
    Headphones
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ElementType } from 'react';

export type PremiumTab = 'overview' | 'trading' | 'logs' | 'ai' | 'wallet' | 'account';

const navItems: Array<{ tab: PremiumTab; icon: ElementType; label: string }> = [
    { tab: 'overview', icon: LayoutGrid, label: 'Overview' },
    { tab: 'trading', icon: BarChart3, label: 'Trading' },
    { tab: 'logs', icon: Terminal, label: 'Logs' },
    { tab: 'ai', icon: Brain, label: 'AI' },
    { tab: 'wallet', icon: Wallet, label: 'Wallet' },
    { tab: 'account', icon: UserRound, label: 'Account' },
];

const SidebarItem = ({ icon: Icon, active = false, onClick }: { icon: ElementType; active?: boolean; onClick?: () => void }) => (
    <div
        onClick={onClick}
        className={cn(
            "p-3 rounded-xl cursor-pointer transition-all duration-300 group",
            active
                ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(162,255,218,0.3)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        )}
    >
        <Icon className="w-6 h-6" />
    </div>
);

export const Sidebar = ({ activeTab, onTabChange }: { activeTab: PremiumTab; onTabChange: (tab: PremiumTab) => void }) => {
    return (
        <>
            <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-20 flex-col items-center py-8 bg-background border-r border-white/5 z-50">
                {/* Logo */}
                <div className="mb-12">
                    <div className="p-3 bg-white/5 rounded-2xl border border-white/10 shadow-lg animate-pulse-slow">
                        <Hexagon className="w-8 h-8 text-primary fill-primary/20" />
                    </div>
                </div>

                {/* Nav Items */}
                <nav className="flex-1 flex flex-col gap-6">
                    {navItems.map((item) => (
                        <SidebarItem
                            key={item.tab}
                            icon={item.icon}
                            active={activeTab === item.tab}
                            onClick={() => onTabChange(item.tab)}
                        />
                    ))}
                </nav>

                {/* Bottom Actions */}
                <div className="flex flex-col gap-6 mt-auto px-4">
                    <div className="p-3 rounded-2xl bg-[#ffede0] text-[#8b4513] cursor-pointer hover:bg-[#ffe0cc] transition-colors">
                        <Headphones className="w-6 h-6" />
                    </div>
                </div>
            </aside>

            <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-background/95 backdrop-blur-md px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
                <div className="grid grid-cols-6 gap-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.tab;
                        return (
                            <button
                                key={item.tab}
                                type="button"
                                onClick={() => onTabChange(item.tab)}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 text-[10px] transition-colors",
                                    isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                )}
                                aria-label={item.label}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="leading-none">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </>
    );
};
