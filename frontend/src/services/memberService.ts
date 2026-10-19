import { request } from "./api";
import { Member } from "@/types/gym";

export const memberService = {
  getAll: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{
      success: boolean;
      count: number;
      total: number;
      page: number;
      pages: number;
      data: Member[];
    }>(`/members${query}`);
  },
  getById: (id: string) =>
    request<{ success: boolean; data: Member }>(`/members/${id}`),
  create: (data: Partial<Member>) =>
    request<{ success: boolean; data: Member }>("/members", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Member>) =>
    request<{ success: boolean; data: Member }>(`/members/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/members/${id}`, {
      method: "DELETE",
    }),
};
