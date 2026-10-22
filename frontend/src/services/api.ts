import axios from "axios";

const rawApiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const API_BASE_URL = (rawApiUrl.startsWith("http://") || rawApiUrl.startsWith("https://"))
  ? rawApiUrl
  : `https://${rawApiUrl}`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("schnell_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 unauthenticated
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("schnell_token");
      localStorage.removeItem("schnell_user");
      // Only redirect if not already on login
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Types
export interface User {
  id: number;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
}

export interface Ward {
  id: number;
  region_id: number;
  ward_number: string;
  ward_name: string;
  ward_code: string;
  created_at: string;
  active_reports_count: number;
  total_poles_count: number;
  zone_name?: string;
  division?: string;
  corporation?: string;
}

export interface Region {
  id: number;
  region_code: string;
  region_name: string;
  corporation?: string;
  division?: string;
  created_at: string;
  wards: Ward[];
}

export interface ReportDataResponse {
  uploaded: boolean;
  message?: string;
  report_id?: number;
  ward_id?: number;
  report_type?: string;
  original_filename?: string;
  file_size?: number;
  uploaded_at?: string;
  version_number?: number;
  total_rows?: number;
  columns?: string[];
  rows?: Record<string, any>[];
}

export interface MergedLedSummaryResponse {
  is_available: boolean;
  ward_id: number;
  ward_number: string;
  reason?: string;
  lamp_uploaded: boolean;
  pole_uploaded: boolean;
  lamp_rows_count: number;
  pole_led_rows_count: number;
  total_merged_count: number;
  file_path?: string;
  filename?: string;
  file_size?: number;
  generated_at?: string;
}

export interface ReportVersion {
  id: number;
  report_id: number;
  original_filename: string;
  file_size: number;
  uploaded_by?: number;
  uploader_name?: string;
  uploaded_at: string;
  version_number: number;
}

export interface Report {
  id: number;
  ward_id: number;
  report_type: string;
  original_filename: string;
  file_extension: string;
  file_size: number;
  mime_type: string;
  uploaded_by?: number;
  uploader_name?: string;
  uploaded_at: string;
  updated_at: string;
  is_active: boolean;
  versions_count: number;
}

export interface ReportSlot {
  category_key: "lamp_installation" | "pole_report" | "commission_integrated";
  display_title: string;
  is_uploaded: boolean;
  current_report: Report | null;
}

export interface WardReportSlotsResponse {
  ward_id: number;
  ward_code: string;
  ward_name: string;
  slots: ReportSlot[];
}

export interface ReportHistoryItem {
  version_id: number;
  report_id: number;
  report_type: string;
  original_filename: string;
  file_size: number;
  version_number: number;
  uploaded_at: string;
  uploader_name?: string;
}

export interface Pole {
  id: number;
  ward_id: number;
  pole_number: string;
  latitude: number;
  longitude: number;
  connectivity_status: "connected" | "disconnected" | "pending" | "unknown";
  source_report_id?: number;
  additional_attributes?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PoleSummary {
  ward_id: number;
  total_poles: number;
  connected_poles: number;
  disconnected_poles: number;
  pending_poles: number;
  unknown_poles: number;
  has_valid_coordinates: boolean;
  center_latitude?: number;
  center_longitude?: number;
  available_reports: string[];
}

export interface ColumnMappingConfig {
  pole_number_col?: string;
  latitude_col?: string;
  longitude_col?: string;
  status_col?: string;
  wattage_col?: string;
  switchpoint_col?: string;
}

// API functions
export const api = {
  // Auth
  login: async (username: string, password: string) => {
    const res = await apiClient.post("/api/auth/login", { username, password });
    return res.data;
  },
  getMe: async (): Promise<User> => {
    const res = await apiClient.get<User>("/api/auth/me");
    return res.data;
  },

  // Hierarchy
  getRegions: async (): Promise<Region[]> => {
    const res = await apiClient.get<Region[]>("/api/regions");
    return res.data;
  },
  createRegion: async (region_code: string, region_name: string): Promise<Region> => {
    const res = await apiClient.post<Region>("/api/regions", { region_code, region_name });
    return res.data;
  },
  createWard: async (regionId: number, data: { ward_number: string; ward_name: string; ward_code: string }): Promise<Ward> => {
    const res = await apiClient.post<Ward>(`/api/regions/${regionId}/wards`, data);
    return res.data;
  },

  // Reports
  getWardReports: async (wardId: number): Promise<WardReportSlotsResponse> => {
    const res = await apiClient.get<WardReportSlotsResponse>(`/api/wards/${wardId}/reports`);
    return res.data;
  },
  uploadReport: async (wardId: number, reportType: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post(`/api/wards/${wardId}/reports/${reportType}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
  replaceReport: async (wardId: number, reportType: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post(`/api/wards/${wardId}/reports/${reportType}/replace`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
  downloadReport: async (reportId: number, filenameFallback: string) => {
    const response = await apiClient.get(`/api/reports/${reportId}/download`, {
      responseType: "blob",
    });

    // Extract exact original filename from Content-Disposition header if available
    let filename = filenameFallback;
    const disposition = response.headers["content-disposition"];
    if (disposition) {
      const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      if (match) {
        filename = decodeURIComponent(match[1] || match[2]);
      }
    }

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  deleteReport: async (reportId: number) => {
    const res = await apiClient.delete(`/api/reports/${reportId}`);
    return res.data;
  },
  getWardReportHistory: async (wardId: number): Promise<ReportHistoryItem[]> => {
    const res = await apiClient.get<ReportHistoryItem[]>(`/api/wards/${wardId}/reports/history`);
    return res.data;
  },
  getWardReportData: async (wardId: number, categoryKey: string): Promise<ReportDataResponse> => {
    const res = await apiClient.get<ReportDataResponse>(`/api/wards/${wardId}/reports/${categoryKey}/data`);
    return res.data;
  },
  getReportDataById: async (reportId: number): Promise<ReportDataResponse> => {
    const res = await apiClient.get<ReportDataResponse>(`/api/reports/${reportId}/data`);
    return res.data;
  },

  // Poles
  getWardPoles: async (wardId: number, statusFilter?: string): Promise<Pole[]> => {
    const params = statusFilter && statusFilter !== "all" ? { status_filter: statusFilter } : {};
    const res = await apiClient.get<Pole[]>(`/api/wards/${wardId}/poles`, { params });
    return res.data;
  },
  getWardPoleSummary: async (wardId: number): Promise<PoleSummary> => {
    const res = await apiClient.get<PoleSummary>(`/api/wards/${wardId}/poles/summary`);
    return res.data;
  },
  importPoles: async (wardId: number, reportType?: string, customMappings?: ColumnMappingConfig) => {
    const res = await apiClient.post(`/api/wards/${wardId}/poles/import`, {
      report_type: reportType,
      custom_mappings: customMappings,
    });
    return res.data;
  },

  // System Hyperlinks (Synced between Admin and Operator)
  getHyperlinks: async (): Promise<{ om_dashboard_url: string; energy_saving_report_url: string }> => {
    const res = await apiClient.get<{ om_dashboard_url: string; energy_saving_report_url: string }>("/api/settings/hyperlinks");
    return res.data;
  },
  updateHyperlinks: async (data: { om_dashboard_url: string; energy_saving_report_url: string }) => {
    const res = await apiClient.put<{ om_dashboard_url: string; energy_saving_report_url: string }>("/api/settings/hyperlinks", data);
    return res.data;
  },

  // Master Merged LED Report (Combines Lamp report with surveyed LED poles)
  getMergedLedSummary: async (wardId: number, forceRegenerate: boolean = false): Promise<MergedLedSummaryResponse> => {
    const res = await apiClient.get<MergedLedSummaryResponse>(`/api/wards/${wardId}/merged-led-report/summary`, {
      params: { force_regenerate: forceRegenerate }
    });
    return res.data;
  },
  getMergedLedData: async (wardId: number): Promise<ReportDataResponse> => {
    const res = await apiClient.get<ReportDataResponse>(`/api/wards/${wardId}/merged-led-report/data`);
    return res.data;
  },
  downloadMergedLedReport: async (wardId: number, filename?: string) => {
    const res = await apiClient.get(`/api/wards/${wardId}/merged-led-report/download`, {
      responseType: "blob",
    });
    const blob = new Blob([res.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `Ward_${wardId}_Master_Merged_LED_Report.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};
