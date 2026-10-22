import React, { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { api } from "../services/api";
import type { Pole, PoleSummary, ColumnMappingConfig } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { 
  MapPin, RefreshCw, Filter, AlertCircle, Settings 
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

// Create custom leaflet div icons
const createCustomMarkerIcon = (status: string) => {
  let colorClass = "bg-slate-500";
  if (status === "connected") colorClass = "bg-emerald-500";
  else if (status === "disconnected") colorClass = "bg-rose-500";
  else if (status === "pending") colorClass = "bg-amber-500";

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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [errorMsg, setErrorMsg] = useState("");
  const [showMappingDialog, setShowMappingDialog] = useState(false);

  const fetchPoleData = async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      const [polesData, summaryData] = await Promise.all([
        api.getWardPoles(wardId, statusFilter),
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
    fetchPoleData();
  }, [wardId, statusFilter]);

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

  // Determine map center
  const centerCoord: [number, number] = useMemo(() => {
    if (summary?.center_latitude && summary?.center_longitude) {
      return [summary.center_latitude, summary.center_longitude];
    }
    if (validPoles.length > 0) {
      return [validPoles[0].latitude, validPoles[0].longitude];
    }
    // Default fallback (e.g. Bangalore / Coimbatore region)
    return [13.0375, 77.6042];
  }, [summary, validPoles]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Map Header & KPI Cards */}
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
              Interactive geographic distribution and connection telemetry extracted from uploaded Excel sheets
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
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium transition"
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

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Total Poles</span>
            <span className="text-xl font-bold text-slate-800 font-mono">
              {summary ? summary.total_poles.toLocaleString() : "..."}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-emerald-100 bg-emerald-50/20 shadow-2xs">
            <span className="text-[11px] font-medium text-emerald-600 uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span> Connected
            </span>
            <span className="text-xl font-bold text-emerald-700 font-mono">
              {summary ? summary.connected_poles.toLocaleString() : "..."}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-rose-100 bg-rose-50/20 shadow-2xs">
            <span className="text-[11px] font-medium text-rose-600 uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5"></span> Disconnected
            </span>
            <span className="text-xl font-bold text-rose-700 font-mono">
              {summary ? summary.disconnected_poles.toLocaleString() : "..."}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-amber-100 bg-amber-50/20 shadow-2xs">
            <span className="text-[11px] font-medium text-amber-600 uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span> Pending
            </span>
            <span className="text-xl font-bold text-amber-700 font-mono">
              {summary ? summary.pending_poles.toLocaleString() : "..."}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 rounded-full bg-slate-400 mr-1.5"></span> Unclassified
            </span>
            <span className="text-xl font-bold text-slate-600 font-mono">
              {summary ? summary.unknown_poles.toLocaleString() : "..."}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center space-x-2 mt-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Filter Markers:</span>
            {["all", "connected", "disconnected", "pending", "unknown"].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition ${
                  statusFilter === f
                    ? "bg-slate-800 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 font-medium">
            Rendering {validPoles.length} valid coordinates on map
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
        ) : validPoles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10 p-6">
            <div className="max-w-md text-center text-xs text-slate-500 space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <h4 className="font-semibold text-slate-800 text-sm">No Valid Coordinates Found for {wardName}</h4>
              <p>
                Either no Pole Survey Report has been uploaded yet, or the workbook does not contain recognized Latitude/Longitude columns.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowMappingDialog(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Configure Column Mappings</span>
                </button>
              )}
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

            {validPoles.map((pole) => (
              <Marker
                key={pole.id}
                position={[pole.latitude, pole.longitude]}
                icon={createCustomMarkerIcon(pole.connectivity_status)}
              >
                <Popup>
                  <div className="p-1 space-y-1.5 text-xs min-w-[180px]">
                    <div className="flex items-center justify-between border-b pb-1">
                      <span className="font-bold text-slate-800 text-sm">
                        Pole: {pole.pole_number}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                          pole.connectivity_status === "connected"
                            ? "bg-emerald-100 text-emerald-800"
                            : pole.connectivity_status === "disconnected"
                            ? "bg-rose-100 text-rose-800"
                            : pole.connectivity_status === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {pole.connectivity_status}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-600">
                      <p>
                        <strong className="text-slate-400">Lat/Lon:</strong>{" "}
                        <span className="font-mono text-[11px]">
                          {pole.latitude.toFixed(5)}, {pole.longitude.toFixed(5)}
                        </span>
                      </p>

                      {pole.additional_attributes && (
                        <>
                          {pole.additional_attributes["SP No"] && (
                            <p>
                              <strong className="text-slate-400">Switchpoint:</strong>{" "}
                              {pole.additional_attributes["SP No"]}
                            </p>
                          )}
                          {pole.additional_attributes["Light Wattage"] && (
                            <p>
                              <strong className="text-slate-400">Wattage:</strong>{" "}
                              {pole.additional_attributes["Light Wattage"]}
                            </p>
                          )}
                          {pole.additional_attributes["Road Category"] && (
                            <p>
                              <strong className="text-slate-400">Road:</strong>{" "}
                              {pole.additional_attributes["Road Category"]}
                            </p>
                          )}
                          {pole.additional_attributes["preciseLocation"] && (
                            <p>
                              <strong className="text-slate-400">Location:</strong>{" "}
                              {pole.additional_attributes["preciseLocation"]}
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
          <span className="font-semibold text-slate-700">Telemetry Legend:</span>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>Connected</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
            <span>Disconnected</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
            <span>Pending</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
            <span>Unclassified</span>
          </div>
        </div>

        <span className="text-[11px] text-slate-400">
          Source: PostgreSQL Database Isolated to {wardCode}
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
