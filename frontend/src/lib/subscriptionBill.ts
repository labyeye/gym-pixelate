/** Tax invoice for a NestGym subscription payment (Pixelate Nest -> the gym). Same layout as NestHR (buildInvoiceHTML). */
import { buildInvoiceHTML } from "./buildInvoiceHTML";
import { openPrintWindow } from "./printWindow";

export interface BillRow {
  invoiceNumber: string;
  plan: string;
  billingCycle: string;
  amount: number; // rupees actually paid (GST included)
  paidAt: string;
}
export interface BillBuyer {
  name?: string;
  address?: string;
  state?: string;
  gst?: string;
  pan?: string;
  email?: string;
  phone?: string;
}

// ponytail: amount paid is treated as GST-inclusive (18%); change if plan prices are ever billed ex-GST.
export function printSubscriptionBill(b: BillRow, buyer: BillBuyer) {
  const html = buildInvoiceHTML({
    ...b,
    product: "NestGym",
    company: { name: buyer.name, address: buyer.address, state: buyer.state, gstNumber: buyer.gst, panNumber: buyer.pan, email: buyer.email, phone: buyer.phone },
  });
  openPrintWindow(html, true);
}
