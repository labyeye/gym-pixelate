import { request } from "./api";

export const trainerService = {
  getAll: () =>
    request<{ success: boolean; count: number; data: any[] }>("/trainers"),
  getAssignments: (trainerId: string) =>
    request<{ success: boolean; data: any[] }>(
      `/trainers/${trainerId}/assignments`,
    ),
  assignMember: (data: { trainerId: string; memberId: string }) =>
    request<{ success: boolean; data: any }>("/trainers/assign", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
