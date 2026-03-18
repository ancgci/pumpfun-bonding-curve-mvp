import { useEffect, useState, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart3,
    BadgeCheck,
    CreditCard,
    KeyRound,
    LoaderCircle,
    LogOut,
    Mail,
    RefreshCcw,
    ShieldCheck,
    Sparkles,
    Trash2,
    UserRound,
    Users,
    Wallet
} from 'lucide-react';
import api, { API_BASE } from '@/lib/axios';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { PremiumCard } from './PremiumCard';

type PipelineTone = 'active' | 'planned';

interface DetailRowProps {
    label: string;
    value: string;
}

interface PipelineStep {
    title: string;
    description: string;
    status: string;
    tone: PipelineTone;
    icon: ElementType;
}

type ManagedRole = 'ADMIN' | 'USER' | 'SUPPORT';
type ManagedStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED';

interface AdminOverview {
    summary: {
        totalUsers: number;
        activeUsers: number;
        suspendedUsers: number;
        adminUsers: number;
        totalWallets: number;
        activeWallets: number;
        totalPnlSol: number;
        activePositions: number;
        botMode: string;
        botRateLimited: boolean;
        circuitBreakerTripped: boolean;
    };
    users: Array<{
        id: number;
        email: string;
        name: string;
        role: ManagedRole;
        status: ManagedStatus;
        accessOrigin: string;
        billingStatus: string;
        walletCount: number;
        lastLoginAt: string | null;
        createdAt: string;
    }>;
    wallets: Array<{
        id: number;
        userId: number;
        ownerEmail: string;
        ownerName: string;
        ownerRole: string;
        ownerStatus: string;
        label: string;
        publicKey: string;
        status: string;
        isDefault: boolean;
        trackingStatus: string;
        performance: {
            totalPnlSol: number;
            totalPositions: number;
            activePositions: number;
            winRate: string;
        };
    }>;
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

const blueprintFields = [
    'role',
    'inviteCode',
    'subscriptionStatus',
    'billingCustomerId',
    'seatLimit',
    'renewalAt',
];

const pipelineSteps: PipelineStep[] = [
    {
        title: 'Current gate',
        description: 'Google sign-in and manual authorization already protect access today.',
        status: 'Live now',
        tone: 'active',
        icon: ShieldCheck,
    },
    {
        title: 'Invite flow',
        description: 'Attach inviter, invite code and seat status to each new account.',
        status: 'Ready to plug in',
        tone: 'planned',
        icon: Users,
    },
    {
        title: 'Payment unlock',
        description: 'Activate premium access after checkout or webhook confirmation.',
        status: 'Ready to plug in',
        tone: 'planned',
        icon: CreditCard,
    },
];

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
    const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
    const [adminLoading, setAdminLoading] = useState(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
    const [roleLoadingId, setRoleLoadingId] = useState<number | null>(null);
    const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
    const [createUserLoading, setCreateUserLoading] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserRole, setNewUserRole] = useState<ManagedRole>('USER');
    const [newUserStatus, setNewUserStatus] = useState<ManagedStatus>('ACTIVE');
    const [roleDrafts, setRoleDrafts] = useState<Record<number, ManagedRole>>({});

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
    const plan = user?.plan || 'Private dashboard access';
    const memberSince = user?.joinedAt
        ? new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Persist when account storage is enabled';

    const fetchAdminOverview = async () => {
        if (!isAdmin) return;
        setAdminLoading(true);
        setAdminError(null);

        try {
            const { data } = await api.get(`${API_BASE}/admin/overview`);
            setAdminOverview(data);
            const nextDrafts: Record<number, ManagedRole> = {};
            (data.users || []).forEach((managedUser: AdminOverview['users'][number]) => {
                nextDrafts[managedUser.id] = managedUser.role;
            });
            setRoleDrafts(nextDrafts);
        } catch (error: any) {
            setAdminError(error.response?.data?.error || error.message || 'Failed to load admin overview');
        } finally {
            setAdminLoading(false);
        }
    };

