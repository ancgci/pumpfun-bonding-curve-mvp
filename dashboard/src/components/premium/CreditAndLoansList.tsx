import { Building2 } from 'lucide-react';

const LoanItem = ({ bank, type, amount, nextPayment, progress }: any) => (
    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl space-y-4 group hover:bg-white/10 transition-colors">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
                <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h4 className="font-bold text-foreground tracking-tight">{bank}</h4>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{type}</p>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Paid Amount</p>
                <p className="text-lg font-bold text-foreground">{amount}</p>
            </div>
            <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Term</p>
                <p className="text-lg font-bold text-foreground">12 Month</p>
            </div>
        </div>

        <div className="space-y-2">
            <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest">
                <span>Next Payment Date</span>
                <span>{nextPayment}</span>
            </div>
            {/* Segmented Progress Bar */}
            <div className="flex gap-1.5 h-2">
                {[...Array(12)].map((_, i) => (
                    <div
                        key={i}
                        className={`flex-1 rounded-full ${i < progress
                            ? i % 4 === 0 ? 'bg-orange-400' : 'bg-primary'
                            : 'bg-white/10'
                            }`}
                    />
                ))}
            </div>
            <div className="flex justify-between text-[10px] font-bold text-muted-foreground mt-1">
                <span className="text-foreground">$0</span>
                <span className="text-foreground">$15,000.00</span>
            </div>
        </div>
    </div>
);

export const CreditAndLoansList = () => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LoanItem
                bank="TD Bank"
                type="Auto Loan"
                amount="$12,340"
                nextPayment="02 Jan 2026"
                progress={9}
            />
            <LoanItem
                bank="Chase Bank"
                type="Auto Loan"
                amount="$12,340"
                nextPayment="02 Feb 2026"
                progress={4}
            />
        </div>
    );
};
