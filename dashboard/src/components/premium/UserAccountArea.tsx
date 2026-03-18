import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BadgeCheck,
    KeyRound,
    LoaderCircle,
    LogOut,
    Mail,
    ShieldCheck,
    UserRound,
    Wallet
} from 'lucide-react';
import { API_BASE } from '@/lib/axios';
import { useAuthStore } from '@/stores/authStore';
import { PremiumCard } from './PremiumCard';

interface DetailRowProps {
    label: string;
    value: string;
}

const accessStatusLabels = {
    active: 'Active',
    pending: 'Pending setup',
    suspended: 'Suspended',
} as const;

const accessOriginLabels = {
    allowlist: 'Manual allowlist',
    invite: 'Invite approval',
    payment: 'Paid onboarding',
} as const;

const providerLabels = {
    google: 'Google OAuth',
    invite: 'Invite token',
    payment: 'Payment unlock',
} as const;

const billingLabels = {
    'not-required': 'Not enabled yet',
    pending: 'Pending payment',
    paid: 'Payment confirmed',
    overdue: 'Past due',
} as const;

function DetailRow({ label, value }: DetailRowProps) {
    return (
        <div className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-b-0 last:pb-0 first:pt-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-medium text-foreground text-right">{value}</span>
        </div>
    );
}

export const UserAccountArea = () => {
    const user = useAuthStore((state) => state.user);
    const clearAuth = useAuthStore((state) => state.logout);
    const navigate = useNavigate();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const isAdmin = user?.role === 'ADMIN';

    const initials = user?.name
        ? user.name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join('')
        : 'PF';

    const accessStatus = accessStatusLabels[user?.accessStatus ?? 'active'];
    const accessOrigin = accessOriginLabels[user?.accessOrigin ?? 'allowlist'];
    const provider = providerLabels[user?.provider ?? 'google'];
    const billing = billingLabels[user?.billingStatus ?? 'not-required'];
    const plan = isAdmin ? 'Administrator Multiwallet Access' : user?.plan || 'Private dashboard access';
    const memberSince = user?.joinedAt
        ? new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Persist when account storage is enabled';

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch {
            // Local logout should still happen if the API call fails.
        } finally {
            clearAuth();
            navigate('/login', { replace: true });
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-10">
            <PremiumCard className="xl:col-span-2 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(162,255,218,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.10),transparent_28%)]" />

                <div className="relative flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8">
                    <div className="flex items-start gap-5 min-w-0">
                        {user?.picture ? (
                            <img
                                src={user.picture}
                                alt={user?.name || 'User avatar'}
                                className="w-24 h-24 rounded-[2rem] object-cover border border-white/15 shadow-xl"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-[2rem] bg-white/10 border border-white/10 flex items-center justify-center text-2xl font-semibold text-foreground">
                                {initials}
                            </div>
                        )}

                        <div className="space-y-4 min-w-0">
                            <div className="space-y-2">
                                <p className="text-xs uppercase tracking-[0.35em] text-primary/80">Account Center</p>
                                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                                    {user?.name || 'Administrator Workspace'}
                                </h2>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Mail className="w-4 h-4 text-primary" />
                                    <span className="break-all">{user?.email || 'No session email loaded'}</span>
                                </div>
                            </div>

                            <p className="max-w-2xl text-sm md:text-base text-muted-foreground leading-7">
                                This workspace is now focused on a single administrator account operating one shared bot
                                with multiple managed wallets.
                            </p>

                            <div className="flex flex-wrap gap-3">
                                {[accessStatus, accessOrigin, provider].map((item) => (
                                    <span
                                        key={item}
                                        className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-foreground"
                                    >
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 xl:max-w-sm">
                        {[
                            { label: 'Access', value: accessStatus },
                            { label: 'Provider', value: provider },
                            { label: 'Billing', value: billing },
                            { label: 'Plan', value: plan },
                        ].map((item) => (
                            <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-sm">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground mb-2">{item.label}</p>
                                <p className="text-sm font-semibold text-foreground leading-5">{item.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </PremiumCard>

            <PremiumCard title="Session Control" icon={KeyRound}>
                <div className="space-y-6">
                    <div className="rounded-[1.5rem] border border-primary/15 bg-primary/8 px-4 py-4">
                        <div className="flex items-start gap-3">
                            <BadgeCheck className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-foreground">Authenticated workspace</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    This session controls the single owner account and the active trading wallet used by the bot.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <DetailRow label="Current session" value="Protected by refresh cookie" />
                        <DetailRow label="Member since" value={memberSince} />
                        <DetailRow label="Mode" value={isAdmin ? 'Administrator only' : 'Private access'} />
                    </div>

                    <button
                        type="button"
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-white/10 disabled:opacity-70"
                    >
                        {isLoggingOut ? (
                            <>
                                <LoaderCircle className="w-4 h-4 animate-spin" />
                                Signing out...
                            </>
                        ) : (
                            <>
                                <LogOut className="w-4 h-4" />
                                Sign out
                            </>
                        )}
                    </button>
                </div>
            </PremiumCard>

            <PremiumCard title="Access Setup" icon={ShieldCheck}>
                <div className="space-y-1">
                    <DetailRow label="Account status" value={accessStatus} />
                    <DetailRow label="Access source" value={accessOrigin} />
                    <DetailRow label="Authentication" value={provider} />
                    <DetailRow label="Billing state" value={billing} />
                </div>
            </PremiumCard>

            {isAdmin && (
                <>
                    <PremiumCard title="Administrator Mode" icon={UserRound}>
                        <div className="space-y-4">
                            <p className="text-sm leading-7 text-muted-foreground">
                                Multiuser onboarding was removed from the operational path. This account now acts as the
                                single owner and uses the Wallet area to manage multiple trading wallets.
                            </p>
                            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4">
                                <p className="text-sm font-semibold text-foreground">Active wallet model</p>
                                <p className="text-sm text-muted-foreground mt-2">
                                    The bot executes on the wallet currently marked as default/active, while the other
                                    wallets stay managed under the same administrator account.
                                </p>
                            </div>
                        </div>
                    </PremiumCard>

                    <PremiumCard title="Wallet Operating Model" icon={Wallet}>
                        <div className="space-y-4">
                            {[
                                'One shared strategy engine',
                                'One active trading wallet at a time',
                                'Multiple managed wallets for capital separation',
                                'Single administrator session controlling the workspace',
                            ].map((item) => (
                                <div key={item} className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground">
                                    {item}
                                </div>
                            ))}
                        </div>
                    </PremiumCard>
                </>
            )}
        </div>
    );
};
