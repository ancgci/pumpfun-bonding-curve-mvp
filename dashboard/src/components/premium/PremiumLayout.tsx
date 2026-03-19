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

            <div className="min-h-screen flex flex-col lg:pl-20">
                <TopNavigation
                    activeTab={activeTab}
                    onTabChange={onTabChange}
                    isAccountActive={activeTab === 'account'}
                    onOpenAccount={() => onTabChange('account')}
                />

                <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:p-10 overflow-x-clip pb-24 lg:pb-10">
                    {children}
                </main>
            </div>
        </div>
    );
};
