import { create } from "zustand";

interface AuthState {
    accessToken: string | null;
    user: { email: string; name: string; picture: string } | null;
    isAuthenticated: boolean;
    login: (token: string, user: AuthState["user"]) => void;
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
