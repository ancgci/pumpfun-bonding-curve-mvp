import axios from "axios";
import { useAuthStore } from "@/stores/authStore";

export const API_BASE = window.location.hostname === "localhost"
    ? "http://localhost:3001/api"
    : "/api";

const api = axios.create({
    withCredentials: true, // Send httpOnly refresh cookie on every request
});

// Attach access token to every request
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// On 401 → try refresh, then retry original request once
let isRefreshing = false;
let pendingQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;

        if (error.response?.status !== 401 || original._retry) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            // Queue request until refresh is done
            return new Promise((resolve) => {
                pendingQueue.push((token: string) => {
                    original.headers.Authorization = `Bearer ${token}`;
                    resolve(api(original));
                });
            });
        }

        original._retry = true;
        isRefreshing = true;

        try {
            const { data } = await axios.post(
                `${API_BASE}/auth/refresh`,
                {},
                { withCredentials: true }
            );
            const newToken: string = data.accessToken;
            useAuthStore.getState().setAccessToken(newToken);
            pendingQueue.forEach((cb) => cb(newToken));
            pendingQueue = [];
            original.headers.Authorization = `Bearer ${newToken}`;
            return api(original);
        } catch {
            // Refresh failed → logout
            useAuthStore.getState().logout();
            window.location.href = "/login";
            return Promise.reject(error);
        } finally {
            isRefreshing = false;
        }
    }
);

export default api;
