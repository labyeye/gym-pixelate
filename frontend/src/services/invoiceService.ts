import { request } from "./api";
import { Invoice } from "@/types/gym";

export const invoiceService = {
  getAll: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{
      success: boolean;
      count: number;
      total: number;
      data: Invoice[];
    }>(`/invoices${query}`);
  },
  create: (data: Partial<Invoice>) =>
    request<{ success: boolean; data: Invoice }>("/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
