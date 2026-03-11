import { GoogleLogin } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useState } from "react";
import { Activity, Shield, Zap } from "lucide-react";
import { API_BASE } from "@/lib/axios";

export function LoginPage() {
    const navigate = useNavigate();
    const login = useAuthStore((s) => s.login);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSuccess(credentialResponse: CredentialResponse) {
        if (!credentialResponse.credential) return;
        setError(null);
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include", // receive httpOnly cookie
                body: JSON.stringify({ credential: credentialResponse.credential }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Unauthorized");

            login(data.accessToken, data.user);
            navigate("/", { replace: true });
        } catch (err: any) {
            setError(err.message || "Login failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {/* Animated background blobs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
            </div>

            <div className="glass w-full max-w-md p-8 rounded-2xl border border-white/10 shadow-2xl relative z-10">
                {/* Logo / Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 mb-4">
                        <Activity className="w-8 h-8 text-orange-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">PumpFun Bot</h1>
                    <p className="text-sm text-muted-foreground mt-1">Trading Dashboard — Acesso Restrito</p>
                </div>

                {/* Feature badges */}
                <div className="flex gap-2 justify-center mb-8">
                    {[
                        { icon: <Shield className="w-3 h-3" />, label: "Seguro" },
                        { icon: <Zap className="w-3 h-3" />, label: "Tempo Real" },
                        { icon: <Activity className="w-3 h-3" />, label: "24/7" },
                    ].map((f) => (
                        <span
                            key={f.label}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground"
                        >
                            {f.icon} {f.label}
                        </span>
                    ))}
                </div>

                {/* Google Login */}
                <div className="flex flex-col items-center gap-4">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                            Autenticando...
                        </div>
                    ) : (
                        <GoogleLogin
                            onSuccess={handleSuccess}
                            onError={() => setError("Falha ao conectar com o Google.")}
                            text="signin_with"
                            shape="rectangular"
                            theme="filled_black"
                            size="large"
                            width="320"
                        />
                    )}

                    {error && (
                        <div className="w-full text-center text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                            🚫 {error}
                        </div>
                    )}
                </div>

                <p className="text-center text-xs text-muted-foreground/50 mt-8">
                    Somente contas autorizadas têm acesso a este painel.
                </p>
            </div>
        </div>
    );
}
