import {
    Search,
    Bell,
    Settings,
    Sun,
    Moon,
    ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../../stores/authStore';

interface TopNavigationProps {
    isAccountActive?: boolean;
    onOpenAccount: () => void;
}

export const TopNavigation = ({ isAccountActive = false, onOpenAccount }: TopNavigationProps) => {
    const { user } = useAuthStore();

    return (
        <header className="flex items-center justify-between gap-3 py-4 md:py-6 px-4 sm:px-6 lg:px-10 bg-transparent">
            {/* Search Bar */}
            <div className="relative group hidden lg:block w-96">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl leading-5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all duration-300"
                    placeholder="Search Transaction..."
                />
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-4 ml-auto">
                <button className="lg:hidden p-2.5 bg-white/5 rounded-2xl border border-white/10 text-muted-foreground hover:text-foreground transition-all hover:bg-white/10">
                    <Search className="h-4 w-4" />
                </button>

                <div className="hidden md:flex bg-white/5 p-1 rounded-2xl border border-white/10">
                    <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                        <Sun className="h-5 w-5" />
                    </button>
                    <button className="p-2 bg-white/10 rounded-xl text-foreground shadow-lg backdrop-blur-md">
                        <Moon className="h-5 w-5" />
                    </button>
                </div>

                <button className="hidden md:flex p-3 bg-white/5 rounded-2xl border border-white/10 text-muted-foreground hover:text-foreground transition-all hover:bg-white/10">
                    <Settings className="h-5 w-5" />
                </button>

                <button className="relative p-2.5 sm:p-3 bg-white/5 rounded-2xl border border-white/10 text-muted-foreground hover:text-foreground transition-all hover:bg-white/10">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full border border-background"></span>
                </button>

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
                        <span>{isAccountActive ? "Viewing account" : "Open account"}</span>
                        <ChevronRight className="w-4 h-4" />
                    </div>
                </button>
            </div>
        </header>
    );
};
