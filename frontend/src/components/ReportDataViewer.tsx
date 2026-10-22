import React, { useState, useMemo } from "react";
import type { ReportDataResponse } from "../services/api";
import { 
  ArrowLeft, Download, Search, FileSpreadsheet, 
  ChevronLeft, ChevronRight 
} from "lucide-react";
import { api } from "../services/api";

interface Props {
  data: ReportDataResponse;
  reportTitle: string;
  wardName: string;
  wardCode: string;
  onBack: () => void;
}

export const ReportDataViewer: React.FC<Props> = ({
  data,
  reportTitle,
  wardName,
  wardCode,
  onBack,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [downloading, setDownloading] = useState(false);

  // Filter rows across all columns based on search term
  const filteredRows = useMemo(() => {
    if (!data.rows || data.rows.length === 0) return [];
    if (!searchTerm.trim()) return data.rows;

    const term = searchTerm.toLowerCase();
    return data.rows.filter((row) =>
      Object.values(row).some((val) =>
        val !== null && val !== undefined && String(val).toLowerCase().includes(term)
      )
    );
  }, [data.rows, searchTerm]);

  // Pagination calculation
  const totalRows = filteredRows.length;
  const totalPages = Math.ceil(totalRows / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize);

  const handleDownload = async () => {
    if (!data.report_id) return;
    try {
      setDownloading(true);
      await api.downloadReport(data.report_id, data.original_filename || `${reportTitle}.xlsx`);
    } catch (err) {
      alert("Failed to download report file");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 space-y-4">
      {/* Top Navigation & Metadata Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition flex items-center space-x-1.5 text-xs font-semibold shadow-2xs"
            title="Back to Reports"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Reports</span>
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-mono text-[11px] font-bold">
                {wardCode}
              </span>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs font-medium text-slate-500">{wardName}</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5 flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-600" />
              <span>{reportTitle}</span>
            </h1>
          </div>
        </div>

        {/* Right side report badges & action */}
        <div className="flex flex-wrap items-center gap-2">
          {data.version_number && (
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold font-mono">
              Version {data.version_number}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold font-mono">
            {data.total_rows?.toLocaleString()} Total Rows
          </span>
          {data.report_id && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition"
            >
              <Download className={`w-3.5 h-3.5 ${downloading ? "animate-bounce" : ""}`} />
              <span>{downloading ? "Downloading..." : "Download Original"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Card */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
        {/* Table Controls (Search & Page Size) */}
        <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search in all columns..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-600 w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-slate-400 font-mono text-[11px]">
              Showing {startIndex + 1} - {Math.min(startIndex + pageSize, totalRows)} of {totalRows}
            </span>
            <div className="flex items-center space-x-1">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="py-1 px-2 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabular Data View */}
        <div className="flex-1 overflow-auto max-h-[550px]">
          {paginatedRows.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No matching records found in this report.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center text-slate-400 font-mono border-r border-slate-200">
                    #
                  </th>
                  {data.columns?.map((col) => (
                    <th
                      key={col}
                      className="py-2.5 px-3 font-semibold text-slate-700 border-r border-slate-200 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {paginatedRows.map((row, idx) => {
                  const rowNumber = startIndex + idx + 1;
                  return (
                    <tr
                      key={rowNumber}
                      className="hover:bg-teal-50/40 transition-colors odd:bg-white even:bg-slate-50/30"
                    >
                      <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                        {rowNumber}
                      </td>
                      {data.columns?.map((col) => {
                        const val = row[col];
                        return (
                          <td
                            key={col}
                            className="py-2 px-3 border-r border-slate-100 max-w-xs truncate font-mono text-[11px]"
                            title={val !== null && val !== undefined ? String(val) : ""}
                          >
                            {val !== null && val !== undefined ? String(val) : (
                              <span className="text-slate-300 italic">null</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
          <span className="text-slate-500 text-[11px]">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="px-3 py-1 font-mono text-slate-700 font-semibold text-xs">
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
