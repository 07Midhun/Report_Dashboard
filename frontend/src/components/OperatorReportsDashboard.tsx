import React, { useState, useEffect, useCallback } from "react";
import { useWard } from "../context/WardContext";
import { Breadcrumb } from "./Breadcrumb";
import { ReportDataViewer } from "./ReportDataViewer";
import { PoleConnectivityMap } from "./PoleConnectivityMap";
import { MergedLedReportCard } from "./MergedLedReportCard";
import { api } from "../services/api";
import type { 
  WardReportSlotsResponse, 
  ReportSlot, 
  ReportDataResponse 
} from "../services/api";
import { 
  FileSpreadsheet, Download, Table, CheckCircle, 
  AlertCircle, RefreshCw, Building2, ChevronRight, ArrowRight 
} from "lucide-react";

export const OperatorReportsDashboard: React.FC = () => {
  const { 
    selectedWard, 
    selectedRegion, 
    regions 
  } = useWard();

  const [reportsData, setReportsData] = useState<WardReportSlotsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Viewing active report data table
  const [viewingCategory, setViewingCategory] = useState<string | null>(null);
  const [activeReportData, setActiveReportData] = useState<ReportDataResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [downloadingSlotKey, setDownloadingSlotKey] = useState<string | null>(null);

  // Fetch slot status for the selected ward
  const fetchReports = useCallback(async () => {
    if (!selectedWard) return;
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await api.getWardReports(selectedWard.id);
      setReportsData(res);
    } catch (err: any) {
      console.error("Failed to fetch reports", err);
      setErrorMsg(err.response?.data?.detail || "Failed to load reports for the selected ward.");
    } finally {
      setLoading(false);
    }
  }, [selectedWard]);

  useEffect(() => {
    if (selectedWard) {
      setReportsData(null);
      setViewingCategory(null);
      setActiveReportData(null);
      fetchReports();
    } else {
      setReportsData(null);
      setViewingCategory(null);
      setActiveReportData(null);
    }
  }, [selectedWard, fetchReports]);

  // Open actual uploaded tabular report data (Read-only view)
  const handleOpenReport = async (slot: ReportSlot) => {
    if (!selectedWard) return;
    if (!slot.is_uploaded) {
      alert(`No ${slot.display_title} has been uploaded for ward ${selectedWard.ward_number} yet.`);
      return;
    }

    try {
      setLoadingData(true);
      setViewingCategory(slot.category_key);
      const res = await api.getWardReportData(selectedWard.id, slot.category_key);
      setActiveReportData(res);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to load report data.");
      setViewingCategory(null);
    } finally {
      setLoadingData(false);
    }
  };

  // Open merged master LED report interactive table viewer
  const handleOpenMergedData = async () => {
    if (!selectedWard) return;
    try {
      setLoadingData(true);
      setViewingCategory("merged_led_report");
      const res = await api.getMergedLedData(selectedWard.id);
      setActiveReportData(res);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to load Merged LED Report data.");
      setViewingCategory(null);
    } finally {
      setLoadingData(false);
    }
  };

  const handleDownload = async (slot: ReportSlot) => {
    if (!slot.current_report) return;
    try {
      setDownloadingSlotKey(slot.category_key);
      await api.downloadReport(slot.current_report.id, slot.current_report.original_filename);
    } catch (err) {
      alert("Failed to download file");
    } finally {
      setDownloadingSlotKey(null);
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
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // If currently viewing active report data table
  if (viewingCategory && activeReportData) {
    const isMerged = viewingCategory === "merged_led_report";
    const slot = reportsData?.slots.find((s) => s.category_key === viewingCategory);
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
        <ReportDataViewer
          data={activeReportData}
          reportTitle={isMerged ? "Master Merged LED Report" : (slot?.display_title || "Report Viewer")}
          wardName={`Ward ${selectedWard?.ward_number || ""}`}
          wardCode={selectedWard?.ward_code || ""}
          onBack={() => {
            setViewingCategory(null);
            setActiveReportData(null);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // MANDATORY BEHAVIOR: SELECT THE WARD FIRST FROM SIDEBAR
  // =========================================================================
  if (!selectedWard) {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-50 flex items-center justify-center">
        <div className="max-w-xl w-full text-center space-y-6 bg-white p-8 md:p-12 rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto text-teal-600 shadow-xs">
            <Building2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">
              Select a Ward to View Reports &amp; Poles
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Please choose a region and ward from the left sidebar to access uploaded Excel reports and interactive pole connectivity mapping.
            </p>
          </div>

          {/* Quick stats on available hierarchy */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 text-left">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-400 font-medium block">Configured Zones</span>
              <span className="text-lg font-bold text-slate-700 font-mono">
                {regions.length} Zones
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-400 font-medium block">Total Available Wards</span>
              <span className="text-lg font-bold text-teal-700 font-mono">
                {regions.reduce((acc, r) => acc + r.wards.length, 0)} Wards
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-1 text-xs text-teal-700 font-medium pt-2">
            <span>Expand a region in the sidebar</span>
            <ChevronRight className="w-4 h-4" />
            <span>Select a ward</span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // WARD IS SELECTED: RENDER OPERATOR READ-ONLY VIEW
  // =========================================================================
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50">
      {/* Breadcrumb Navigation */}
      <Breadcrumb />

      {/* Ward Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-mono text-xs font-bold uppercase tracking-wider">
              {selectedWard.ward_code}
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs font-medium text-slate-500">
              {selectedRegion?.region_name}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
            Ward {selectedWard.ward_number}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ward Number: <strong>{selectedWard.ward_number}</strong> &bull; Region Code: <strong>{selectedRegion?.region_code}</strong>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchReports()}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-teal-600" : ""}`} />
            <span>Refresh Reports</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Module 1: Report Viewing Section (Read-Only) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-teal-600" />
            <span>Uploaded Reports</span>
          </h2>
          <p className="text-xs text-slate-500">
            View tabular data or download original Excel reports uploaded for this ward
          </p>
        </div>

        {/* 3 Report Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {reportsData?.slots.map((slot) => {
            const isUploaded = slot.is_uploaded;
            const report = slot.current_report;

            return (
              <div
                key={slot.category_key}
                className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-md transition flex flex-col justify-between overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-5 border-b border-slate-100">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isUploaded ? "bg-teal-50 text-teal-600 border border-teal-200" : "bg-slate-100 text-slate-400 border border-slate-200"
                      }`}>
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {slot.display_title}
                        </h3>
                        <span className="text-[11px] text-slate-400 capitalize">
                          {slot.category_key.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {isUploaded ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" />
                        Uploaded (v{report?.versions_count || 1})
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                        Not Uploaded
                      </span>
                    )}
                  </div>

                  {/* Metadata details */}
                  {isUploaded && report ? (
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">File Name:</span>
                        <span className="font-mono text-[11px] font-semibold text-slate-800 truncate max-w-[170px]" title={report.original_filename}>
                          {report.original_filename}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">File Size:</span>
                        <span className="font-mono text-[11px] text-slate-700">
                          {formatFileSize(report.file_size)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Last Uploaded:</span>
                        <span className="text-[11px] text-slate-700">
                          {formatDate(report.updated_at)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 italic">
                      No Excel report has been uploaded for this category yet.
                    </div>
                  )}
                </div>

                {/* Card Actions (Strictly Read-Only: View and Download) */}
                <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenReport(slot)}
                    disabled={!isUploaded || loadingData}
                    className="flex-1 py-2 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition flex items-center justify-center space-x-1.5"
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>{loadingData && viewingCategory === slot.category_key ? "Loading Data..." : "View Report Data"}</span>
                    <ArrowRight className="w-3 h-3 ml-0.5" />
                  </button>

                  {isUploaded && (
                    <button
                      onClick={() => handleDownload(slot)}
                      disabled={downloadingSlotKey === slot.category_key}
                      title="Download Original Excel File"
                      className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Master Merged LED Report Card (Separate Single Combined Report) */}
        <div className="pt-2">
          <MergedLedReportCard
            wardId={selectedWard.id}
            wardNumber={selectedWard.ward_number}
            onOpenData={handleOpenMergedData}
            loadingData={loadingData && viewingCategory === "merged_led_report"}
          />
        </div>
      </section>

      {/* Module 2: Interactive Pole Connectivity Map (Read-Only) */}
      <section className="pt-2">
        <PoleConnectivityMap
          wardId={selectedWard.id}
          wardName={selectedWard.ward_name}
          wardCode={selectedWard.ward_code}
        />
      </section>
    </div>
  );
};
