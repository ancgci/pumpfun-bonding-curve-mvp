import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { AlertTriangle, BrainCircuit, ClipboardList, Sparkles } from "lucide-react";

interface RootCauseSummary {
  code?: string;
  label?: string;
  count?: number;
}

interface PostMortemSummaryShape {
  eligibleTrades?: number;
  pending?: number;
  processing?: number;
  done?: number;
  failed?: number;
  anomalousEligible?: number;
  lastAnalyzedAt?: number | null;
  rootCauses?: RootCauseSummary[];
}

interface PostMortemReportShape {
  summary?: string | null;
  recommendations?: string[];
  rootCause?: {
    code?: string;
    label?: string;
    confidence?: number;
  } | null;
}

interface PostMortemTradeShape {
  tokenSymbol?: string | null;
  tokenMint?: string | null;
  anomalyFlag?: boolean;
  postMortemStatus?: string | null;
  postMortemSummary?: string | null;
  postMortemAnalyzedAt?: number | null;
  postMortemReport?: PostMortemReportShape | null;
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value: unknown): string {
  const ts = asFiniteNumber(value);
  if (!(ts && ts > 0)) return "--";

  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatConfidence(value: unknown): string | null {
  const confidence = asFiniteNumber(value);
  if (confidence === null) return null;
  return `${confidence.toFixed(0)}%`;
}

function getStatusTone(status: string) {
  switch (status) {
    case "DONE":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "PROCESSING":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "FAILED":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "PENDING":
    default:
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }
}

export function PostMortemInsights() {
  const { postMortemSummary, postMortems } = useDashboardData();

  const summary = (postMortemSummary || {}) as PostMortemSummaryShape;
  const recentAutopsies = Array.isArray(postMortems) ? (postMortems as PostMortemTradeShape[]) : [];

  const pending = Number(summary.pending || 0);
  const processing = Number(summary.processing || 0);
  const backlog = pending + processing;
  const done = Number(summary.done || 0);
  const failed = Number(summary.failed || 0);
  const anomalous = Number(summary.anomalousEligible || 0);
  const rootCauses = Array.isArray(summary.rootCauses) ? summary.rootCauses.slice(0, 4) : [];

  if (!postMortemSummary && recentAutopsies.length === 0) {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/5 p-6 text-sm text-muted-foreground">
        Carregando fila de post-mortem...
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-200/80">Backlog</div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-100">{backlog}</div>
          <div className="mt-1 text-xs text-amber-200/70">
            {pending} pending · {processing} processing
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/80">Done</div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-100">{done}</div>
          <div className="mt-1 text-xs text-emerald-200/70">
            elegiveis {Number(summary.eligibleTrades || 0)}
          </div>
        </div>
        <div className="rounded-2xl border border-rose-500/15 bg-rose-500/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-rose-200/80">Failed</div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-100">{failed}</div>
          <div className="mt-1 text-xs text-rose-200/70">
            revisar retries e prompt
          </div>
        </div>
        <div className="rounded-2xl border border-sky-500/15 bg-sky-500/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-sky-200/80">Anomaly Cases</div>
          <div className="mt-2 font-mono text-2xl font-bold text-sky-100">{anomalous}</div>
          <div className="mt-1 text-xs text-sky-200/70">
            ultimo {formatTimestamp(summary.lastAnalyzedAt)}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/8 bg-white/5 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Root Causes</p>
            <p className="text-sm text-foreground font-medium">
              Causas-raiz mais frequentes nas autopsias recentes
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {Number(summary.eligibleTrades || 0)} trades elegiveis
          </div>
        </div>

        {rootCauses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {rootCauses.map((item, index) => (
              <div
                key={`${item.code || item.label || "unknown"}-${index}`}
                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs"
              >
                <div className="font-semibold text-foreground">{item.label || item.code || "Unknown"}</div>
                <div className="mt-1 text-muted-foreground">
                  {(item.code || "UNCLASSIFIED").toUpperCase()} · {Number(item.count || 0)}x
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
            Nenhuma causa-raiz consolidada ainda.
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-white/8 bg-white/5 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Recent Autopsies</p>
            <p className="text-sm text-foreground font-medium">
              Relatorios concluídos prontos para revisão
            </p>
          </div>
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
        </div>

        {recentAutopsies.length > 0 ? (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
            {recentAutopsies.map((trade, index) => {
              const status = String(trade.postMortemStatus || "DONE").toUpperCase();
              const report = trade.postMortemReport || null;
              const rootCauseLabel = report?.rootCause?.label || report?.rootCause?.code || "Unknown";
              const rootCauseCode = report?.rootCause?.code || "UNCLASSIFIED";
              const confidence = formatConfidence(report?.rootCause?.confidence);
              const summaryText = trade.postMortemSummary || report?.summary || "No summary available.";
              const recommendation = Array.isArray(report?.recommendations) ? report.recommendations[0] : null;
              const label = trade.tokenSymbol || trade.tokenMint || `Trade ${index + 1}`;

              return (
                <article
                  key={`${trade.tokenMint || trade.tokenSymbol || "postmortem"}-${index}`}
                  className="rounded-2xl border border-white/8 bg-black/20 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{label}</span>
                        <Badge className={getStatusTone(status)}>{status}</Badge>
                        {trade.anomalyFlag ? (
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            ANOMALY
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BrainCircuit className="w-3 h-3" />
                          {rootCauseLabel}
                        </span>
                        <span>{String(rootCauseCode).toUpperCase()}</span>
                        {confidence ? <span>confidence {confidence}</span> : null}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimestamp(trade.postMortemAnalyzedAt)}
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-gray-200">{summaryText}</p>

                  {recommendation ? (
                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
                      <span className="mr-2 inline-flex items-center gap-1 font-semibold text-indigo-200">
                        <Sparkles className="w-3 h-3" />
                        Next action
                      </span>
                      {recommendation}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
            Nenhuma autopsia concluida ainda.
          </div>
        )}
      </div>
    </section>
  );
}
