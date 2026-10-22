import React, { useRef, useState } from "react";
import { api } from "../services/api";
import type { ReportSlot, Report } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { 
  FileSpreadsheet, Upload, Download, Trash2, Clock, 
  User, CheckCircle, AlertCircle, RefreshCw, FileText 
} from "lucide-react";

interface Props {
  slot: ReportSlot;
  wardId: number;
  onRefresh: () => void;
  onRequestReplace: (slot: ReportSlot, file: File) => void;
  onViewHistory: (report: Report) => void;
}

export const ReportUploadCard: React.FC<Props> = ({
  slot,
  wardId,
  onRefresh,
  onRequestReplace,
  onViewHistory,
}) => {
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input value so same file can be re-selected if needed
    e.target.value = "";
    setErrorMsg("");

    // If report already uploaded, trigger ConfirmReplaceDialog
    if (slot.is_uploaded && slot.current_report) {
      onRequestReplace(slot, file);
      return;
    }

    // Direct upload
    try {
      setUploading(true);
      await api.uploadReport(wardId, slot.category_key, file);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!slot.current_report) return;
    try {
      setDownloading(true);
      await api.downloadReport(slot.current_report.id, slot.current_report.original_filename);
    } catch (err: any) {
      setErrorMsg("Download failed. File may be unavailable on storage.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!slot.current_report) return;
    if (!window.confirm(`Are you sure you want to delete '${slot.current_report.original_filename}'?`)) {
      return;
    }
    try {
      setDeleting(true);
      await api.deleteReport(slot.current_report.id);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Failed to delete report");
    } finally {
      setDeleting(false);
    }
  };

  // Distinct styling based on category
  const getCategoryTheme = (key: string) => {
    switch (key) {
      case "lamp_installation":
        return {
          iconColor: "text-amber-500",
          bgColor: "bg-amber-50",
          borderColor: "border-amber-200",
          badgeColor: "bg-amber-100 text-amber-800",
        };
      case "pole_report":
        return {
          iconColor: "text-teal-600",
          bgColor: "bg-teal-50",
          borderColor: "border-teal-200",
          badgeColor: "bg-teal-100 text-teal-800",
        };
      case "commission_integrated":
        return {
          iconColor: "text-indigo-600",
          bgColor: "bg-indigo-50",
          borderColor: "border-indigo-200",
          badgeColor: "bg-indigo-100 text-indigo-800",
        };
      default:
        return {
          iconColor: "text-slate-600",
          bgColor: "bg-slate-50",
          borderColor: "border-slate-200",
          badgeColor: "bg-slate-100 text-slate-800",
        };
    }
  };

  const theme = getCategoryTheme(slot.category_key);
  const rep = slot.current_report;

  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between ${slot.is_uploaded ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50/40"}`}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        className="hidden"
      />

      <div>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${theme.bgColor} ${theme.borderColor} border`}>
              <FileSpreadsheet className={`w-6 h-6 ${theme.iconColor}`} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">{slot.display_title}</h3>
              <p className="text-[11px] text-slate-400 capitalize">{slot.category_key.replace("_", " ")}</p>
            </div>
          </div>

          <div>
            {slot.is_uploaded ? (
              <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500 border border-slate-200">
                Not uploaded yet
              </span>
            )}
          </div>
        </div>

        {/* Content details */}
        {slot.is_uploaded && rep ? (
          <div className="space-y-2 py-2 text-xs border-t border-slate-100 mt-2">
            <div className="flex items-center justify-between text-slate-700">
              <span className="text-slate-400">Filename:</span>
              <span className="font-medium truncate max-w-[200px] text-slate-900" title={rep.original_filename}>
                {rep.original_filename}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span className="text-slate-400">File Size:</span>
              <span className="font-mono text-slate-600">{formatFileSize(rep.file_size)}</span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span className="text-slate-400 flex items-center">
                <Clock className="w-3 h-3 mr-1 text-slate-400" /> Uploaded:
              </span>
              <span className="text-slate-600">{formatDate(rep.uploaded_at)}</span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span className="text-slate-400 flex items-center">
                <User className="w-3 h-3 mr-1 text-slate-400" /> Uploader:
              </span>
              <span className="text-slate-600 font-medium">{rep.uploader_name || "Admin"}</span>
            </div>

            {rep.versions_count > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">Version History:</span>
                <button
                  onClick={() => onViewHistory(rep)}
                  className="text-[11px] text-teal-700 font-medium hover:underline flex items-center"
                >
                  <RefreshCw className="w-2.5 h-2.5 mr-1" />
                  v{rep.versions_count} versions
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
            <p>No report uploaded for this category</p>
            <p className="text-[11px] text-slate-400/80 mt-0.5">Accepts .xlsx or .xls</p>
          </div>
        )}

        {errorMsg && (
          <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        {slot.is_uploaded && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? "Downloading..." : "Download"}</span>
          </button>
        )}

        {/* Upload / Replace (Admin only) */}
        {isAdmin && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition ${
              slot.is_uploaded
                ? "text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200"
                : "text-white bg-teal-600 hover:bg-teal-700 shadow-sm"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>
              {uploading
                ? "Processing..."
                : slot.is_uploaded
                ? "Replace"
                : "Upload"}
            </span>
          </button>
        )}

        {/* Delete button (Admin only) */}
        {isAdmin && slot.is_uploaded && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete Report"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
