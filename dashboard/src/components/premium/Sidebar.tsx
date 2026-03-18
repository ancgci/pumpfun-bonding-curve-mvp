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

export type PremiumTab = 'overview' | 'trading' | 'logs' | 'ai' | 'wallet' | 'account';

const SidebarItem = ({ icon: Icon, active = false, onClick }: { icon: any; active?: boolean; onClick?: () => void }) => (
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
        <aside className="fixed left-0 top-0 h-screen w-20 flex flex-col items-center py-8 bg-background border-r border-white/5 z-50">
            {/* Logo */}
            <div className="mb-12">
                <div className="p-3 bg-white/5 rounded-2xl border border-white/10 shadow-lg animate-pulse-slow">
                    <Hexagon className="w-8 h-8 text-primary fill-primary/20" />
                </div>
            </div>

            {/* Nav Items */}
            <nav className="flex-1 flex flex-col gap-6">
                <SidebarItem icon={LayoutGrid} active={activeTab === 'overview'} onClick={() => onTabChange('overview')} />
                <SidebarItem icon={BarChart3} active={activeTab === 'trading'} onClick={() => onTabChange('trading')} />
                <SidebarItem icon={Terminal} active={activeTab === 'logs'} onClick={() => onTabChange('logs')} />
                <SidebarItem icon={Brain} active={activeTab === 'ai'} onClick={() => onTabChange('ai')} />
                <SidebarItem icon={Wallet} active={activeTab === 'wallet'} onClick={() => onTabChange('wallet')} />
                <SidebarItem icon={UserRound} active={activeTab === 'account'} onClick={() => onTabChange('account')} />
            </nav>

            {/* Bottom Actions */}
            <div className="flex flex-col gap-6 mt-auto px-4">
                <div className="p-3 rounded-2xl bg-[#ffede0] text-[#8b4513] cursor-pointer hover:bg-[#ffe0cc] transition-colors">
                    <Headphones className="w-6 h-6" />
                </div>
            </div>
        </aside>
    );
};
