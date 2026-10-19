const nodemailer = require("nodemailer");

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

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

function _toWords(n) {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100)
    return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000)
    return (
      ONES[Math.floor(n / 100)] +
      " Hundred" +
      (n % 100 ? " " + _toWords(n % 100) : "")
    );
  if (n < 100000)
    return (
      _toWords(Math.floor(n / 1000)) +
      " Thousand" +
      (n % 1000 ? " " + _toWords(n % 1000) : "")
    );
  if (n < 10000000)
    return (
      _toWords(Math.floor(n / 100000)) +
      " Lakh" +
      (n % 100000 ? " " + _toWords(n % 100000) : "")
    );
  return (
    _toWords(Math.floor(n / 10000000)) +
    " Crore" +
    (n % 10000000 ? " " + _toWords(n % 10000000) : "")
  );
}

function numberToWords(amount) {
  const rounded = Math.round(amount);
  return (_toWords(rounded) || "Zero") + " Rupees Only";
}

function fmt(n) {
  return `&#8377;${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getPlanLabel(plan) {
  return (
    {
      starter: "Starter",
      growth: "Growth",
      professional: "Professional",
      business: "Business",
      enterprise: "Enterprise",
      pro: "Professional",
    }[plan] || plan
  );
}

function getPlanFeatures(plan) {
  const map = {
    starter: [
      "500 leads per month",
      "2 team members",
      "IndiaMART integration",
      "Follow-up reminders",
      "Email support",
    ],
    growth: [
      "5,000 leads per month",
      "10 team members",
      "IndiaMART + Facebook Lead Ads",
      "Visit calendar & scheduling",
      "Advanced follow-up workflows",
      "Priority support",
      "CSV export",
    ],
    pro: [
      "Unlimited leads",
      "Unlimited team members",
      "All integrations",
      "Custom workflows",
      "Dedicated account manager",
      "SLA guarantee",
      "Custom reporting",
      "API access",
    ],
    enterprise: [
      "Unlimited leads",
      "Unlimited team members",
      "All integrations",
      "Custom workflows",
      "Dedicated account manager",
      "SLA guarantee",
      "Custom reporting",
      "API access",
    ],
  };
  return map[plan] || [];
}

function buildInvoiceHtml({
  invoiceNumber,
  invoiceDate,
  dueDate,
  companyName,
  clientEmail,
  clientPhone,
  plan,
  billingCycle,
  amountRupees,
  paymentId,
}) {
  const planLabel = getPlanLabel(plan);
  const cycleLabel = billingCycle === "yearly" ? "Yearly" : "Monthly";

  const taxable = parseFloat((amountRupees / 1.18).toFixed(2));
  const igst = parseFloat((amountRupees - taxable).toFixed(2));
  const total = amountRupees;

  const serviceDesc = `NESTLeads ${planLabel} Plan — ${cycleLabel} Subscription`;

  const cell = (
    content,
    align = "left",
    bold = false,
    bg = "#fff",
    color = "#111827",
  ) =>
    `<td style="padding:8px 10px;font-size:12px;text-align:${align};background:${bg};color:${color};${bold ? "font-weight:700;" : ""}border:1px solid #e5e7eb;">${content}</td>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Tax Invoice ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border:1px solid #d1d5db;border-radius:4px;">

  <!-- ══ TITLE BAR ══ -->
  <tr>
    <td style="padding:18px 24px 0;text-align:center;border-bottom:2px solid #111827;">
      <p style="margin:0;font-size:22px;font-weight:900;letter-spacing:3px;color:#111827;">TAX INVOICE</p>
      <p style="margin:2px 0 12px;font-size:11px;color:#6b7280;">Original for Recipient</p>
    </td>
  </tr>

  <!-- ══ COMPANY + INVOICE META ══ -->
  <tr>
    <td style="padding:16px 24px;border-bottom:1px solid #d1d5db;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <!-- LEFT: company details -->
          <td style="vertical-align:top;width:60%;">
            <p style="margin:0 0 2px;font-size:15px;font-weight:800;color:#111827;">Kalahanu Tech Studios LLP</p>
            <p style="margin:0 0 2px;font-size:11px;color:#374151;">Kala Bhawan, Akharaghat Road, Muzaffarpur, Bihar – 842001</p>
            <p style="margin:0 0 2px;font-size:11px;color:#374151;">Email: support@pixelatenest.com &nbsp;|&nbsp; Phone: +91 84069 12345</p>
            <p style="margin:0 0 2px;font-size:11px;color:#374151;">Website: pixelatenest.com</p>
            <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#111827;">GSTIN: 10ABFFK0650E1Z2</p>
            <p style="margin:2px 0 0;font-size:11px;color:#374151;">PAN: ABFFK0650E &nbsp;|&nbsp; State: Bihar (Code: 10)</p>
          </td>
          <!-- RIGHT: invoice meta -->
          <td style="vertical-align:top;text-align:right;">
            <table cellpadding="0" cellspacing="0" style="margin-left:auto;">
              <tr><td style="font-size:11px;color:#6b7280;padding:2px 0;">Invoice No.</td><td style="font-size:11px;font-weight:700;color:#111827;padding:2px 0 2px 12px;">${invoiceNumber}</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:2px 0;">Invoice Date</td><td style="font-size:11px;color:#374151;padding:2px 0 2px 12px;">${invoiceDate}</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:2px 0;">Due Date</td><td style="font-size:11px;color:#374151;padding:2px 0 2px 12px;">${dueDate}</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:2px 0;">Place of Service</td><td style="font-size:11px;color:#374151;padding:2px 0 2px 12px;">India</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══ BILL TO / SHIP TO ══ -->
  <tr>
    <td style="padding:0 24px 16px;border-bottom:1px solid #d1d5db;">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:16px;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Bill To</p>
            <p style="margin:0 0 2px;font-size:13px;font-weight:800;color:#111827;text-transform:uppercase;">${companyName}</p>
            <p style="margin:0 0 2px;font-size:11px;color:#374151;">Email: ${clientEmail}</p>
            ${clientPhone ? `<p style="margin:0;font-size:11px;color:#374151;">Phone: ${clientPhone}</p>` : ""}
          </td>
          <td style="width:50%;vertical-align:top;border-left:1px solid #e5e7eb;padding-left:16px;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Ship To / Deliver To</p>
            <p style="margin:0 0 2px;font-size:13px;font-weight:800;color:#111827;text-transform:uppercase;">${companyName}</p>
            <p style="margin:0;font-size:11px;color:#374151;">(Digital Delivery — SaaS Subscription)</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══ LINE ITEMS TABLE ══ -->
  <tr>
    <td style="padding:0 24px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr style="background:#1e293b;">
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;width:40px;">S.No</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;">Description of Services / Goods</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;text-align:center;">HSN/SAC</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;text-align:center;">Qty</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;text-align:center;">Unit</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;text-align:right;">Rate (Rs.)</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;text-align:center;">Disc.</td>
            <td style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff;border:1px solid #334155;text-align:right;">Amount (Rs.)</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            ${cell("1", "center")}
            ${cell(serviceDesc)}
            ${cell("998314", "center")}
            ${cell("1", "center")}
            ${cell("Nos", "center")}
            ${cell(fmt(taxable), "right")}
            ${cell("—", "center")}
            ${cell(fmt(taxable), "right")}
          </tr>
          <tr>
            <td colspan="8" style="padding:40px 10px 8px;font-size:11px;border:1px solid #e5e7eb;color:#374151;">
              <strong>Amount in Words:</strong> ${numberToWords(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>

  <!-- ══ BANK DETAILS + TOTALS ══ -->
  <tr>
    <td style="padding:0 24px 16px;border-top:1px solid #d1d5db;">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <!-- Bank details -->
          <td style="vertical-align:top;width:52%;padding-right:16px;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Bank Details</p>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="font-size:11px;color:#6b7280;padding:1px 0;width:110px;">Bank Name</td><td style="font-size:11px;color:#374151;padding:1px 0;">: HDFC Bank Pvt. Ltd.</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:1px 0;">Account No.</td><td style="font-size:11px;color:#374151;padding:1px 0;">: 50200119083987</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:1px 0;">Account Name</td><td style="font-size:11px;color:#374151;padding:1px 0;">: KALAHANU TECH STUDIOS LLP</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:1px 0;">IFSC Code</td><td style="font-size:11px;color:#374151;padding:1px 0;">: HDFC0000344</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:1px 0;">Branch</td><td style="font-size:11px;color:#374151;padding:1px 0;">: Saraiyaganj, Muzaffarpur, Bihar</td></tr>
              <tr><td style="font-size:11px;color:#6b7280;padding:1px 0;">Account Type</td><td style="font-size:11px;color:#374151;padding:1px 0;">: Current</td></tr>
            </table>

            <p style="margin:12px 0 6px;font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Terms &amp; Notes</p>
            <ol style="margin:0;padding-left:16px;">
              <li style="font-size:10px;color:#6b7280;padding:1px 0;">Payment is due within 30 days of invoice date.</li>
              <li style="font-size:10px;color:#6b7280;padding:1px 0;">Quote invoice number in all payment references.</li>
              <li style="font-size:10px;color:#6b7280;padding:1px 0;">Services remain property of Pixelate Nest until paid in full.</li>
              <li style="font-size:10px;color:#6b7280;padding:1px 0;">Interest @ 18% p.a. charged on overdue amounts.</li>
            </ol>
          </td>
          <!-- Totals -->
          <td style="vertical-align:top;border-left:1px solid #e5e7eb;padding-left:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;">Subtotal</td>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;text-align:right;">${fmt(taxable)}</td>
              </tr>
              <tr>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;">Taxable Amount</td>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;text-align:right;">${fmt(taxable)}</td>
              </tr>
              <tr>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;">IGST (18%)</td>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;text-align:right;">${fmt(igst)}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="font-size:12px;font-weight:700;color:#111827;padding:7px 8px;border:1px solid #d1d5db;">Grand Total</td>
                <td style="font-size:12px;font-weight:700;color:#111827;padding:7px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(total)}</td>
              </tr>
              <tr>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;">(-) Amount Paid</td>
                <td style="font-size:11px;color:#374151;padding:5px 8px;border:1px solid #e5e7eb;text-align:right;">${fmt(total)}</td>
              </tr>
              <tr style="background:#eff6ff;">
                <td style="font-size:12px;font-weight:700;color:#024BAB;padding:7px 8px;border:1px solid #bfdbfe;">Balance Due</td>
                <td style="font-size:12px;font-weight:700;color:#024BAB;padding:7px 8px;border:1px solid #bfdbfe;text-align:right;">Rs. 0.00</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══ HSN / SAC BREAKDOWN ══ -->
  <tr>
    <td style="padding:0 24px 16px;border-top:1px solid #d1d5db;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr style="background:#f8fafc;">
            <td style="padding:7px 10px;font-size:11px;font-weight:700;color:#374151;border:1px solid #d1d5db;">HSN / SAC Code</td>
            <td style="padding:7px 10px;font-size:11px;font-weight:700;color:#374151;border:1px solid #d1d5db;">Taxable Value</td>
            <td style="padding:7px 10px;font-size:11px;font-weight:700;color:#374151;border:1px solid #d1d5db;text-align:center;">IGST Rate</td>
            <td style="padding:7px 10px;font-size:11px;font-weight:700;color:#374151;border:1px solid #d1d5db;text-align:right;">IGST Amt</td>
            <td style="padding:7px 10px;font-size:11px;font-weight:700;color:#374151;border:1px solid #d1d5db;text-align:right;">Total Tax</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:6px 10px;font-size:11px;color:#374151;border:1px solid #e5e7eb;">998314</td>
            <td style="padding:6px 10px;font-size:11px;color:#374151;border:1px solid #e5e7eb;">${fmt(taxable)}</td>
            <td style="padding:6px 10px;font-size:11px;color:#374151;border:1px solid #e5e7eb;text-align:center;">18%</td>
            <td style="padding:6px 10px;font-size:11px;color:#374151;border:1px solid #e5e7eb;text-align:right;">${fmt(igst)}</td>
            <td style="padding:6px 10px;font-size:11px;color:#374151;border:1px solid #e5e7eb;text-align:right;">${fmt(igst)}</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="padding:6px 10px;font-size:11px;font-weight:700;color:#111827;border:1px solid #d1d5db;">Total</td>
            <td style="padding:6px 10px;font-size:11px;font-weight:700;color:#111827;border:1px solid #d1d5db;">${fmt(taxable)}</td>
            <td style="padding:6px 10px;border:1px solid #d1d5db;"></td>
            <td style="padding:6px 10px;font-size:11px;font-weight:700;color:#111827;border:1px solid #d1d5db;text-align:right;">${fmt(igst)}</td>
            <td style="padding:6px 10px;font-size:11px;font-weight:700;color:#111827;border:1px solid #d1d5db;text-align:right;">${fmt(igst)}</td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>

  <!-- ══ PAYMENT REFERENCE ══ -->
  <tr>
    <td style="padding:0 24px 16px;border-top:1px solid #e5e7eb;">
      <p style="margin:12px 0 4px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Payment Reference</p>
      <p style="margin:0;font-size:11px;color:#374151;">Razorpay Payment ID: <span style="font-family:monospace;color:#111827;">${paymentId}</span></p>
    </td>
  </tr>

  <!-- ══ DECLARATION ══ -->
  <tr>
    <td style="padding:12px 24px 20px;border-top:2px solid #d1d5db;background:#f8fafc;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;width:60%;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Declaration</p>
            <p style="margin:0 0 4px;font-size:10px;color:#6b7280;line-height:1.5;">We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.</p>
            <p style="margin:0;font-size:10px;color:#6b7280;">All disputes are subject to Muzaffarpur jurisdiction only.</p>
          </td>
          <td style="vertical-align:bottom;text-align:right;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#374151;">For Kalahanu Tech Studios LLP</p>
            <p style="margin:24px 0 2px;font-size:11px;font-weight:700;color:#111827;">Authorised Signatory</p>
            <p style="margin:0;font-size:10px;color:#6b7280;">Labh Chandra Bothra, Co-Founder</p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:10px;color:#9ca3af;text-align:center;">This is a computer-generated invoice and does not require a physical signature.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomeHtml({
  companyName,
  userName,
  plan,
  dashboardUrl,
  invoiceHtml,
}) {
  const planLabel = getPlanLabel(plan);
  const features = getPlanFeatures(plan);
  const featureRows = features
    .map(
      (f) =>
        `<tr><td style="padding:5px 0;font-size:13px;color:#374151;"><span style="display:inline-block;width:18px;height:18px;background:#024BAB;border-radius:50%;text-align:center;line-height:18px;font-size:10px;color:#fff;margin-right:8px;vertical-align:middle;">&#10003;</span>${f}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Welcome to NESTLeads</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Banner -->
  <tr>
    <td style="background:linear-gradient(135deg,#024BAB 0%,#0369a1 60%,#0c4a6e 100%);border-radius:16px 16px 0 0;padding:48px 40px 40px;text-align:center;">
      <div style="display:inline-block;width:56px;height:56px;background:#fff;border-radius:14px;text-align:center;line-height:56px;font-size:28px;font-weight:900;color:#024BAB;margin-bottom:20px;">N</div>
      <h1 style="margin:0 0 8px;font-size:32px;font-weight:800;color:#fff;letter-spacing:-0.5px;">NESTLeads</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#bfdbfe;letter-spacing:0.5px;">Lead Management Platform by Pixelate Nest</p>
      <div style="font-size:26px;letter-spacing:4px;">&#127881; &#128640; &#10024; &#127882;</div>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="background:#fff;padding:40px;">
      <h2 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Welcome aboard, ${companyName}! &#127881;</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">Hi ${userName}, your <strong style="color:#024BAB;">${planLabel} Plan</strong> is now active. Your lead management system is ready — let's grow your pipeline together.</p>

      <!-- Plan badge -->
      <div style="background:#eff6ff;border:2px solid #024BAB;border-radius:10px;padding:18px 24px;margin-bottom:28px;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#024BAB;text-transform:uppercase;letter-spacing:1px;">Active Plan</p>
        <p style="margin:0;font-size:26px;font-weight:800;color:#111827;">${planLabel}</p>
      </div>

      <!-- Features -->
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;">What's included:</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">${featureRows}</table>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#024BAB;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;">Go to Dashboard &rarr;</a>
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;"/>
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">Your tax invoice is attached below for your records.</p>
    </td>
  </tr>

  <!-- Invoice -->
  <tr><td style="padding:0 0 0;">${invoiceHtml}</td></tr>

  <!-- Footer -->
  <tr>
    <td style="background:#1e293b;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#fff;">NESTLeads by Pixelate Nest &mdash; Kalahanu Tech Studios LLP</p>
      <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">support@pixelatenest.com &nbsp;|&nbsp; +91 84069 12345</p>
      <p style="margin:0;font-size:11px;color:#64748b;">&copy; ${new Date().getFullYear()} Kalahanu Tech Studios LLP. All rights reserved.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendWelcomeEmail({
  to,
  companyName,
  userName,
  plan,
  billingCycle,
  amountRupees,
  paymentId,
  invoiceNumber,
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("Email not configured — skipping welcome email.");
    return;
  }

  const transporter = createTransport();
  const dashboardUrl =
    process.env.CLIENT_URL || "https://leads.pixelatenest.com";
  const now = new Date();
  const dateOpts = { day: "2-digit", month: "long", year: "numeric" };
  const invoiceDate = now.toLocaleDateString("en-IN", dateOpts);
  const dueDate = invoiceDate;

  const invoiceHtml = buildInvoiceHtml({
    invoiceNumber,
    invoiceDate,
    dueDate,
    companyName,
    clientEmail: to,
    clientPhone: "",
    plan,
    billingCycle,
    amountRupees,
    paymentId,
  });

  const fullHtml = buildWelcomeHtml({
    companyName,
    userName,
    plan,
    dashboardUrl,
    invoiceHtml,
  });

  await transporter.sendMail({
    from: `"NESTLeads" <${process.env.SMTP_USER}>`,
    to,
    subject: `Welcome to NESTLeads — Your ${getPlanLabel(plan)} Plan is Active 🎉 | Invoice ${invoiceNumber}`,
    html: fullHtml,
  });
}

module.exports = { sendWelcomeEmail };
