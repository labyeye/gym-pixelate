import { request } from "./api";
import { Membership } from "@/types/gym";

export const membershipService = {
  getAll: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ success: boolean; count: number; data: Membership[] }>(
      `/memberships${query}`,
    );
  },
  getById: (id: string) =>
    request<{ success: boolean; data: Membership }>(`/memberships/${id}`),
  create: (data: Partial<Membership>) =>
    request<{ success: boolean; data: Membership }>("/memberships", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Membership>) =>
    request<{ success: boolean; data: Membership }>(`/memberships/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
