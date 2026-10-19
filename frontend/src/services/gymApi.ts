import { request } from "./api";

export const qs = (p?: Record<string, any>) => {
  const e = Object.entries(p || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "" && v !== "all",
  );
  return e.length
    ? "?" + new URLSearchParams(e.map(([k, v]) => [k, String(v)])).toString()
    : "";
};
const json = (method: string, body?: any): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface ListRes<T = any> {
  success: boolean;
  count: number;
  total?: number;
  page?: number;
  pages?: number;
  data: T[];
  [k: string]: any;
}
export interface OneRes<T = any> {
  success: boolean;
  data: T;
  [k: string]: any;
}

/** list/get/create/update/remove for a tenant-scoped REST resource. */
export const resource = (path: string) => ({
  list: (p?: Record<string, any>) => request<ListRes>(`/${path}${qs(p)}`),
  get: (id: string) => request<OneRes>(`/${path}/${id}`),
  create: (body: any) => request<OneRes>(`/${path}`, json("POST", body)),
  update: (id: string, body: any) =>
    request<OneRes>(`/${path}/${id}`, json("PUT", body)),
  remove: (id: string) =>
    request<{ success: boolean; message: string }>(
      `/${path}/${id}`,
      json("DELETE"),
    ),
});

const post = (url: string, body?: any) =>
  request<any>(url, json("POST", body ?? {}));
const get = (url: string, p?: Record<string, any>) =>
  request<any>(`${url}${qs(p)}`);

export const gym = {
  members: {
    ...resource("members"),
    portalAccess: (id: string) => post(`/members/${id}/portal-access`),
    revokePortal: (id: string) =>
      request<any>(`/members/${id}/portal-access`, json("DELETE")),
    overview: (id: string) => get(`/members/${id}/overview`),
    search: (q: string) => get("/members/search", { q }),
  },
  plans: resource("membership-plans"),
  memberships: {
    ...resource("memberships"),
    renew: (id: string, b: any) => post(`/memberships/${id}/renew`, b),
    upgrade: (id: string, b: any) => post(`/memberships/${id}/upgrade`, b),
    freeze: (id: string, b: any) => post(`/memberships/${id}/freeze`, b),
    unfreeze: (id: string) => post(`/memberships/${id}/unfreeze`),
    cancel: (id: string, b: any) => post(`/memberships/${id}/cancel`, b),
    transfer: (id: string, b: any) => post(`/memberships/${id}/transfer`, b),
  },
  invoices: {
    ...resource("invoices"),
    pay: (id: string, b: any) => post(`/invoices/${id}/payments`, b),
    refund: (id: string, b: any) => post(`/invoices/${id}/refund`, b),
    cancel: (id: string) => post(`/invoices/${id}/cancel`),
  },
  attendance: {
    list: (p?: any) => get("/attendance", p),
    live: (p?: any) => get("/attendance/live", p),
    accessCheck: (b: any) => post("/attendance/access-check", b),
    checkin: (b: any) => post("/attendance/checkin", b),
    checkout: (b: any) => post("/attendance/checkout", b),
  },
  enquiries: {
    ...resource("enquiries"),
    note: (id: string, b: any) => post(`/enquiries/${id}/notes`, b),
    convert: (id: string, b?: any) => post(`/enquiries/${id}/convert`, b),
  },
  classes: {
    ...resource("classes"),
    sessions: (p?: any) => get("/classes/sessions", p),
    roster: (p: any) => get("/classes/roster", p),
    book: (b: any) => post("/classes/book", b),
    cancel: (id: string) => post(`/classes/bookings/${id}/cancel`),
    mark: (id: string, status: string) =>
      post(`/classes/bookings/${id}/mark`, { status }),
  },
  pt: {
    list: (p?: any) => get("/pt", p),
    get: (id: string) => get(`/pt/${id}`),
    create: (b: any) => post("/pt", b),
    schedule: (id: string, b: any) => post(`/pt/${id}/sessions`, b),
    session: (id: string, sid: string, b: any) =>
      request<any>(`/pt/${id}/sessions/${sid}`, json("PATCH", b)),
    commission: (p?: any) => get("/pt/commission", p),
  },
  workouts: resource("workout-plans"),
  diets: resource("diet-plans"),
  measurements: resource("measurements"),
  lockers: {
    ...resource("lockers"),
    assign: (id: string, b: any) => post(`/lockers/${id}/assign`, b),
    release: (id: string) => post(`/lockers/${id}/release`),
  },
  products: {
    ...resource("products"),
    sell: (b: any) => post("/products/sell", b),
    stock: (id: string, b: any) => post(`/products/${id}/stock`, b),
  },
  expenses: resource("expenses"),
  coupons: resource("coupons"),
  announcements: {
    ...resource("announcements"),
    active: () => get("/announcements/active"),
  },
  equipment: {
    ...resource("equipment"),
    service: (id: string, b: any) => post(`/equipment/${id}/service`, b),
  },
  reports: {
    overview: (p?: any) => get("/reports/overview", p),
    dues: (p?: any) => get("/reports/dues", p),
    renewals: (p?: any) => get("/reports/renewals", p),
    atRisk: (p?: any) => get("/reports/at-risk", p),
    birthdays: (p?: any) => get("/reports/birthdays", p),
    heatmap: (p?: any) => get("/reports/heatmap", p),
    gst: (p?: any) => get("/reports/gst", p),
  },
  retention: {
    opportunities: (p?: any) => get("/retention/opportunities", p),
    conversion: (p?: any) => get("/retention/conversion", p),
    followUps: (p?: any) => get("/retention/follow-ups", p),
    addFollowUp: (b: any) => post("/retention/follow-ups", b),
  },
  paymentLinks: {
    forInvoice: (id: string) => post(`/payment-links/invoice/${id}`),
    sendNow: () => post("/payment-links/send-now"),
  },
  users: { list: (p?: any) => get("/users", p) },
  sweep: () => post("/memberships/sweep"),
  billing: {
    plans: () => get("/billing/plans"),
    subscription: () => get("/billing/subscription"),
    razorpayOrder: (b: any) => post("/billing/razorpay/create-order", b),
    razorpayVerify: (b: any) => post("/billing/razorpay/verify", b),
    hdfcOrder: (b: any) => post("/billing/hdfc/create-order", b),
  },
};
