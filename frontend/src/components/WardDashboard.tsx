import React, { useState, useEffect, useCallback } from "react";
import { useWard } from "../context/WardContext";
import { api } from "../services/api";
import type { WardReportSlotsResponse, ReportSlot, Report } from "../services/api";
import { Breadcrumb } from "./Breadcrumb";
import { ReportUploadCard } from "./ReportUploadCard";
import { ConfirmReplaceDialog } from "./ConfirmReplaceDialog";
import { ReportHistoryModal } from "./ReportHistoryModal";
import { PoleConnectivityMap } from "./PoleConnectivityMap";
import { MergedLedReportCard } from "./MergedLedReportCard";
import { ReportDataViewer } from "./ReportDataViewer";
import type { ReportDataResponse } from "../services/api";
import {
  Building2, FileSpreadsheet, RefreshCw,
  AlertCircle, ChevronRight
} from "lucide-react";

export const WardDashboard: React.FC = () => {
  const { selectedWard, selectedRegion, regions } = useWard();

  const [reportsData, setReportsData] = useState<WardReportSlotsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Viewing active merged report table state
  const [viewingMergedData, setViewingMergedData] = useState<ReportDataResponse | null>(null);
  const [loadingMergedData, setLoadingMergedData] = useState(false);

  // Replacement dialog states
  const [replaceTargetSlot, setReplaceTargetSlot] = useState<ReportSlot | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  // History modal states
  const [historyReport, setHistoryReport] = useState<Report | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Fetch reports for the selected ward
  const fetchReports = useCallback(async () => {
    if (!selectedWard) return;
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await api.getWardReports(selectedWard.id);
      setReportsData(res);
    } catch (err: any) {
      console.error("Failed to load reports", err);
      setErrorMsg(err.response?.data?.detail || "Failed to load ward reports");
    } finally {
      setLoading(false);
    }
  }, [selectedWard]);

  // When ward changes: clear previous ward's data and load fresh
  useEffect(() => {
    if (selectedWard) {
      // Clear previous ward's data while loading
      setReportsData(null);
      setViewingMergedData(null);
      fetchReports();
    } else {
      setReportsData(null);
      setViewingMergedData(null);
    }
  }, [selectedWard, fetchReports]);

  // Open merged report interactive table viewer
  const handleOpenMergedData = async () => {
    if (!selectedWard) return;
    try {
      setLoadingMergedData(true);
      const res = await api.getMergedLedData(selectedWard.id);
      setViewingMergedData(res);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to load Merged LED Report data.");
    } finally {
      setLoadingMergedData(false);
    }
  };

  // Handle replace request triggered from a card
  const handleRequestReplace = (slot: ReportSlot, file: File) => {
    setReplaceTargetSlot(slot);
    setPendingFile(file);
  };

  const handleConfirmReplace = async () => {
    if (!selectedWard || !replaceTargetSlot || !pendingFile) return;
    try {
      setReplacing(true);
      await api.replaceReport(selectedWard.id, replaceTargetSlot.category_key, pendingFile);
      setReplaceTargetSlot(null);
      setPendingFile(null);
      await fetchReports();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Replacement failed");
    } finally {
      setReplacing(false);
    }
  };

  const handleViewHistory = (report: Report) => {
    setHistoryReport(report);
    setShowHistoryModal(true);
  };

  // If viewing merged table data in full interactive viewer
  if (viewingMergedData) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
        <ReportDataViewer
          data={viewingMergedData}
          reportTitle="Master Merged LED Report"
          wardName={`Ward ${selectedWard?.ward_number || ""}`}
          wardCode={selectedWard?.ward_code || ""}
          onBack={() => setViewingMergedData(null)}
        />
      </div>
    );
  }

  // =========================================================================
  // MANDATORY BEHAVIOR: SELECT THE WARD FIRST
  // If no ward is selected, hide all ward-specific operations, reports, and map!
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
              Select a Ward to View Dashboard
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Please choose a region and ward from the <strong>Project Hierarchy</strong> on the left sidebar to access report management, uploaded Excel workbooks, and interactive pole connectivity mapping.
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
  // WARD IS SELECTED: RENDER WARD-SPECIFIC DASHBOARD
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
            <span>Refresh Ward Data</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Module 1: Report Management Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-600" />
              <span>Report Management</span>
            </h2>
            <p className="text-xs text-slate-500">
              Three required Excel reports for this ward: Lamp Installation, Pole Survey, and Commission Integrated
            </p>
          </div>

          <button
            onClick={() => {
              setHistoryReport(null);
              setShowHistoryModal(true);
            }}
            className="text-xs text-teal-700 hover:text-teal-900 font-medium hover:underline flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            <span>View All Ward Report History</span>
          </button>
        </div>

        {/* 3 Report Slots Grid (Untouched) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reportsData?.slots.map((slot) => (
            <ReportUploadCard
              key={slot.category_key}
              slot={slot}
              wardId={selectedWard.id}
              onRefresh={fetchReports}
              onRequestReplace={handleRequestReplace}
              onViewHistory={handleViewHistory}
            />
          ))}
        </div>

        {/* Master Merged LED Report Card (Separate Single Combined Report) */}
        <div className="pt-2">
          <MergedLedReportCard
            wardId={selectedWard.id}
            wardNumber={selectedWard.ward_number}
            onOpenData={handleOpenMergedData}
            loadingData={loadingMergedData}
          />
        </div>
      </section>

      {/* Module 2: Ward-Wise Pole Connectivity Map */}
      <section className="pt-2">
        <PoleConnectivityMap
          wardId={selectedWard.id}
          wardName={selectedWard.ward_name}
          wardCode={selectedWard.ward_code}
        />
      </section>

      {/* Confirmation Dialog for File Replacement */}
      <ConfirmReplaceDialog
        isOpen={replaceTargetSlot !== null}
        slot={replaceTargetSlot}
        newFile={pendingFile}
        onConfirm={handleConfirmReplace}
        onCancel={() => {
          setReplaceTargetSlot(null);
          setPendingFile(null);
        }}
        isLoading={replacing}
      />

      {/* Version History Modal */}
      <ReportHistoryModal
        isOpen={showHistoryModal}
        wardId={selectedWard.id}
        report={historyReport}
        onClose={() => setShowHistoryModal(false)}
      />
    </div>
  );
};
