import React, { useState, useMemo } from "react";
import type { ReportDataResponse } from "../services/api";
import { 
  ArrowLeft, Download, Search, FileSpreadsheet, 
  ChevronLeft, ChevronRight, Filter, X, ChevronDown, 
  SlidersHorizontal, Check 
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

  // Column filter state
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeDropdownCol, setActiveDropdownCol] = useState<string | null>(null);
  const [columnSearchTerm, setColumnSearchTerm] = useState<Record<string, string>>({});

  // Precompute unique non-empty entities and counts for each column
  const columnEntitiesMap = useMemo(() => {
    if (!data.rows || !data.columns) return {};
    const map: Record<string, { value: string; count: number }[]> = {};

    data.columns.forEach((col) => {
      const counts: Record<string, number> = {};
      data.rows.forEach((row) => {
        const val = row[col];
        if (val !== null && val !== undefined) {
          const s = String(val).trim();
          if (s !== "" && s !== "null" && s !== "None") {
            // For multi-line values (like arms), split into distinct arm IDs
            if (s.includes("\n")) {
              s.split("\n").forEach((line) => {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                  counts[trimmedLine] = (counts[trimmedLine] || 0) + 1;
                }
              });
            } else {
              counts[s] = (counts[s] || 0) + 1;
            }
          }
        }
      });
      // Sort entities by frequency descending, then alphabetically
      const entities = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      map[col] = entities;
    });

    return map;
  }, [data.rows, data.columns]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    return Object.values(columnFilters).filter((v) => v && v !== "ALL").length;
  }, [columnFilters]);

  const handleClearAllFilters = () => {
    setColumnFilters({});
    setSearchTerm("");
    setCurrentPage(1);
  };

  const handleSetColumnFilter = (col: string, val: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!val || val === "ALL") {
        delete next[col];
      } else {
        next[col] = val;
      }
      return next;
    });
    setCurrentPage(1);
    setActiveDropdownCol(null);
  };

  // Filter rows across all columns based on search term AND column filters
  const filteredRows = useMemo(() => {
    if (!data.rows || data.rows.length === 0) return [];

    let result = data.rows;

    // Global search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((val) =>
          val !== null && val !== undefined && String(val).toLowerCase().includes(term)
        )
      );
    }

    // Individual column entity filters
    const activeCols = Object.entries(columnFilters).filter(([_, val]) => val && val !== "ALL");
    if (activeCols.length > 0) {
      result = result.filter((row) => {
        return activeCols.every(([col, selectedVal]) => {
          const rowVal = row[col];
          if (rowVal === null || rowVal === undefined) return false;
          const s = String(rowVal).trim();
          return s === selectedVal || s.includes(selectedVal);
        });
      });
    }

    return result;
  }, [data.rows, searchTerm, columnFilters]);

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
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition flex items-center space-x-1.5 text-xs font-semibold shadow-2xs cursor-pointer"
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
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Download className={`w-3.5 h-3.5 ${downloading ? "animate-bounce" : ""}`} />
              <span>{downloading ? "Downloading..." : "Download Original"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Card */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
        {/* Table Controls (Search, Column Filters Toggle & Page Size) */}
        <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Global Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search across all columns..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Column Filters Toggle Button */}
            <button
              type="button"
              onClick={() => setShowColumnFilters((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-2xs cursor-pointer ${
                showColumnFilters
                  ? "bg-teal-700 text-white border-teal-800"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="Toggle filter box for each and every column"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{showColumnFilters ? "Hide Column Filters" : "Add Column Filters"}</span>
              {activeFiltersCount > 0 && (
                <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  showColumnFilters ? "bg-white text-teal-800" : "bg-teal-600 text-white"
                }`}>
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Clear All Filters Button */}
            {(activeFiltersCount > 0 || searchTerm) && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
                title="Clear all active search and column filters"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ""}</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-600 w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-slate-500 font-mono text-[11px]">
              Showing <strong className="text-slate-800">{totalRows === 0 ? 0 : startIndex + 1}</strong> - <strong className="text-slate-800">{Math.min(startIndex + pageSize, totalRows)}</strong> of <strong className="text-slate-800">{totalRows.toLocaleString()}</strong>
              {totalRows !== (data.rows?.length || 0) && (
                <span className="text-teal-700 ml-1 font-semibold">
                  (Filtered from {data.rows?.length.toLocaleString()})
                </span>
              )}
            </span>
            <div className="flex items-center space-x-1">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="py-1 px-2 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Pills Bar */}
        {activeFiltersCount > 0 && (
          <div className="px-3 py-2 bg-teal-50/60 border-b border-teal-100 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-teal-900 font-bold text-[11px] flex items-center space-x-1 mr-1">
              <Filter className="w-3 h-3 text-teal-600" />
              <span>Active Filters:</span>
            </span>
            {Object.entries(columnFilters).map(([col, val]) => (
              <span
                key={col}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-white border border-teal-200 text-teal-900 text-[11px] shadow-2xs font-medium"
              >
                <span className="text-slate-500 font-normal">{col}:</span>
                <strong className="text-teal-800">{val}</strong>
                <button
                  type="button"
                  onClick={() => handleSetColumnFilter(col, "ALL")}
                  className="hover:text-rose-600 ml-0.5 cursor-pointer text-slate-400"
                  title="Remove this filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Tabular Data View */}
        <div className="flex-1 overflow-auto max-h-[580px]">
          {paginatedRows.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-2">
              <p className="font-semibold text-slate-600 text-sm">No matching records found.</p>
              <p>Try adjusting your search query or clearing column filters.</p>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="mt-2 inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear All Filters</span>
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-20 border-b border-slate-200 shadow-2xs">
                {/* Column Headers Row */}
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center text-slate-400 font-mono border-r border-slate-200 bg-slate-100">
                    #
                  </th>
                  {data.columns?.map((col) => (
                    <th
                      key={col}
                      className="py-2.5 px-3 font-semibold text-slate-700 border-r border-slate-200 whitespace-nowrap bg-slate-100"
                    >
                      <div className="flex items-center justify-between space-x-2">
                        <span>{col}</span>
                        {columnFilters[col] && columnFilters[col] !== "ALL" && (
                          <span className="w-2 h-2 rounded-full bg-teal-600 inline-block" title="Filtered column" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>

                {/* Filter Box Row: If filter is on, each and every column has a filter box showing the entities of that column */}
                {showColumnFilters && (
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-2 px-2 text-center border-r border-slate-200 bg-slate-100/60">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 mx-auto" />
                    </th>
                    {data.columns?.map((col) => {
                      const entities = columnEntitiesMap[col] || [];
                      const currentFilter = columnFilters[col];
                      const isFiltered = !!currentFilter && currentFilter !== "ALL";
                      const isOpen = activeDropdownCol === col;
                      const searchForCol = (columnSearchTerm[col] || "").toLowerCase();
                      const displayEntities = searchForCol
                        ? entities.filter((e) => e.value.toLowerCase().includes(searchForCol))
                        : entities;

                      return (
                        <th key={col} className="p-1.5 border-r border-slate-200 font-normal relative min-w-[150px] bg-slate-50">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveDropdownCol(isOpen ? null : col)}
                              className={`w-full flex items-center justify-between px-2 py-1 text-[11px] rounded-md border transition text-left cursor-pointer ${
                                isFiltered
                                  ? "bg-teal-50 border-teal-500 text-teal-900 font-bold shadow-2xs"
                                  : "bg-white border-slate-300 text-slate-600 hover:border-slate-400"
                              }`}
                              title={`Filter by ${col}`}
                            >
                              <span className="truncate max-w-[120px]">
                                {isFiltered ? currentFilter : `All (${entities.length})`}
                              </span>
                              <div className="flex items-center space-x-1 flex-shrink-0 ml-1">
                                {isFiltered && (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSetColumnFilter(col, "ALL");
                                    }}
                                    className="hover:text-rose-600 text-teal-700"
                                    title="Clear column filter"
                                  >
                                    <X className="w-3 h-3" />
                                  </span>
                                )}
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              </div>
                            </button>

                            {/* Dropdown Popover showing entities of this column */}
                            {isOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-30"
                                  onClick={() => setActiveDropdownCol(null)}
                                />
                                <div className="absolute left-0 mt-1 w-64 max-h-72 bg-white rounded-xl shadow-xl border border-slate-200 z-40 flex flex-col overflow-hidden text-xs">
                                  <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center space-x-1.5">
                                    <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                    <input
                                      type="text"
                                      placeholder={`Filter ${col} values...`}
                                      value={columnSearchTerm[col] || ""}
                                      onChange={(e) =>
                                        setColumnSearchTerm((prev) => ({ ...prev, [col]: e.target.value }))
                                      }
                                      className="w-full px-1.5 py-0.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                                      autoFocus
                                    />
                                  </div>
                                  <div className="overflow-y-auto max-h-56 py-1 divide-y divide-slate-50">
                                    <button
                                      type="button"
                                      onClick={() => handleSetColumnFilter(col, "ALL")}
                                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 flex items-center justify-between cursor-pointer ${
                                        !isFiltered ? "font-bold text-teal-800 bg-teal-50/70" : "text-slate-700"
                                      }`}
                                    >
                                      <span>(Show All)</span>
                                      <span className="text-slate-400 font-mono text-[10px]">
                                        {data.rows?.length || 0}
                                      </span>
                                    </button>

                                    {displayEntities.map((ent) => (
                                      <button
                                        key={ent.value}
                                        type="button"
                                        onClick={() => handleSetColumnFilter(col, ent.value)}
                                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 flex items-center justify-between transition cursor-pointer ${
                                          currentFilter === ent.value
                                            ? "font-bold text-teal-900 bg-teal-100/70"
                                            : "text-slate-700"
                                        }`}
                                      >
                                        <div className="flex items-center space-x-1.5 truncate pr-2">
                                          {currentFilter === ent.value && (
                                            <Check className="w-3 h-3 text-teal-700 flex-shrink-0" />
                                          )}
                                          <span className="truncate" title={ent.value}>
                                            {ent.value}
                                          </span>
                                        </div>
                                        <span className="text-slate-500 font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                          {ent.count}
                                        </span>
                                      </button>
                                    ))}

                                    {displayEntities.length === 0 && (
                                      <div className="p-3 text-center text-slate-400 text-[11px]">
                                        No entities match search
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                )}
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
                            className={`py-2 px-3 border-r border-slate-100 max-w-xs font-mono text-[11px] ${
                              val && String(val).includes("\n") ? "whitespace-pre-line" : "truncate"
                            }`}
                            title={val !== null && val !== undefined ? String(val) : ""}
                          >
                            {val !== null && val !== undefined ? (
                              String(val).includes("\n") ? (
                                <div className="space-y-1">
                                  {String(val).split("\n").map((line, lIdx) => (
                                    <div key={lIdx} className="font-semibold text-teal-900 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200/60 inline-block mr-1">
                                      {line}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                String(val)
                              )
                            ) : (
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
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="px-3 py-1 font-mono text-slate-700 font-semibold text-xs">
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
