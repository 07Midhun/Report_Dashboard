import React from "react";
import type { ReportSlot } from "../services/api";
import { AlertTriangle, UploadCloud, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  slot: ReportSlot | null;
  newFile: File | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export const ConfirmReplaceDialog: React.FC<Props> = ({
  isOpen,
  slot,
  newFile,
  onConfirm,
  onCancel,
  isLoading,
}) => {
  if (!isOpen || !slot || !newFile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
          <div className="flex items-center space-x-2 text-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <h3 className="font-semibold text-sm">Replace Existing Report?</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 text-xs text-slate-600">
          <p>
            An active <strong>{slot.display_title}</strong> is already uploaded for this ward:
          </p>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Current file:</span>
              <span className="font-semibold text-slate-800 truncate max-w-[220px]" title={slot.current_report?.original_filename}>
                {slot.current_report?.original_filename}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Current Version:</span>
              <span className="font-mono text-slate-700">v{slot.current_report?.versions_count || 1}</span>
            </div>
          </div>

          <div className="p-3 bg-teal-50/70 rounded-lg border border-teal-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-teal-700 font-medium">New file to upload:</span>
              <span className="font-semibold text-teal-950 truncate max-w-[220px]" title={newFile.name}>
                {newFile.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-teal-700">New Version:</span>
              <span className="font-mono text-teal-900 font-bold">
                v{(slot.current_report?.versions_count || 1) + 1}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic">
            Safe replacement will preserve the previous file in version history for audit and compliance.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-sm transition"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{isLoading ? "Replacing..." : "Confirm & Replace"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
