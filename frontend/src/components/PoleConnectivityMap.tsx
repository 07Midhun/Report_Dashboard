import React, { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { api } from "../services/api";
import type { Pole, PoleSummary, ColumnMappingConfig } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { 
  MapPin, RefreshCw, AlertCircle, Settings, CheckCircle2, Zap, Layers 
} from "lucide-react";
import { ColumnMappingDialog } from "./ColumnMappingDialog";

// Helper component to center map when ward coordinates change
const MapRecenter: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

// Create custom leaflet div icons based on source
const createCustomMarkerIcon = (source?: string) => {
  let colorClass = "bg-teal-600";
  if (source === "extracted_survey") {
    colorClass = "bg-emerald-500";
  } else if (source === "installed_lamp") {
    colorClass = "bg-cyan-600";
  }

  return L.divIcon({
    className: "custom-leaflet-pin",
    html: `<div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.4);" class="${colorClass}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
};

interface Props {
  wardId: number;
  wardName: string;
  wardCode: string;
}

export const PoleConnectivityMap: React.FC<Props> = ({
  wardId,
  wardName,
  wardCode,
}) => {
  const { isAdmin } = useAuth();

  const [poles, setPoles] = useState<Pole[]>([]);
  const [summary, setSummary] = useState<PoleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "installed_lamp" | "extracted_survey">("all");
  const [errorMsg, setErrorMsg] = useState("");
  const [showMappingDialog, setShowMappingDialog] = useState(false);

  const fetchPoleData = async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      const [polesData, summaryData] = await Promise.all([
        api.getWardPoles(wardId),
        api.getWardPoleSummary(wardId),
      ]);

      setPoles(polesData);
      setSummary(summaryData);
    } catch (err: any) {
      console.error("Error fetching pole data", err);
      setErrorMsg(err.response?.data?.detail || "Failed to load pole coordinates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSourceFilter("all");
    fetchPoleData();
  }, [wardId]);

  const handleImportRefresh = async (customMappings?: ColumnMappingConfig) => {
    try {
      setRefreshing(true);
      setErrorMsg("");
      await api.importPoles(wardId, undefined, customMappings);
      setShowMappingDialog(false);
      await fetchPoleData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Import/refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // Filter poles for rendering (only valid coordinates)
  const validPoles = useMemo(() => {
    return poles.filter(
      (p) =>
        p.latitude !== 0 &&
        p.longitude !== 0 &&
        p.latitude >= -90 &&
        p.latitude <= 90 &&
        p.longitude >= -180 &&
        p.longitude <= 180
    );
  }, [poles]);

  // Determine filtered poles to display based on selected filter
  const displayPoles = useMemo(() => {
    if (sourceFilter === "installed_lamp") {
      return validPoles.filter((p) => p.source === "installed_lamp");
    }
    if (sourceFilter === "extracted_survey") {
      return validPoles.filter((p) => p.source === "extracted_survey");
    }
    return validPoles;
  }, [validPoles, sourceFilter]);

  // Counts for each source category
  const lampCount = useMemo(() => {
    if (summary && summary.installed_lamp_count !== undefined && summary.installed_lamp_count > 0) {
      return summary.installed_lamp_count;
    }
    return validPoles.filter((p) => p.source === "installed_lamp").length;
  }, [summary, validPoles]);

  const surveyCount = useMemo(() => {
    if (summary && summary.extracted_survey_count !== undefined && summary.extracted_survey_count > 0) {
      return summary.extracted_survey_count;
    }
    return validPoles.filter((p) => p.source === "extracted_survey").length;
  }, [summary, validPoles]);

  const totalCount = useMemo(() => {
    if (summary && summary.total_poles !== undefined && summary.total_poles > 0) {
      return summary.total_poles;
    }
    return validPoles.length;
  }, [summary, validPoles]);

  // Determine map center
  const centerCoord: [number, number] = useMemo(() => {
    if (summary?.center_latitude && summary?.center_longitude) {
      return [summary.center_latitude, summary.center_longitude];
    }
    if (displayPoles.length > 0) {
      return [displayPoles[0].latitude, displayPoles[0].longitude];
    }
    if (validPoles.length > 0) {
      return [validPoles[0].latitude, validPoles[0].longitude];
    }
    // Default fallback Bangalore region
    return [13.0375, 77.6042];
  }, [summary, displayPoles, validPoles]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Map Header */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-800">
                Pole Connectivity Map — {wardName}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Interactive geographic distribution and connection telemetry. Click any category card to filter poles on the map.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowMappingDialog(true)}
                  disabled={refreshing}
                  title="Configure Column Mappings"
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium transition shadow-2xs"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden md:inline">Map Columns</span>
                </button>

                <button
                  onClick={() => handleImportRefresh()}
                  disabled={refreshing}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-sm transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  <span>{refreshing ? "Refreshing..." : "Import / Refresh Poles"}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 3 Interactive Filter Cards: Total Poles, Installed Lamp Reports, Extracted Surveyed LEDs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Filter Card 1: Total Poles */}
          <button
            type="button"
            onClick={() => setSourceFilter("all")}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer shadow-sm relative overflow-hidden flex flex-col justify-between ${
              sourceFilter === "all"
                ? "border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md ring-2 ring-slate-800"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                sourceFilter === "all" ? "text-slate-200" : "text-slate-500"
              }`}>
                Total Poles
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                sourceFilter === "all" 
                  ? "bg-white text-slate-900" 
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}>
                {sourceFilter === "all" ? "Active (All Connected)" : "Click to view all"}
              </span>
            </div>

            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-2xl font-black font-mono tracking-tight">
                {totalCount.toLocaleString()}
              </span>
              <span className={`text-xs font-medium ${
                sourceFilter === "all" ? "text-slate-300" : "text-slate-500"
              }`}>
                Total Connected Poles
              </span>
            </div>

            <p className={`text-[10px] mt-1.5 flex items-center space-x-1 ${
              sourceFilter === "all" ? "text-slate-300" : "text-slate-400"
            }`}>
              <Layers className="w-3 h-3 flex-shrink-0" />
              <span>Full inventory: Combined Retrofits + Surveyed LEDs</span>
            </p>
          </button>

          {/* Filter Card 2: Installed Lamp Reports */}
          <button
            type="button"
            onClick={() => setSourceFilter("installed_lamp")}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer shadow-sm relative overflow-hidden flex flex-col justify-between ${
              sourceFilter === "installed_lamp"
                ? "border-cyan-600 bg-gradient-to-br from-teal-800 to-cyan-800 text-white shadow-md ring-2 ring-cyan-500"
                : "border-cyan-100 bg-white text-slate-800 hover:border-cyan-400 hover:bg-cyan-50/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                sourceFilter === "installed_lamp" ? "text-cyan-100" : "text-cyan-800"
              }`}>
                Installed Lamp Reports
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                sourceFilter === "installed_lamp" 
                  ? "bg-white text-cyan-900 shadow-2xs" 
                  : "bg-cyan-50 text-cyan-800 border border-cyan-200"
              }`}>
                {sourceFilter === "installed_lamp" ? "Active (Alone)" : "Touch to filter alone"}
              </span>
            </div>

            <div className="flex items-baseline space-x-2 mt-2">
              <span className={`text-2xl font-black font-mono tracking-tight ${
                sourceFilter === "installed_lamp" ? "text-white" : "text-cyan-900"
              }`}>
                {lampCount.toLocaleString()}
              </span>
              <span className={`text-xs font-medium ${
                sourceFilter === "installed_lamp" ? "text-cyan-100" : "text-cyan-700"
              }`}>
                Poles Connected Alone
              </span>
            </div>

            <p className={`text-[10px] mt-1.5 flex items-center space-x-1 ${
              sourceFilter === "installed_lamp" ? "text-cyan-200" : "text-cyan-600"
            }`}>
              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
              <span>Source: Lamp Installation Report (Retrofits)</span>
            </p>
          </button>

          {/* Filter Card 3: Extracted Surveyed LEDs */}
          <button
            type="button"
            onClick={() => setSourceFilter("extracted_survey")}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer shadow-sm relative overflow-hidden flex flex-col justify-between ${
              sourceFilter === "extracted_survey"
                ? "border-emerald-600 bg-gradient-to-br from-emerald-800 to-teal-800 text-white shadow-md ring-2 ring-emerald-500"
                : "border-emerald-100 bg-white text-slate-800 hover:border-emerald-400 hover:bg-emerald-50/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                sourceFilter === "extracted_survey" ? "text-emerald-100" : "text-emerald-800"
              }`}>
                Extracted Surveyed LEDs
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                sourceFilter === "extracted_survey" 
                  ? "bg-white text-emerald-900 shadow-2xs" 
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200"
              }`}>
                {sourceFilter === "extracted_survey" ? "Active (Alone)" : "Touch to filter alone"}
              </span>
            </div>

            <div className="flex items-baseline space-x-2 mt-2">
              <span className={`text-2xl font-black font-mono tracking-tight ${
                sourceFilter === "extracted_survey" ? "text-white" : "text-emerald-700"
              }`}>
                {surveyCount.toLocaleString()}
              </span>
              <span className={`text-xs font-medium ${
                sourceFilter === "extracted_survey" ? "text-emerald-100" : "text-emerald-700"
              }`}>
                Poles Alone
              </span>
            </div>

            <p className={`text-[10px] mt-1.5 flex items-center space-x-1 ${
              sourceFilter === "extracted_survey" ? "text-emerald-200" : "text-emerald-600"
            }`}>
              <Zap className="w-3 h-3 flex-shrink-0" />
              <span>Source: Pole Survey Report (Existing LEDs)</span>
            </p>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center space-x-2 mt-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Status / Quick Switch Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 pt-3 border-t border-slate-100 text-xs gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Active Map View:</span>
            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-800 text-white shadow-2xs">
              {sourceFilter === "installed_lamp" 
                ? `Installed Lamp Reports (${displayPoles.length.toLocaleString()} poles connected alone)`
                : sourceFilter === "extracted_survey"
                ? `Extracted Surveyed LEDs (${displayPoles.length.toLocaleString()} poles alone)`
                : `Total Connected Poles (All ${displayPoles.length.toLocaleString()} poles)`}
            </span>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            Rendering <strong className="text-slate-800 font-mono">{displayPoles.length.toLocaleString()}</strong> coordinates on map
          </div>
        </div>
      </div>

      {/* Map View Container */}
      <div className="relative w-full h-[520px] bg-slate-100">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 z-20">
            <div className="text-center text-xs text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
              <p>Loading interactive pole markers for {wardCode}...</p>
            </div>
          </div>
        ) : displayPoles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10 p-6">
            <div className="max-w-md text-center text-xs text-slate-500 space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <h4 className="font-semibold text-slate-800 text-sm">
                No matching coordinates for this view
              </h4>
              <p>
                {sourceFilter === "installed_lamp"
                  ? "No Installed Lamp Report poles found with recognized coordinates."
                  : sourceFilter === "extracted_survey"
                  ? "No Extracted Surveyed LED poles found with recognized coordinates."
                  : "No valid coordinates available for this ward."}
              </p>
              <button
                type="button"
                onClick={() => setSourceFilter("all")}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition"
              >
                Reset to Total Poles
              </button>
            </div>
          </div>
        ) : (
          <MapContainer
            center={centerCoord}
            zoom={14}
            scrollWheelZoom={true}
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapRecenter center={centerCoord} zoom={14} />

            {displayPoles.map((pole) => (
              <Marker
                key={pole.id || pole.pole_number}
                position={[pole.latitude, pole.longitude]}
                icon={createCustomMarkerIcon(pole.source)}
              >
                <Popup>
                  <div className="p-1 space-y-1.5 text-xs min-w-[200px]">
                    <div className="flex items-center justify-between border-b pb-1">
                      <span className="font-bold text-slate-800 text-sm">
                        Pole: {pole.pole_number}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 pt-0.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                        pole.source === "installed_lamp"
                          ? "bg-cyan-100 text-cyan-800 border border-cyan-300"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      }`}>
                        {pole.source === "installed_lamp"
                          ? "Installed Lamp Retrofit"
                          : "Extracted Surveyed LED"}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Connected
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-600 pt-1">
                      <p>
                        <strong className="text-slate-400">Lat/Lon:</strong>{" "}
                        <span className="font-mono text-[11px]">
                          {pole.latitude.toFixed(5)}, {pole.longitude.toFixed(5)}
                        </span>
                      </p>

                      {pole.additional_attributes && (
                        <>
                          {(pole.additional_attributes["Switch Point No"] || pole.additional_attributes["SP No"]) && (
                            <p>
                              <strong className="text-slate-400">Switchpoint:</strong>{" "}
                              {pole.additional_attributes["Switch Point No"] || pole.additional_attributes["SP No"]}
                            </p>
                          )}
                          {(pole.additional_attributes["Lamp Type"] || pole.additional_attributes["Light Wattage"]) && (
                            <p>
                              <strong className="text-slate-400">Lamp:</strong>{" "}
                              {pole.additional_attributes["Lamp Type"] || pole.additional_attributes["Light Wattage"]}
                            </p>
                          )}
                          {pole.additional_attributes["Wattage"] && (
                            <p>
                              <strong className="text-slate-400">Wattage:</strong>{" "}
                              {pole.additional_attributes["Wattage"]}
                            </p>
                          )}
                          {pole.additional_attributes["Road Category"] && (
                            <p>
                              <strong className="text-slate-400">Road:</strong>{" "}
                              {pole.additional_attributes["Road Category"]}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Map Legend */}
      <div className="px-5 py-3 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-slate-700">Map Legend:</span>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-cyan-600 inline-block border border-white shadow-2xs"></span>
            <span className="font-medium text-slate-700">Installed Lamp Reports</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block border border-white shadow-2xs"></span>
            <span className="font-medium text-slate-700">Extracted Surveyed LEDs</span>
          </div>
        </div>

        <span className="text-[11px] text-slate-400 font-medium">
          Connected Telemetry Isolated to {wardCode}
        </span>
      </div>

      {/* Column Mapping Dialog */}
      <ColumnMappingDialog
        isOpen={showMappingDialog}
        onClose={() => setShowMappingDialog(false)}
        onApply={(mappings) => handleImportRefresh(mappings)}
        isLoading={refreshing}
      />
    </div>
  );
};
