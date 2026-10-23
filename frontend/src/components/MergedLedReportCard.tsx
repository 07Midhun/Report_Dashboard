import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import type { MergedLedSummaryResponse } from "../services/api";
import { 
  Download, Table, CheckCircle2, 
  AlertCircle, RefreshCw, Zap, ArrowRight 
} from "lucide-react";

interface Props {
  wardId: number;
  wardNumber: string;
  onOpenData: () => void;
  loadingData?: boolean;
}

export const MergedLedReportCard: React.FC<Props> = ({
  wardId,
  wardNumber,
  onOpenData,
  loadingData = false,
}) => {
  const [summary, setSummary] = useState<MergedLedSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchSummary = useCallback(async (force = false) => {
    try {
      if (force) setRegenerating(true);
      else setLoading(true);
      setErrorMsg("");
      const res = await api.getMergedLedSummary(wardId, force);
      setSummary(res);
    } catch (err: any) {
      console.error("Failed to fetch merged LED summary", err);
      setErrorMsg(err.response?.data?.detail || "Could not load Merged LED Report summary.");
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [wardId]);

  useEffect(() => {
    setSummary(null);
    setErrorMsg("");
    fetchSummary();
  }, [wardId, fetchSummary]);

  const handleDownload = async () => {
    if (!summary?.is_available) return;
    try {
      setDownloading(true);
      await api.downloadMergedLedReport(wardId, summary.filename);
    } catch (err) {
      alert("Failed to download Merged LED Report");
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const isAvailable = summary?.is_available === true && summary?.ward_id === wardId;

  return (
    <div className="bg-gradient-to-br from-white via-teal-50/20 to-emerald-50/30 rounded-2xl border-2 border-teal-500/30 shadow-md hover:shadow-lg transition overflow-hidden">
      {/* Top Banner Header */}
      <div className="p-5 border-b border-teal-100/80 bg-white/80 backdrop-blur-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
                Unified Special Report
              </span>
              <span className="text-xs text-slate-400 font-medium">|</span>
              <span className="text-xs font-bold text-slate-700">Ward {wardNumber}</span>
            </div>
            <h3 className="text-base font-extrabold text-slate-900 mt-0.5 flex items-center space-x-2">
              <span>Master Merged LED Report</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
              Complete Ward LED inventory: incorporates all retrofitted LED lamps from the Lamp Report plus surveyed existing LED poles extracted from the Pole Report.
            </p>
          </div>
        </div>

        {/* Right Status Badge & Refresh */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {loading ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              <RefreshCw className="w-3 h-3 animate-spin mr-1.5 text-teal-600" />
              Checking...
            </span>
          ) : isAvailable ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              Available ({summary?.total_merged_count?.toLocaleString()} Total LEDs)
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              Requires Lamp &amp; Pole Reports
            </span>
          )}

          <button
            onClick={() => fetchSummary(true)}
            disabled={loading || regenerating}
            title="Re-run merge algorithm and regenerate file"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-teal-700 transition shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin text-teal-600" : ""}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Tile 1: Base Lamp Report */}
          <div className="bg-white p-3.5 rounded-xl border border-teal-100 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              1. Installed Lamp Retrofits
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-black text-slate-800 font-mono">
                {summary?.lamp_rows_count !== null && summary?.lamp_rows_count !== undefined 
                  ? summary.lamp_rows_count.toLocaleString() 
                  : "..."}
              </span>
              <span className="text-xs text-slate-400 font-medium">poles</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Source: Lamp Installation Report</p>
          </div>

          {/* Tile 2: Extracted Pole Survey LEDs */}
          <div className="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-2xs">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
              2. Extracted Surveyed LEDs
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-black text-emerald-600 font-mono">
                + {summary?.pole_led_rows_count !== null && summary?.pole_led_rows_count !== undefined 
                    ? summary.pole_led_rows_count.toLocaleString() 
                    : "..."}
              </span>
              <span className="text-xs text-slate-400 font-medium">poles</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Source: Pole Report (Existing LED)</p>
          </div>

          {/* Tile 3: Master Total */}
          <div className="bg-gradient-to-r from-teal-700 to-emerald-700 text-white p-3.5 rounded-xl shadow-xs">
            <span className="text-[11px] font-bold text-teal-100 uppercase tracking-wider block">
              = Combined Master Total
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-2xl font-black text-white font-mono">
                {summary?.total_merged_count?.toLocaleString() || "0"}
              </span>
              <span className="text-xs text-teal-200 font-medium">Total LEDs</span>
            </div>
            <p className="text-[10px] text-teal-200/80 mt-1">100% Ward LED Coverage</p>
          </div>
        </div>

        {/* File Metadata Details */}
        {isAvailable && summary && (
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Merged Workbook:</span>
              <span className="font-mono text-slate-800 font-semibold">{summary.filename}</span>
              <span className="text-slate-300">&bull;</span>
              <span className="font-mono text-slate-600">{formatFileSize(summary.file_size)}</span>
            </div>
            <div>
              <span className="text-slate-400">Generated: </span>
              <span className="text-slate-700 font-medium">{formatDate(summary.generated_at)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Card Actions Footer */}
      <div className="px-5 py-3.5 bg-slate-50 border-t border-teal-100/80 flex flex-col sm:flex-row items-center justify-end gap-2.5">
        <button
          onClick={onOpenData}
          disabled={!isAvailable || loadingData}
          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs transition flex items-center justify-center space-x-2"
        >
          <Table className="w-4 h-4" />
          <span>{loadingData ? "Loading Table Data..." : "View Merged Report Data"}</span>
          <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
        </button>

        <button
          onClick={handleDownload}
          disabled={!isAvailable || downloading}
          className="w-full sm:w-auto px-4 py-2 rounded-xl border border-teal-600 bg-white hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed text-teal-800 text-xs font-bold transition flex items-center justify-center space-x-2"
        >
          <Download className="w-4 h-4 text-teal-600" />
          <span>{downloading ? "Downloading..." : "Download Merged Excel (.xlsx)"}</span>
        </button>
      </div>
    </div>
  );
};
