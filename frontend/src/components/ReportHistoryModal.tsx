import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Report, ReportHistoryItem } from "../services/api";
import { History, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  wardId: number;
  report: Report | null;
  onClose: () => void;
}

export const ReportHistoryModal: React.FC<Props> = ({
  isOpen,
  wardId,
  report,
  onClose,
}) => {
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && wardId) {
      setLoading(true);
      api.getWardReportHistory(wardId)
        .then((items) => {
          // Filter to this report type if report is passed
          if (report) {
            setHistory(items.filter((it) => it.report_type === report.report_type));
          } else {
            setHistory(items);
          }
        })
        .catch((err) => console.error("Failed to load history", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, wardId, report]);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in duration-150 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2 text-slate-800">
            <History className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="font-semibold text-sm">Version History</h3>
              <p className="text-[11px] text-slate-400 capitalize">
                {report ? report.report_type.replace("_", " ") : "Ward Reports"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="p-5 flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-xs text-slate-400">Loading version records...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No version history records found.</div>
          ) : (
            <div className="space-y-2">
              {history.map((ver) => (
                <div
                  key={ver.version_id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50/20 transition text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] font-mono border border-slate-200">
                      v{ver.version_number}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 truncate max-w-sm" title={ver.original_filename}>
                        {ver.original_filename}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Uploaded by <strong className="text-slate-600">{ver.uploader_name || "Admin"}</strong> on {formatDate(ver.uploaded_at)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-slate-500 text-[11px]">
                      {formatFileSize(ver.file_size)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
