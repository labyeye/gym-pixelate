// Receipt PDF builder check (no database): node scripts/test-receipt.js [out.pdf]
const assert = require("assert");
const fs = require("fs");
const { buildReceiptPdf, amountInWords } = require("../utils/receiptPdf");

(async () => {
  assert.strictEqual(amountInWords(2360), "Two Thousand Three Hundred Sixty Rupees Only");
  assert.strictEqual(amountInWords(100000.5), "One Lakh Rupees and Fifty Paise Only");
  const pdf = await buildReceiptPdf({
    invoice: {
      invoiceNumber: "INV-00025",
      issuedAt: new Date(),
      totalAmount: 8260,
      paidAmount: 4130,
      paymentMethod: "upi",
      items: [{ description: "Half Yearly membership – Gym" }],
      payments: [{ amount: 4130, method: "upi", reference: "UPI123", type: "payment", paidAt: new Date() }],
    },
    member: { name: "Priya Singh", memberCode: "GYM-00025" },
    setting: { companyName: "Iron Paradise Fitness", companyAddress: "Sector 14, Gurugram", companyPhone: "9999900000", receiptDesign: { accent: "#024BAB", signatory: "Authorised Signatory" } },
  });
  assert.strictEqual(pdf.slice(0, 5).toString(), "%PDF-");
  if (process.argv[2]) fs.writeFileSync(process.argv[2], pdf);
  console.log("ok", pdf.length, "bytes");
})();
