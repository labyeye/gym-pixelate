import { pdf } from "@react-pdf/renderer";
import { InvoicePDFDocument, type InvoiceCompany } from "@/components/pdf/InvoicePDFDocument";

// react-pdf only reads PNG/JPEG, so any logo (webp, svg, a URL...) goes through a canvas first.
// null when it can't be loaded (e.g. a cross-origin URL without CORS); callers fall back.
async function logoToPng(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo"));
      img.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 300;
    canvas.height = img.naturalHeight || 100;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function pngDataUrl(src: string): Promise<string | undefined> {
  return (await logoToPng(src)) || undefined;
}

// The gym's own logo (Settings > logoUrl); undefined when there is none, so the PDF just has no logo.
export async function resolveLogo(custom?: string): Promise<string | undefined> {
  return custom?.trim() ? (await logoToPng(custom.trim())) || undefined : undefined;
}

// Company block of the PDF from the gym's Settings document.
export function settingsToCompany(s: any): InvoiceCompany {
  const hasBank = !!(s?.bankAccountNumber || s?.bankName);
  return {
    name: s?.companyName || "Your Gym",
    addressLines: String(s?.companyAddress || "").split("\n").map((l) => l.trim()).filter(Boolean),
    email: s?.companyEmail,
    phone: s?.companyPhone,
    website: s?.companyWebsite,
    gst: s?.companyGST,
    pan: s?.companyPAN,
    state: s?.companyState,
    stateCode: s?.companyStateCode,
    bank: hasBank
      ? {
          name: s.bankName,
          accountNo: s.bankAccountNumber,
          accountName: s.bankAccountName || s.companyName,
          ifsc: s.bankIFSC,
          branch: s.bankBranch,
          type: s.bankAccountType,
        }
      : undefined,
    terms: s?.invoiceTerms,
  };
}

/** The same company block, from the `company` object GET /invoices/:id returns. */
export function invoiceCompany(c: any): InvoiceCompany {
  return {
    name: c?.name || "Your Gym",
    addressLines: String(c?.address || "").split("\n").map((l: string) => l.trim()).filter(Boolean),
    email: c?.email,
    phone: c?.phone,
    website: c?.website,
    gst: c?.gst,
    pan: c?.pan,
    state: c?.state,
    stateCode: c?.stateCode,
    bank: c?.bank?.accountNo || c?.bank?.name ? c.bank : undefined,
    terms: c?.terms,
  };
}

/** Maps a NestGym invoice onto the shape the (shared) invoice PDF expects. */
export function gymInvoiceForPdf(i: any, member: any) {
  const items = (i.items || []).map((it: any) => ({
    description: it.description,
    hsn: it.sac || it.hsn || "999723", // 999723 = physical well-being / gym services
    quantity: it.quantity,
    price: it.unitPrice,
  }));
  const taxable = Number(i.amount) || 0;
  const taxPercent = taxable > 0 ? Math.round(((Number(i.gstAmount) || 0) / taxable) * 10000) / 100 : 0;
  return {
    invoice: {
      invoiceNo: i.invoiceNumber,
      createdAt: i.issuedAt,
      dueDate: i.dueDate,
      items,
      discount: Number(i.discount) || 0,
      taxPercent,
      paidAmount: Number(i.paidAmount) || 0,
      interState: false, // gyms bill locally: CGST + SGST
    },
    client: {
      name: member?.name || "Walk-in customer",
      phone: member?.phone,
      email: member?.email,
      address: member?.address,
      city: member?.city,
      state: member?.state,
    },
  };
}

export async function openInvoicePDF(props: React.ComponentProps<typeof InvoicePDFDocument>, tab?: Window | null) {
  const blob = await pdf(<InvoicePDFDocument {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  if (tab) tab.location.href = url;
  else window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
