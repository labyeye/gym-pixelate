import { request } from "./api";
import { MembershipPlan } from "@/types/gym";

export const membershipPlanService = {
  getAll: () =>
    request<{ success: boolean; count: number; data: MembershipPlan[] }>(
      "/membership-plans",
    ),
  getById: (id: string) =>
    request<{ success: boolean; data: MembershipPlan }>(
      `/membership-plans/${id}`,
    ),
  create: (data: Partial<MembershipPlan>) =>
    request<{ success: boolean; data: MembershipPlan }>("/membership-plans", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<MembershipPlan>) =>
    request<{ success: boolean; data: MembershipPlan }>(
      `/membership-plans/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
    ),
  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/membership-plans/${id}`, {
      method: "DELETE",
    }),
};
