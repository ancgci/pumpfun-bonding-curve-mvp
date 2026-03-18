import { create } from "zustand";

export interface AuthUser {
    id?: number;
    email: string;
    name: string;
    picture?: string | null;
    role?: "ADMIN" | "USER" | "SUPPORT";
    provider?: "google" | "invite" | "payment";
    accessOrigin?: "allowlist" | "invite" | "payment";
    accessStatus?: "active" | "pending" | "suspended";
    billingStatus?: "not-required" | "pending" | "paid" | "overdue";
    plan?: string;
    invitedBy?: string | null;
    joinedAt?: string | null;
}

interface AuthState {
    accessToken: string | null;
    user: AuthUser | null;
    isAuthenticated: boolean;
    login: (token: string, user: AuthUser) => void;
    setAccessToken: (token: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    accessToken: null,
    user: null,
    isAuthenticated: false,

    login: (token, user) =>
        set({ accessToken: token, user, isAuthenticated: true }),

    setAccessToken: (token) =>
        set({ accessToken: token, isAuthenticated: true }),

    logout: () =>
        set({ accessToken: null, user: null, isAuthenticated: false }),
}));