    const handleUpdateStatus = async (userId: number, status: 'ACTIVE' | 'PENDING' | 'SUSPENDED') => {
        if (!isAdmin) return;
        setActionLoadingId(userId);
        try {
            await api.patch(`${API_BASE}/admin/users/${userId}/status`, { status });
            await fetchAdminOverview();
        } catch (error: any) {
            setAdminError(error.response?.data?.error || error.message || 'Failed to update status');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleUpdateRole = async (userId: number, role: ManagedRole) => {
        if (!isAdmin) return;
        setRoleLoadingId(userId);
        try {
            await api.patch(`${API_BASE}/admin/users/${userId}/role`, { role });
            await fetchAdminOverview();
        } catch (error: any) {
            setAdminError(error.response?.data?.error || error.message || 'Failed to update role');
        } finally {
            setRoleLoadingId(null);
        }
    };

    const handleDeleteUser = async (managedUser: AdminOverview['users'][number]) => {
        if (!isAdmin || user?.id === managedUser.id) return;

        const confirmed = window.confirm(
            `Delete ${managedUser.email}? This permanently removes the account, wallets, scoped trades, positions and config data.`
        );
        if (!confirmed) return;

        setDeleteLoadingId(managedUser.id);
        setAdminError(null);
        try {
            await api.delete(`${API_BASE}/admin/users/${managedUser.id}`);
            await fetchAdminOverview();
        } catch (error: any) {
            setAdminError(error.response?.data?.error || error.message || 'Failed to delete user');
        } finally {
            setDeleteLoadingId(null);
        }
    };

    const handleCreateUser = async () => {
        if (!isAdmin) return;
        if (!newUserEmail.trim()) {
            setAdminError('User email is required');
            return;
        }

        setCreateUserLoading(true);
        setAdminError(null);
        try {
            await api.post(`${API_BASE}/admin/users`, {
                email: newUserEmail.trim(),
                name: newUserName.trim() || undefined,
                role: newUserRole,
                status: newUserStatus,
            });
            setNewUserEmail('');
            setNewUserName('');
            setNewUserRole('USER');
            setNewUserStatus('ACTIVE');
            await fetchAdminOverview();
        } catch (error: any) {
            setAdminError(error.response?.data?.error || error.message || 'Failed to create user');
        } finally {
            setCreateUserLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) {
            setAdminOverview(null);
            setAdminError(null);
            return;
        }

        void fetchAdminOverview();
    }, [isAdmin]);

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
                                    {user?.name || 'Private User Workspace'}
                                </h2>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Mail className="w-4 h-4 text-primary" />
                                    <span className="break-all">{user?.email || 'No session email loaded'}</span>
                                </div>
                            </div>

                            <p className="max-w-2xl text-sm md:text-base text-muted-foreground leading-7">
                                This space is now dedicated to the logged user and already separates what exists today
                                from what will power invite-only and paid account onboarding next.
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
                                    This session is already protected and can become the base for roles, invites and recurring access.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <DetailRow label="Current session" value="Protected by refresh cookie" />
                        <DetailRow label="Member since" value={memberSince} />
                        <DetailRow label="Invited by" value={user?.invitedBy || 'Not connected yet'} />
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

            <PremiumCard title="Entry Pipeline" icon={Users}>
                <div className="space-y-4">
                    {pipelineSteps.map((step) => {
                        const Icon = step.icon;
                        return (
                            <div
                                key={step.title}
                                className={cn(
                                    "rounded-[1.5rem] border px-4 py-4",
                                    step.tone === 'active'
                                        ? "border-primary/20 bg-primary/8"
                                        : "border-white/10 bg-white/5"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            "mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border",
                                            step.tone === 'active'
                                                ? "border-primary/20 bg-primary/12 text-primary"
                                                : "border-white/10 bg-black/20 text-foreground"
                                        )}
                                    >
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-foreground">{step.title}</p>
                                            <span
                                                className={cn(
                                                    "px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em]",
                                                    step.tone === 'active'
                                                        ? "bg-primary/15 text-primary"
                                                        : "bg-white/10 text-muted-foreground"
                                                )}
                                            >
                                                {step.status}
                                            </span>
                                        </div>
                                        <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </PremiumCard>

            <PremiumCard title="Expansion Blueprint" icon={Sparkles}>
                <div className="space-y-5">
                    <p className="text-sm leading-7 text-muted-foreground">
                        When you move from a single authorized user to invited or paid members, these are the account
                        fields already expected by this area.
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {blueprintFields.map((field) => (
                            <span
                                key={field}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground"
                            >
                                {field}
                            </span>
                        ))}
                    </div>

                    <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 px-4 py-4">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <UserRound className="w-4 h-4 text-primary" />
                            Next backend milestone
                        </p>
                        <p className="text-sm text-muted-foreground mt-2 leading-6">
                            Replace the single `ALLOWED_EMAIL` gate with stored accounts, invite tokens and payment-backed entitlements.
                        </p>
                    </div>
                </div>
            </PremiumCard>

            {isAdmin && (
                <div className="xl:col-span-3 space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.35em] text-primary/80">Admin Command View</p>
                            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                                Global oversight across users and wallets
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                This section reads the first admin-only API cut and shows account coverage, wallet tracking and live bot exposure.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => { void fetchAdminOverview(); }}
                            disabled={adminLoading}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-white/10 disabled:opacity-70"
                        >
                            <RefreshCcw className={cn("w-4 h-4", adminLoading && "animate-spin")} />
                            Refresh admin view
                        </button>
                    </div>

                    {adminError && (
                        <div className="rounded-[1.5rem] border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-300">
                            {adminError}
                        </div>
                    )}

                    {adminLoading && !adminOverview ? (
                        <div className="rounded-[2rem] border border-white/10 bg-white/5 px-6 py-10 flex items-center justify-center gap-3 text-muted-foreground">
                            <LoaderCircle className="w-5 h-5 animate-spin" />
                            Loading admin overview...
                        </div>
                    ) : adminOverview ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
                                {[
                                    {
                                        label: 'Active Users',
                                        value: `${adminOverview.summary.activeUsers}/${adminOverview.summary.totalUsers}`,
                                        detail: `${adminOverview.summary.adminUsers} admin account(s)`,
                                    },
                                    {
                                        label: 'Tracked Wallets',
                                        value: `${adminOverview.summary.activeWallets}/${adminOverview.summary.totalWallets}`,
                                        detail: `${adminOverview.summary.activePositions} active positions`,
                                    },
                                    {
                                        label: 'Aggregate PnL',
                                        value: `${adminOverview.summary.totalPnlSol.toFixed(4)} SOL`,
                                        detail: adminOverview.summary.botRateLimited ? 'Bot rate limited' : 'Bot responsive',
                                    },
                                    {
                                        label: 'Bot Mode',
                                        value: adminOverview.summary.botMode,
                                        detail: adminOverview.summary.circuitBreakerTripped ? 'Circuit breaker on' : 'Circuit breaker clear',
                                    },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-5">
                                        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground mb-3">{item.label}</p>
                                        <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                                        <p className="text-sm text-muted-foreground mt-2">{item.detail}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
                                <PremiumCard title="Managed Users" icon={Users}>
                                    <div className="space-y-4">
                                        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 space-y-3">
                                            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Create user account</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <input
                                                    value={newUserEmail}
                                                    onChange={(event) => setNewUserEmail(event.target.value)}
                                                    type="email"
                                                    placeholder="user@email.com"
                                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                />
                                                <input
                                                    value={newUserName}
                                                    onChange={(event) => setNewUserName(event.target.value)}
                                                    type="text"
                                                    placeholder="Display name (optional)"
                                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                />
                                                <select
                                                    value={newUserRole}
                                                    onChange={(event) => setNewUserRole(event.target.value as ManagedRole)}
                                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                >
                                                    <option value="USER">USER</option>
                                                    <option value="SUPPORT">SUPPORT</option>
                                                    <option value="ADMIN">ADMIN</option>
                                                </select>
                                                <select
                                                    value={newUserStatus}
                                                    onChange={(event) => setNewUserStatus(event.target.value as ManagedStatus)}
                                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                >
                                                    <option value="ACTIVE">ACTIVE</option>
                                                    <option value="PENDING">PENDING</option>
                                                    <option value="SUSPENDED">SUSPENDED</option>
                                                </select>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={createUserLoading}
                                                onClick={() => { void handleCreateUser(); }}
                                                className="inline-flex items-center justify-center rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
                                            >
                                                {createUserLoading ? 'Creating...' : 'Create user'}
                                            </button>
                                        </div>

                                        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
                                        {adminOverview.users.map((managedUser) => {
                                            const isSelf = user?.id === managedUser.id;
                                            const nextStatus: ManagedStatus = managedUser.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                                            const selectedRole = roleDrafts[managedUser.id] || managedUser.role;
                                            const isStatusLoading = actionLoadingId === managedUser.id;
                                            const isRoleLoading = roleLoadingId === managedUser.id;
                                            const isDeleteLoading = deleteLoadingId === managedUser.id;
                                            const isBusy = isStatusLoading || isRoleLoading || isDeleteLoading;
                                            return (
                                                <div key={managedUser.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4 space-y-3">
                                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-semibold text-foreground">{managedUser.name}</p>
                                                            <p className="text-sm text-muted-foreground">{managedUser.email}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                                                                {managedUser.role}
                                                            </span>
                                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                                                {managedUser.status}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                                        <div>
                                                            <p className="text-muted-foreground">Wallets</p>
                                                            <p className="text-foreground font-medium">{managedUser.walletCount}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground">Access</p>
                                                            <p className="text-foreground font-medium">{managedUser.accessOrigin}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground">Billing</p>
                                                            <p className="text-foreground font-medium">{managedUser.billingStatus}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-muted-foreground">Last login</p>
                                                            <p className="text-foreground font-medium">{managedUser.lastLoginAt || '--'}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={isBusy || isSelf}
                                                            onClick={() => void handleDeleteUser(managedUser)}
                                                            className={cn(
                                                                "inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
                                                                "border-red-500/30 text-red-200 hover:bg-red-500/10",
                                                                (isBusy || isSelf) && "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                            {isDeleteLoading ? 'Deleting...' : 'Delete'}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={isBusy || isSelf}
                                                            onClick={() => void handleUpdateStatus(managedUser.id, nextStatus)}
                                                            className={cn(
                                                                "px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
                                                                managedUser.status === 'ACTIVE'
                                                                    ? "border-red-400/30 text-red-200 hover:bg-red-500/10"
                                                                    : "border-green-400/30 text-green-200 hover:bg-green-500/10",
                                                                (isBusy || isSelf) && "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            {isStatusLoading ? 'Updating...' :
                                                                managedUser.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                                        </button>

                                                        <select
                                                            value={selectedRole}
                                                            disabled={isSelf || isBusy}
                                                            onChange={(event) => {
                                                                const role = event.target.value as ManagedRole;
                                                                setRoleDrafts((prev) => ({ ...prev, [managedUser.id]: role }));
                                                            }}
                                                            className={cn(
                                                                "px-3 py-2 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground",
                                                                (isBusy || isSelf) && "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            <option value="USER">USER</option>
                                                            <option value="SUPPORT">SUPPORT</option>
                                                            <option value="ADMIN">ADMIN</option>
                                                        </select>

                                                        <button
                                                            type="button"
                                                            disabled={isSelf || isBusy || selectedRole === managedUser.role}
                                                            onClick={() => void handleUpdateRole(managedUser.id, selectedRole)}
                                                            className={cn(
                                                                "px-3 py-2 rounded-xl border border-primary/30 text-primary text-sm font-medium transition-colors hover:bg-primary/10",
                                                                (isSelf || isBusy || selectedRole === managedUser.role) && "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            {isRoleLoading ? 'Applying...' : 'Apply role'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    </div>
                                </PremiumCard>

                                <PremiumCard title="Wallet Performance" icon={Wallet}>
                                    <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
                                        {adminOverview.wallets.map((wallet) => (
                                            <div key={wallet.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4 space-y-4">
                                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-semibold text-foreground">{wallet.label}</p>
                                                        <p className="text-sm text-muted-foreground">{wallet.ownerName} · {wallet.ownerEmail}</p>
                                                    </div>
                                                    <span className={cn(
                                                        "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                                                        wallet.trackingStatus === 'LIVE'
                                                            ? "border border-primary/20 bg-primary/10 text-primary"
                                                            : "border border-white/10 bg-black/20 text-muted-foreground"
                                                    )}>
                                                        {wallet.trackingStatus}
                                                    </span>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-muted-foreground break-all">
                                                    {wallet.publicKey}
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div>
                                                        <p className="text-muted-foreground">PnL</p>
                                                        <p className="text-foreground font-medium">{wallet.performance.totalPnlSol.toFixed(4)} SOL</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-muted-foreground">Win Rate</p>
                                                        <p className="text-foreground font-medium">{wallet.performance.winRate}%</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-muted-foreground">Open Positions</p>
                                                        <p className="text-foreground font-medium">{wallet.performance.activePositions}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-muted-foreground">Total Positions</p>
                                                        <p className="text-foreground font-medium">{wallet.performance.totalPositions}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </PremiumCard>
                            </div>

                            <PremiumCard title="Admin Signals" icon={BarChart3}>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Suspended Users</p>
                                        <p className="text-2xl font-semibold text-foreground mt-2">{adminOverview.summary.suspendedUsers}</p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Rate Limit</p>
                                        <p className="text-2xl font-semibold text-foreground mt-2">
                                            {adminOverview.summary.botRateLimited ? 'On' : 'Off'}
                                        </p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Circuit Breaker</p>
                                        <p className="text-2xl font-semibold text-foreground mt-2">
                                            {adminOverview.summary.circuitBreakerTripped ? 'Tripped' : 'Clear'}
                                        </p>
                                    </div>
                                </div>
                            </PremiumCard>
                        </>
                    ) : null}
                </div>
            )}
        </div>
    );
};
