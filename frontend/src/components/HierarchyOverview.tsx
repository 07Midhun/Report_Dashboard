import React, { useState, useEffect } from "react";
import { useWard } from "../context/WardContext";
import { api } from "../services/api";
import type { HierarchySummaryResponse } from "../services/api";
import { 
  Building2, Layers, MapPin, CheckCircle2, 
  ArrowRight, ChevronRight, RefreshCw, Zap, 
  ArrowLeft, BarChart3, AlertCircle 
} from "lucide-react";

export const HierarchyOverview: React.FC = () => {
  const { 
    regions, 
    selectedDivision, 
    selectedRegion, 
    selectDivision, 
    selectConstituency, 
    selectWard, 
    clearSelection 
  } = useWard();

  const [summaryData, setSummaryData] = useState<HierarchySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const data = await api.getHierarchySummary();
      setSummaryData(data);
    } catch (err: any) {
      console.error("Failed to load hierarchy summary", err);
      setErrorMsg(err.response?.data?.detail || "Could not load aggregate telemetry summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  // Compute fallback or live stats
  const totalZones = summaryData?.total_zones ?? 2;
  const totalConstituencies = summaryData?.total_constituencies ?? 7;
  const totalWards = summaryData?.total_wards ?? 57;

  // Active division data
  const divisionData = selectedDivision && summaryData?.divisions ? summaryData.divisions[selectedDivision] : null;

  // Active constituency data
  const constituencyData = selectedRegion && summaryData?.constituencies ? summaryData.constituencies[selectedRegion.region_name] : null;

  // =========================================================================
  // VIEW 1: CONSTITUENCY VIEW (e.g. Hebbal, PulakeshiNagar)
  // =========================================================================
  if (selectedRegion) {
    const parentDivision = selectedRegion.division || "East";
    const cLamps = constituencyData?.installed_lamps ?? 0;
    const cSurvey = constituencyData?.surveyed_leds ?? 0;
    const cTotal = constituencyData?.total_poles ?? (cLamps + cSurvey);
    const wardList = constituencyData?.wards ?? selectedRegion.wards.map((w) => ({
      id: w.id,
      ward_number: w.ward_number,
      ward_name: w.ward_name,
      ward_code: w.ward_code,
      active_reports_count: 0,
      installed_lamps: 0,
      surveyed_leds: 0,
      total_poles: 0,
      is_merged_available: false,
    }));

    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50">
        {/* Navigation Breadcrumb & Back action */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 text-xs text-slate-500 flex-wrap">
            <button 
              onClick={() => clearSelection()}
              className="hover:text-teal-700 font-semibold transition"
            >
              Bangalore (BBMP)
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <button 
              onClick={() => selectDivision(parentDivision)}
              className="hover:text-teal-700 font-semibold transition"
            >
              {parentDivision}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {selectedRegion.region_name}
            </span>
          </div>

          <button
            onClick={() => selectDivision(parentDivision)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to {parentDivision}</span>
          </button>
        </div>

        {/* Constituency Header */}
        <div className="bg-gradient-to-r from-[#004e5a] to-[#006373] text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-teal-300 text-teal-950 font-mono text-xs font-black uppercase">
                {selectedRegion.region_code}
              </span>
              <span className="text-xs text-teal-200">Constituency &bull; Division: {parentDivision}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {selectedRegion.region_name}
            </h1>
            <p className="text-xs text-teal-100/90 mt-1">
              Consolidated telemetry for all <strong>{selectedRegion.wards.length} wards</strong> in this constituency.
            </p>
          </div>

          <button
            onClick={fetchSummary}
            disabled={loading}
            className="self-start md:self-auto inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-teal-700/60 hover:bg-teal-700 text-white text-xs font-bold border border-teal-500/40 transition shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {/* 3 Metric Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Combined Master LEDs */}
          <div className="p-5 bg-white rounded-xl border-2 border-slate-800/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Combined Poles
              </span>
              <span className="p-1.5 bg-slate-100 text-slate-800 rounded-lg">
                <BarChart3 className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-slate-900 tracking-tight">
                {cTotal.toLocaleString()}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                Total LED inventory across {selectedRegion.wards.length} wards
              </p>
            </div>
          </div>

          {/* Card 2: Installed Lamp Retrofits */}
          <div className="p-5 bg-white rounded-xl border-2 border-cyan-500/30 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-800">
                Installed Lamp Reports
              </span>
              <span className="p-1.5 bg-cyan-50 text-cyan-700 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-cyan-900 tracking-tight">
                {cLamps.toLocaleString()}
              </span>
              <p className="text-xs text-cyan-700 mt-1">
                Retrofitted LED lamps from Lamp Reports
              </p>
            </div>
          </div>

          {/* Card 3: Extracted Surveyed LEDs */}
          <div className="p-5 bg-white rounded-xl border-2 border-emerald-500/30 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Extracted Surveyed LEDs
              </span>
              <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                <Zap className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-emerald-900 tracking-tight">
                {cSurvey.toLocaleString()}
              </span>
              <p className="text-xs text-emerald-700 mt-1">
                Surveyed LEDs (non-duplicate poles)
              </p>
            </div>
          </div>
        </div>

        {/* Wards Breakdown Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Wards in {selectedRegion.region_name} ({selectedRegion.wards.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any ward to inspect its uploaded reports, master merged ledger, and interactive GIS connectivity map.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Ward</th>
                  <th className="py-3 px-4">Ward Code</th>
                  <th className="py-3 px-4 text-right">Installed Lamps</th>
                  <th className="py-3 px-4 text-right">Surveyed LEDs</th>
                  <th className="py-3 px-4 text-right">Total Poles</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {wardList.map((w) => {
                  const matchingWardEntity = selectedRegion.wards.find((x) => x.id === w.id);
                  return (
                    <tr 
                      key={w.id} 
                      className="hover:bg-teal-50/40 transition cursor-pointer"
                      onClick={() => {
                        if (matchingWardEntity) {
                          selectWard(matchingWardEntity, selectedRegion);
                        }
                      }}
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        Ward {w.ward_number}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 font-semibold">
                        {w.ward_code}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-cyan-800 font-bold">
                        {w.installed_lamps > 0 ? w.installed_lamps.toLocaleString() : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-700 font-bold">
                        {w.surveyed_leds > 0 ? w.surveyed_leds.toLocaleString() : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-900 font-black">
                        {w.total_poles > 0 ? w.total_poles.toLocaleString() : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {w.is_merged_available ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Merged Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Ready
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition"
                        >
                          <span>Open Ward</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: REGION / DIVISION VIEW (e.g. East or Bommanahalli)
  // =========================================================================
  if (selectedDivision) {
    const dLamps = divisionData?.installed_lamps ?? 0;
    const dSurvey = divisionData?.surveyed_leds ?? 0;
    const dTotal = divisionData?.total_poles ?? (dLamps + dSurvey);
    const dConstituencyCount = divisionData?.total_constituencies ?? 0;
    const dWardCount = divisionData?.total_wards ?? 0;

    const constituenciesInDiv = regions.filter(
      (r) => (r.division || "East").toLowerCase() === selectedDivision.toLowerCase()
    );

    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50">
        {/* Navigation Breadcrumb & Back action */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <button 
              onClick={() => clearSelection()}
              className="hover:text-teal-700 font-semibold transition"
            >
              Bangalore (BBMP)
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {selectedDivision} Region
            </span>
          </div>

          <button
            onClick={() => clearSelection()}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Zones</span>
          </button>
        </div>

        {/* Division Header */}
        <div className="bg-gradient-to-r from-[#003842] via-[#004e5a] to-[#006373] text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-teal-300 text-teal-950 font-mono text-xs font-black uppercase">
                Zone / Region
              </span>
              <span className="text-xs text-teal-200">Bangalore (BBMP)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {selectedDivision} Region
            </h1>
            <p className="text-xs text-teal-100/90 mt-1">
              Consolidated telemetry across <strong>{dConstituencyCount} constituencies</strong> and <strong>{dWardCount} wards</strong>.
            </p>
          </div>

          <button
            onClick={fetchSummary}
            disabled={loading}
            className="self-start md:self-auto inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-teal-700/60 hover:bg-teal-700 text-white text-xs font-bold border border-teal-500/40 transition shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {/* 3 Metric Summary KPI Cards for Region */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Master Poles */}
          <div className="p-5 bg-white rounded-xl border-2 border-slate-800/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Region Poles
              </span>
              <span className="p-1.5 bg-slate-100 text-slate-800 rounded-lg">
                <BarChart3 className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-slate-900 tracking-tight">
                {dTotal.toLocaleString()}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                Combined inventory across {selectedDivision}
              </p>
            </div>
          </div>

          {/* Card 2: Installed Lamp Retrofits */}
          <div className="p-5 bg-white rounded-xl border-2 border-cyan-500/30 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-800">
                Installed Lamp Reports
              </span>
              <span className="p-1.5 bg-cyan-50 text-cyan-700 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-cyan-900 tracking-tight">
                {dLamps.toLocaleString()}
              </span>
              <p className="text-xs text-cyan-700 mt-1">
                Total retrofitted lamps in {selectedDivision}
              </p>
            </div>
          </div>

          {/* Card 3: Extracted Surveyed LEDs */}
          <div className="p-5 bg-white rounded-xl border-2 border-emerald-500/30 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Extracted Surveyed LEDs
              </span>
              <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                <Zap className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-emerald-900 tracking-tight">
                {dSurvey.toLocaleString()}
              </span>
              <p className="text-xs text-emerald-700 mt-1">
                Extracted surveyed LEDs (non-duplicate)
              </p>
            </div>
          </div>
        </div>

        {/* Constituencies Breakdown Grid */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Constituencies in {selectedDivision} ({constituenciesInDiv.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any constituency to view its breakdown of lamps, surveyed poles, and ward inventory.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {constituenciesInDiv.map((c) => {
              const cStats = summaryData?.constituencies ? summaryData.constituencies[c.region_name] : null;
              const lamps = cStats?.installed_lamps ?? 0;
              const survey = cStats?.surveyed_leds ?? 0;
              const total = cStats?.total_poles ?? (lamps + survey);

              return (
                <div
                  key={c.id}
                  onClick={() => selectConstituency(c)}
                  className="p-5 rounded-xl border-2 border-slate-200 hover:border-teal-500 bg-white hover:bg-teal-50/20 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-mono">
                        {c.region_code}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold font-mono">
                        {c.wards.length} Wards
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 mt-2">
                      {c.region_name}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Lamps</span>
                      <span className="text-sm font-bold font-mono text-cyan-800">
                        {lamps > 0 ? lamps.toLocaleString() : "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Survey</span>
                      <span className="text-sm font-bold font-mono text-emerald-700">
                        {survey > 0 ? survey.toLocaleString() : "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Total</span>
                      <span className="text-sm font-black font-mono text-slate-900">
                        {total > 0 ? total.toLocaleString() : "-"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end text-xs font-bold text-teal-700">
                    <span>View Constituency</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: HOME VIEW (2 Zones, 7 Constituencies, 57 Wards + Grand Totals)
  // =========================================================================
  const grandLamps = summaryData?.total_installed_lamps ?? 0;
  const grandSurvey = summaryData?.total_surveyed_leds ?? 0;
  const grandPoles = summaryData?.total_poles ?? (grandLamps + grandSurvey);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#003842] via-[#004e5a] to-[#006373] text-white p-6 sm:p-8 rounded-2xl shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-400/20 text-teal-200 border border-teal-300/30 text-xs font-bold uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5" />
            <span>Bangalore (BBMP) Streetlight Management System</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            Central Streetlight Telemetry &amp; LED Inventory
          </h1>
          <p className="text-xs sm:text-sm text-teal-100/90 leading-relaxed">
            Live consolidated dashboard covering both <strong>East</strong> and <strong>Bommanahalli</strong> zones, 
            tracking lamp retrofits and surveyed poles with automated comparison deduplication across all <strong>57 wards</strong>.
          </p>
        </div>

        <button
          onClick={fetchSummary}
          disabled={loading}
          className="self-start md:self-auto inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh All Stats</span>
        </button>
      </div>

      {/* Required Display: 2 Zones, 7 Constituencies, 57 Wards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: 2 Zones */}
        <div className="p-5 bg-white rounded-xl border-2 border-teal-500/40 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center flex-shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
              Configured Zones
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900">
                {totalZones}
              </span>
              <span className="text-xs font-semibold text-teal-700">
                Zones (Bommanahalli, East)
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: 7 Constituencies */}
        <div className="p-5 bg-white rounded-xl border-2 border-cyan-500/40 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-200 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
              Total Constituencies
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black font-mono text-cyan-900">
                {totalConstituencies}
              </span>
              <span className="text-xs font-semibold text-cyan-700">
                Constituencies
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: 57 Wards */}
        <div className="p-5 bg-white rounded-xl border-2 border-emerald-500/40 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
              Total Wards
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-900">
                {totalWards}
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                Wards (Including W75)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate Project Telemetry: Lamps, Surveyed, Combined Poles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Connected Poles */}
        <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl shadow-md">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
            Combined Master LEDs
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black font-mono tracking-tight">
              {grandPoles.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-slate-300">
              Total Connected Poles
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Full verified inventory across all BBMP wards
          </p>
        </div>

        {/* Total Installed Lamp Retrofits */}
        <div className="p-5 bg-gradient-to-br from-teal-800 to-cyan-800 text-white rounded-xl shadow-md">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-200 block">
            Installed Lamp Reports
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black font-mono tracking-tight">
              {grandLamps.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-cyan-200">
              Retrofitted Lamps
            </span>
          </div>
          <p className="text-[11px] text-cyan-200/80 mt-2">
            Poles connected via Lamp Installation Reports
          </p>
        </div>

        {/* Extracted Surveyed LEDs */}
        <div className="p-5 bg-gradient-to-br from-emerald-800 to-teal-800 text-white rounded-xl shadow-md">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-200 block">
            Extracted Surveyed LEDs
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black font-mono tracking-tight">
              {grandSurvey.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-emerald-200">
              Surveyed Existing LEDs
            </span>
          </div>
          <p className="text-[11px] text-emerald-200/80 mt-2">
            Poles extracted after comparison deduplication
          </p>
        </div>
      </div>

      {/* 2 Zones Overview Cards: East & Bommanahalli */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* East Zone Card */}
        <div
          onClick={() => selectDivision("East")}
          className="p-6 bg-white rounded-2xl border-2 border-teal-200 hover:border-teal-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
                E
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-teal-700 transition">
                  East Zone
                </h3>
                <span className="text-xs text-slate-500">
                  6 Constituencies &bull; 46 Wards (CVRN, HEB, PKN, SVN, STN, SJN)
                </span>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-1 transition" />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100 text-center">
            <div className="p-2.5 rounded-lg bg-slate-50">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Lamps</span>
              <span className="text-base font-bold font-mono text-cyan-800">
                {summaryData?.divisions?.["East"]?.installed_lamps?.toLocaleString() ?? "-"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Survey</span>
              <span className="text-base font-bold font-mono text-emerald-700">
                {summaryData?.divisions?.["East"]?.surveyed_leds?.toLocaleString() ?? "-"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total</span>
              <span className="text-base font-black font-mono text-slate-900">
                {summaryData?.divisions?.["East"]?.total_poles?.toLocaleString() ?? "-"}
              </span>
            </div>
          </div>
        </div>

        {/* Bommanahalli Zone Card */}
        <div
          onClick={() => selectDivision("Bommanahalli")}
          className="p-6 bg-white rounded-2xl border-2 border-teal-200 hover:border-teal-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-teal-800 text-white flex items-center justify-center font-bold">
                B
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-teal-700 transition">
                  Bommanahalli Zone
                </h3>
                <span className="text-xs text-slate-500">
                  1 Constituency &bull; 11 Wards (Bommanahalli-Z1)
                </span>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-1 transition" />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100 text-center">
            <div className="p-2.5 rounded-lg bg-slate-50">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Lamps</span>
              <span className="text-base font-bold font-mono text-cyan-800">
                {summaryData?.divisions?.["Bommanahalli"]?.installed_lamps?.toLocaleString() ?? "-"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Survey</span>
              <span className="text-base font-bold font-mono text-emerald-700">
                {summaryData?.divisions?.["Bommanahalli"]?.surveyed_leds?.toLocaleString() ?? "-"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total</span>
              <span className="text-base font-black font-mono text-slate-900">
                {summaryData?.divisions?.["Bommanahalli"]?.total_poles?.toLocaleString() ?? "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 7 Constituencies Quick-Access Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-4">
          <h2 className="text-lg font-black text-slate-900">
            BBMP Constituencies ({regions.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select a constituency to inspect total counts of lamps and poles presented.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {regions.map((reg) => {
            const cStats = summaryData?.constituencies ? summaryData.constituencies[reg.region_name] : null;
            const lamps = cStats?.installed_lamps ?? 0;
            const survey = cStats?.surveyed_leds ?? 0;
            const total = cStats?.total_poles ?? (lamps + survey);

            return (
              <button
                key={reg.id}
                type="button"
                onClick={() => selectConstituency(reg)}
                className="p-4 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 text-left transition-all cursor-pointer shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                      {reg.region_code}
                    </span>
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {reg.wards.length} Wards
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mt-2 truncate">
                    {reg.region_name}
                  </h4>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono font-bold">
                    {total > 0 ? `${total.toLocaleString()} poles` : "No reports"}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-teal-600" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
