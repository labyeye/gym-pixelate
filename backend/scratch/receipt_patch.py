import io


def edit(p, fn):
    s = io.open(p, newline="", encoding="utf-8").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    s = fn(s)
    io.open(p, "w", newline="", encoding="utf-8").write(s.replace("\n", "\r\n") if crlf else s)


def need(s, a, b):
    assert a in s, a
    return s.replace(a, b, 1)


B = r"D:\projects\Pixelate Nest\NestGym\backend"
F = r"D:\projects\Pixelate Nest\NestGym\frontend\src"

edit(B + r"\models\Setting.js", lambda s: need(s, "    // printed on the invoice: bank details", "    // member receipt look (cheque-style or standard), sanitised in settingController\n    receiptDesign: { type: mongoose.Schema.Types.Mixed, default: null },\n\n    // printed on the invoice: bank details"))
edit(B + r"\controllers\invoiceController.js", lambda s: need(s, "      template: company.invoiceTemplate,", "      template: company.invoiceTemplate,\n      receiptDesign: company.receiptDesign,"))


def sc(s):
    s = need(s, '"bodyProgress", ', "")
    s = need(s, '"staffPayroll", ', "")
    s = need(
        s,
        "const getSettings",
        '''// cheque / standard receipt look: only known keys, short strings, a real hex colour
const sanitizeReceiptDesign = (d) => {
  const str = (v, n) => String(v ?? "").slice(0, n);
  return {
    style: d?.style === "cheque" ? "cheque" : "standard",
    accent: /^#[0-9a-f]{6}$/i.test(d?.accent) ? d.accent : "#024BAB",
    signatory: str(d?.signatory, 60),
    note: str(d?.note, 200),
    showWords: d?.showWords !== false,
    showCrossing: d?.showCrossing !== false,
    showLogo: d?.showLogo !== false,
  };
};

const getSettings''',
    )
    s = need(s, "  if (req.body && req.body.invoiceTemplate != null) {", "  if (req.body && req.body.receiptDesign != null)\n    req.body.receiptDesign = sanitizeReceiptDesign(req.body.receiptDesign);\n  if (req.body && req.body.invoiceTemplate != null) {")
    return s


edit(B + r"\controllers\settingController.js", sc)


def pi(s):
    s = need(s, 'import { gym } from "@/services/gymApi";', 'import { gym } from "@/services/gymApi";\nimport { chequeReceiptHtml, DEFAULT_RECEIPT_DESIGN } from "@/lib/chequeReceipt";')
    s = need(
        s,
        "    const m = (typeof i.memberId === \"object\" && i.memberId) || member || {};\n    const { invoice, client } = gymInvoiceForPdf(i, m);",
        '''    const m = (typeof i.memberId === "object" && i.memberId) || member || {};
    if (co.receiptDesign?.style === "cheque" && tab) {
      const items = (i.items || []).map((x: any) => x.description).filter(Boolean);
      const lastPay = [...(i.payments || [])].reverse().find((p: any) => p.type !== "refund");
      tab.document.write(
        chequeReceiptHtml(
          {
            receiptNo: i.invoiceNumber,
            date: i.issuedAt,
            receivedFrom: m.name || "Walk-in customer",
            memberCode: m.memberCode,
            amount: i.paidAmount || 0,
            towards: items.join(", ") || "Gym services",
            method: lastPay?.method || i.paymentMethod,
            reference: lastPay?.reference,
            balance: Math.max(0, (i.totalAmount || 0) - (i.paidAmount || 0)),
            company: { name: co.name, address: co.address, phone: co.phone, gst: co.gst, logoUrl: co.logoUrl },
          },
          { ...DEFAULT_RECEIPT_DESIGN, ...co.receiptDesign },
          true,
        ),
      );
      tab.document.close();
      return;
    }
    const { invoice, client } = gymInvoiceForPdf(i, m);''',
    )
    return s


edit(F + r"\components\gym\printInvoice.ts", pi)
print("ok")
