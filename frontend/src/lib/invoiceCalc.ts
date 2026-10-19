import type { InvoiceCompany } from "@/components/pdf/InvoicePDFDocument";

// Money, dates and totals for an invoice. Shared by the PDF renderer and the Invoice Designer's
// live canvas so the two can never disagree on a number.

export const fmt = (n: number) =>
  `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (v: any) => {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(v);
  }
};

const getItems = (invoice: any): any[] => {
  if (!invoice) return [];
  if (Array.isArray(invoice.items) && invoice.items.length)
    return invoice.items;
  if (Array.isArray(invoice.lineItems) && invoice.lineItems.length)
    return invoice.lineItems;
  if (invoice.amount) {
    return [
      {
        description:
          invoice.title || invoice.projectTitle || "Professional Services",
        hsn: String(invoice?.hsnCode || "998314"),
        quantity: 1,
        unit: "Nos",
        price: Number(invoice.amount),
        unitPrice: Number(invoice.amount),
        amount: Number(invoice.amount),
      },
    ];
  }
  return [];
};

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

export function numToWords(n: number): string {
  if (n === 0) return "Zero";
  const w = (x: number): string => {
    if (x < 20) return ONES[x] || "";
    if (x < 100)
      return TENS[Math.floor(x / 10)] + (x % 10 ? " " + ONES[x % 10] : "");
    if (x < 1000)
      return (
        ONES[Math.floor(x / 100)] +
        " Hundred" +
        (x % 100 ? " " + w(x % 100) : "")
      );
    if (x < 100000)
      return (
        w(Math.floor(x / 1000)) +
        " Thousand" +
        (x % 1000 ? " " + w(x % 1000) : "")
      );
    if (x < 10000000)
      return (
        w(Math.floor(x / 100000)) +
        " Lakh" +
        (x % 100000 ? " " + w(x % 100000) : "")
      );
    return (
      w(Math.floor(x / 10000000)) +
      " Crore" +
      (x % 10000000 ? " " + w(x % 10000000) : "")
    );
  };
  const paise = Math.round((n % 1) * 100);
  let res = w(Math.floor(n)) + " Rupees";
  if (paise > 0) res += " and " + w(paise) + " Paise";
  return res + " Only";
}

export interface CalcItem {
  description: string;
  details?: string;
  hsn: string;
  qty: number;
  rate: number;
  disc: number;
  amt: number;
}

export function computeInvoice(
  invoice: any,
  client: any,
  company: InvoiceCompany,
) {
  const raw = getItems(invoice);
  const hsnDefault = String(invoice?.hsnCode || "998314");

  const items: CalcItem[] = raw.map((it: any) => {
    const qty = Number(it?.quantity ?? it?.qty ?? 1);
    const rate = Number(it?.price ?? it?.unitPrice ?? it?.amount ?? 0);
    const disc = Number(it?.discount ?? 0);
    return {
      description: it?.description || it?.name || "Professional Service",
      details: it?.details,
      hsn: it?.hsn ?? it?.sac ?? it?.hsnCode ?? hsnDefault,
      qty,
      rate,
      disc,
      amt: qty * rate - disc,
    };
  });

  const subtotal = raw.reduce((s: number, it: any) => {
    const qty = Number(it?.quantity ?? it?.qty ?? 1);
    const rate = Number(it?.price ?? it?.unitPrice ?? it?.amount ?? 0);
    return s + qty * rate;
  }, 0);

  const discount = Number(invoice?.discount ?? 0) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const gstPct = Number(invoice?.taxPercent ?? 18);
  const halfPct = Number((gstPct / 2).toFixed(2));
  const taxAmt = (taxable * gstPct) / 100;

  const clientStateNorm = String(client?.state ?? invoice?.clientState ?? "")
    .trim()
    .toLowerCase();
  const companyState = String(company.state ?? "")
    .trim()
    .toLowerCase();
  // invoice.interState (e.g. worked out from the two GSTINs) wins over comparing state names.
  const isInterState: boolean =
    invoice?.interState ??
    !!(
      clientStateNorm &&
      companyState &&
      !clientStateNorm.includes(companyState)
    );
  const cgst = isInterState ? 0 : taxAmt / 2;
  const sgst = isInterState ? 0 : taxAmt / 2;
  const igst = isInterState ? taxAmt : 0;

  const total = taxable + taxAmt;
  const paidAmount = Number(invoice?.paidAmount ?? invoice?.paid ?? 0) || 0;

  const clientAddress = client?.address || invoice?.clientAddress || "";
  const clientCity = client?.city || invoice?.clientCity || "";
  const clientState = client?.state || invoice?.clientState || "";
  const clientPin = client?.pin || invoice?.clientPin || "";

  return {
    items,
    hsnDefault,
    subtotal,
    discount,
    taxable,
    gstPct,
    halfPct,
    taxAmt,
    isInterState,
    cgst,
    sgst,
    igst,
    total,
    paidAmount,
    balance: total - paidAmount,
    clientName: client?.name || invoice?.clientName || invoice?.client || "—",
    clientState,
    clientGst:
      client?.gst ||
      client?.gstNumber ||
      client?.gstin ||
      invoice?.clientGst ||
      invoice?.gstNumber ||
      "",
    clientEmail: client?.email || invoice?.clientEmail || "",
    clientPhone: client?.phone || invoice?.clientPhone || "",
    fullAddress: [clientAddress, clientCity, clientState, clientPin]
      .filter(Boolean)
      .join(", "),
    invNo: invoice?.invoiceNo ?? invoice?.id ?? invoice?._id ?? "—",
    invDate: fmtDate(invoice?.createdAt ?? new Date()),
    dueDate: invoice?.dueDate ? fmtDate(invoice.dueDate) : "On Receipt",
  };
}

export type InvoiceCalc = ReturnType<typeof computeInvoice>;
