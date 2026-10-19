// Mirrors frontend/src/services/gymApi.ts (web) so both clients hit the same endpoints.
import { request } from './api';

export const qs = (p?: Record<string, any>) => {
  const e = Object.entries(p || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all',
  );
  return e.length
    ? '?' +
        e
          .map(
            ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
          )
          .join('&')
    : '';
};
const json = (method: string, body?: any): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
const post = (url: string, body?: any) =>
  request<any>(url, json('POST', body ?? {}));
const get = (url: string, p?: Record<string, any>) =>
  request<any>(`${url}${qs(p)}`);

export const resource = (path: string) => ({
  list: (p?: Record<string, any>) => get(`/${path}`, p),
  get: (id: string) => get(`/${path}/${id}`),
  create: (body: any) => request<any>(`/${path}`, json('POST', body)),
  update: (id: string, body: any) =>
    request<any>(`/${path}/${id}`, json('PUT', body)),
  remove: (id: string) => request<any>(`/${path}/${id}`, json('DELETE')),
});

export interface Api {
  list: (p?: Record<string, any>) => Promise<any>;
  create: (b: any) => Promise<any>;
  update: (id: string, b: any) => Promise<any>;
  remove: (id: string) => Promise<any>;
}

export const gym = {
  members: {
    ...resource('members'),
    portalAccess: (id: string) => post(`/members/${id}/portal-access`),
    revokePortal: (id: string) =>
      request<any>(`/members/${id}/portal-access`, json('DELETE')),
    overview: (id: string) => get(`/members/${id}/overview`),
    search: (q: string) => get('/members/search', { q }),
  },
  plans: resource('membership-plans'),
  memberships: {
    ...resource('memberships'),
    renew: (id: string, b: any) => post(`/memberships/${id}/renew`, b),
    upgrade: (id: string, b: any) => post(`/memberships/${id}/upgrade`, b),
    freeze: (id: string, b: any) => post(`/memberships/${id}/freeze`, b),
    unfreeze: (id: string) => post(`/memberships/${id}/unfreeze`),
    cancel: (id: string, b: any) => post(`/memberships/${id}/cancel`, b),
    transfer: (id: string, b: any) => post(`/memberships/${id}/transfer`, b),
  },
  invoices: {
    ...resource('invoices'),
    pay: (id: string, b: any) => post(`/invoices/${id}/payments`, b),
    refund: (id: string, b: any) => post(`/invoices/${id}/refund`, b),
    cancel: (id: string) => post(`/invoices/${id}/cancel`),
  },
  classes: {
    ...resource('classes'),
    sessions: (p?: any) => get('/classes/sessions', p),
    roster: (p: any) => get('/classes/roster', p),
    book: (b: any) => post('/classes/book', b),
    cancel: (id: string) => post(`/classes/bookings/${id}/cancel`),
    mark: (id: string, status: string) =>
      post(`/classes/bookings/${id}/mark`, { status }),
  },
  pt: {
    list: (p?: any) => get('/pt', p),
    get: (id: string) => get(`/pt/${id}`),
    create: (b: any) => post('/pt', b),
    schedule: (id: string, b: any) => post(`/pt/${id}/sessions`, b),
    session: (id: string, sid: string, b: any) =>
      request<any>(`/pt/${id}/sessions/${sid}`, json('PATCH', b)),
    commission: (p?: any) => get('/pt/commission', p),
  },
  workouts: resource('workout-plans'),
  diets: resource('diet-plans'),
  measurements: resource('measurements'),
  lockers: {
    ...resource('lockers'),
    assign: (id: string, b: any) => post(`/lockers/${id}/assign`, b),
    release: (id: string) => post(`/lockers/${id}/release`),
  },
  products: {
    ...resource('products'),
    sell: (b: any) => post('/products/sell', b),
    stock: (id: string, b: any) => post(`/products/${id}/stock`, b),
  },
  expenses: resource('expenses'),
  coupons: resource('coupons'),
  announcements: {
    ...resource('announcements'),
    active: () => get('/announcements/active'),
  },
  equipment: {
    ...resource('equipment'),
    service: (id: string, b: any) => post(`/equipment/${id}/service`, b),
  },
  reports: {
    overview: (p?: any) => get('/reports/overview', p),
    dues: (p?: any) => get('/reports/dues', p),
    renewals: (p?: any) => get('/reports/renewals', p),
    birthdays: (p?: any) => get('/reports/birthdays', p),
    gst: (p?: any) => get('/reports/gst', p),
  },
  paymentLinks: {
    forInvoice: (id: string) => post(`/payment-links/invoice/${id}`),
    sendNow: () => post('/payment-links/send-now'),
  },
  users: { list: (p?: any) => get('/users', p) },
  dashboard: {
    summary: () => get('/dashboard/summary'),
    charts: () => get('/dashboard/charts'),
  },
  staff: {
    month: (month: string) => get('/staff-attendance', { month }),
    mark: (b: any) => post('/staff-attendance', b),
    payroll: (month: string) => get('/payroll', { month }),
  },
  billing: {
    plans: () => get('/billing/plans'),
    subscription: () => get('/billing/subscription'),
    razorpayOrder: (b: any) => post('/billing/razorpay/create-order', b),
    razorpayVerify: (b: any) => post('/billing/razorpay/verify', b),
  },
  portal: {
    get: (u: string) => get(`/portal${u}`),
    post: (u: string, b: any = {}) => post(`/portal${u}`, b),
  },
};
