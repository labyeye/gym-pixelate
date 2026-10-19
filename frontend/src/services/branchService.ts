import { request } from "./api";
import { Branch } from "@/types/gym";

export const branchService = {
  getAll: () =>
    request<{ success: boolean; count: number; data: Branch[] }>("/branches"),
  create: (data: Partial<Branch>) =>
    request<{ success: boolean; data: Branch }>("/branches", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Branch>) =>
    request<{ success: boolean; data: Branch }>(`/branches/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
