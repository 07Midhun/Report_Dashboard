import React from "react";
import { useWard } from "../context/WardContext";
import { ChevronRight, Building2, Compass, MapPin } from "lucide-react";

export const Breadcrumb: React.FC = () => {
  const { 
    selectedRegion, 
    selectedWard, 
    selectedDivision, 
    selectedZone, 
    clearSelection 
  } = useWard();

  const divisionName = selectedDivision || selectedRegion?.division;
  const zoneName = selectedZone || selectedRegion?.region_name;

  if (!selectedWard) {
    return (
      <nav className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 mb-3 py-1.5 px-1">
        <span className="flex items-center text-slate-700 font-bold">
          <Building2 className="w-3.5 h-3.5 mr-1 text-teal-600" /> Bangalore (BBMP)
        </span>
        {divisionName && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700 flex items-center">
              <Compass className="w-3 h-3 mr-1 text-teal-600" />
              {divisionName}
            </span>
          </>
        )}
        {zoneName && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium text-slate-600">{zoneName}</span>
          </>
        )}
      </nav>
    );
  }

  return (
    <nav className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 mb-3 py-1.5 px-1">
      <button
        onClick={clearSelection}
        className="flex items-center text-slate-600 hover:text-teal-700 font-bold transition-colors"
      >
        <Building2 className="w-3.5 h-3.5 mr-1 text-teal-600" /> Bangalore (BBMP)
      </button>

      {divisionName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-700 flex items-center">
            <Compass className="w-3 h-3 mr-1 text-teal-600" />
            {divisionName}
          </span>
        </>
      )}

      {zoneName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-medium text-slate-700">
            {zoneName}
          </span>
        </>
      )}

      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />

      <span className="flex items-center text-teal-800 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200 shadow-2xs">
        <MapPin className="w-3.5 h-3.5 mr-1 text-teal-600" />
        {selectedWard.ward_number}
      </span>
    </nav>
  );
};
