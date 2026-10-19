import { request } from "./api";

export const dashboardService = {
  getSummary: () =>
    request<{ success: boolean; data: any }>("/dashboard/summary"),
  getCharts: () =>
    request<{ success: boolean; data: any }>("/dashboard/charts"),
};
