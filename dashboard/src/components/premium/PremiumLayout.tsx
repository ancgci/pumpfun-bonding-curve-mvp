import React from 'react';
import { Sidebar } from './Sidebar';
import type { PremiumTab } from './Sidebar';
import { TopNavigation } from './TopNavigation';

interface PremiumLayoutProps {
    children: React.ReactNode;
    activeTab: PremiumTab;
    onTabChange: (tab: PremiumTab) => void;
}

export const PremiumLayout = ({ children, activeTab, onTabChange }: PremiumLayoutProps) => {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <Sidebar activeTab={activeTab} onTabChange={onTabChange} />

            <div className="pl-20 min-h-screen flex flex-col">
                <TopNavigation />

                <main className="flex-1 p-10 overflow-x-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
};
