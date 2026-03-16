import { Hexagon } from 'lucide-react';

interface CreditCardWidgetProps {
    solBalance?: number;
    label?: string;
    networkLabel?: string;
}

export const CreditCardWidget = ({
    solBalance = 0,
    label = "Admin Wallet",
    networkLabel = "SOLANA MAINNET",
}: CreditCardWidgetProps) => {
    return (
        <div className="relative group perspective-1000">
            {/* Container with Glassmorphism shadow */}
            <div className="absolute -inset-2 bg-primary/20 rounded-[2.5rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative w-full aspect-[1.6/1] rounded-[2rem] overflow-hidden bg-gradient-to-br from-[#85ffe1] via-[#48d1cc] to-[#20b2aa] p-8 flex flex-col justify-between shadow-2xl transform transition-transform duration-500 group-hover:scale-[1.02] group-hover:rotate-x-2">
                {/* Card Noise/Texture Overlay */}
                <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

                {/* Top Section */}
                <div className="flex justify-between items-start">
                    <span className="text-white font-medium text-lg tracking-tight">{label}</span>
                    <Hexagon className="w-10 h-10 text-white/90 fill-white/20" />
                </div>

                {/* Middle Section - Balance Display instead of card number */}
                <div className="mt-4">
                    <p className="text-white text-[10px] uppercase tracking-widest opacity-60 mb-1">Available Balance</p>
                    <p className="text-white text-4xl font-mono tracking-tight drop-shadow-md font-bold">
                        {solBalance.toFixed(3)} <span className="text-2xl opacity-80">SOL</span>
                    </p>
                </div>

                {/* Bottom Section */}
                <div className="flex justify-between items-end">
                    <div className="space-y-1">
                        <p className="text-white/60 text-[10px] uppercase tracking-widest">Bot Status</p>
                        <p className="text-white text-sm font-medium tracking-wide">ACTIVE NODE</p>
                    </div>
                    <div className="space-y-1 text-right">
                        <p className="text-white/60 text-[10px] uppercase tracking-widest">Network</p>
                        <p className="text-white text-sm font-medium">{networkLabel}</p>
                </div>
                </div>

                {/* Action Button */}
                <div className="absolute bottom-8 left-8">
                    <button className="px-4 py-2 bg-black/20 backdrop-blur-md rounded-full border border-white/20 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-black/30 transition-colors">
                        Refresh Wallet
                    </button>
                </div>

                {/* Card Brand Circles (kept for aesthetic) */}
                <div className="absolute bottom-8 right-8 flex">
                    <div className="w-8 h-8 rounded-full bg-primary/40 opacity-80 blur-sm"></div>
                    <div className="w-8 h-8 rounded-full bg-white/20 -ml-4 opacity-80 backdrop-blur-md"></div>
                </div>
            </div>
        </div>
    );
};
