import React, { useState } from "react";
import type { ColumnMappingConfig } from "../services/api";
import { Settings2, X, Check } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (mappings: ColumnMappingConfig) => void;
  isLoading: boolean;
}

export const ColumnMappingDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  onApply,
  isLoading,
}) => {
  const [poleCol, setPoleCol] = useState("Pole Number");
  const [latCol, setLatCol] = useState("Latitude");
  const [lonCol, setLonCol] = useState("Longitude");
  const [statusCol, setStatusCol] = useState("Light Status");
  const [wattageCol, setWattageCol] = useState("Light Wattage");
  const [spCol, setSpCol] = useState("SP No");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      pole_number_col: poleCol.trim() || undefined,
      latitude_col: latCol.trim() || undefined,
      longitude_col: lonCol.trim() || undefined,
      status_col: statusCol.trim() || undefined,
      wattage_col: wattageCol.trim() || undefined,
      switchpoint_col: spCol.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2 text-slate-800">
            <Settings2 className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="font-semibold text-sm">Configure Excel Column Mapping</h3>
              <p className="text-[11px] text-slate-400">
                Override column names if your workbook headers differ from standard defaults
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Pole ID / Number Header</label>
                <input
                  type="text"
                  value={poleCol}
                  onChange={(e) => setPoleCol(e.target.value)}
                  placeholder="e.g. Pole Number or Pole No."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Connectivity / Light Status</label>
                <input
                  type="text"
                  value={statusCol}
                  onChange={(e) => setStatusCol(e.target.value)}
                  placeholder="e.g. Light Status or Status"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Latitude Header</label>
                <input
                  type="text"
                  value={latCol}
                  onChange={(e) => setLatCol(e.target.value)}
                  placeholder="e.g. Latitude or Lat"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Longitude Header</label>
                <input
                  type="text"
                  value={lonCol}
                  onChange={(e) => setLonCol(e.target.value)}
                  placeholder="e.g. Longitude or Long"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Wattage Header</label>
                <input
                  type="text"
                  value={wattageCol}
                  onChange={(e) => setWattageCol(e.target.value)}
                  placeholder="e.g. Light Wattage or Wattage"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Switchpoint Header</label>
                <input
                  type="text"
                  value={spCol}
                  onChange={(e) => setSpCol(e.target.value)}
                  placeholder="e.g. SP No or Switchpoint No."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic pt-1">
              Note: ANTIGRAVITY includes smart auto-detection for common naming variants. Custom entries here take immediate priority.
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-sm transition"
            >
              <Check className="w-4 h-4" />
              <span>{isLoading ? "Importing with Mappings..." : "Apply & Import"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
