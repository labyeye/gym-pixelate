import { request } from "./api";
import { Attendance } from "@/types/gym";

export const attendanceService = {
  getAll: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{
      success: boolean;
      count: number;
      total: number;
      data: Attendance[];
    }>(`/attendance${query}`);
  },
  checkin: (data: { memberId: string; method?: string }) =>
    request<{ success: boolean; data: Attendance }>("/attendance/checkin", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
