import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import {
  computeInvoice,
  fmt,
  numToWords,
  type InvoiceCalc,
} from "@/lib/invoiceCalc";
import {
  blockH,
  blockW,
  fillVars,
  groupRows,
  isPlainRow,
  normalizeTemplate,
  PAGE_H,
  PAGE_W,
  type Block,
  type Float,
  type Theme,
  type VarCtx,
} from "@/lib/invoiceTemplate";

// The issuing company. Sales orders / purchase orders / invoices use the tenant's own details and
// logo; the Pixelate Nest subscription invoice uses Pixelate Nest's.
export interface InvoiceCompany {
  name: string;
  addressLines: string[];
  email?: string;
  phone?: string;
  website?: string;
  gst?: string;
  pan?: string;
  state?: string;
  stateCode?: string;
  bank?: {
    name?: string;
    accountNo?: string;
    accountName?: string;
    ifsc?: string;
    branch?: string;
    type?: string;
  };
  terms?: string[];
  jurisdiction?: string;
  signatoryTitle?: string;
}

const FONTS = {
  Helvetica: ["Helvetica", "Helvetica-Bold"],
  Times: ["Times-Roman", "Times-Bold"],
  Courier: ["Courier", "Courier-Bold"],
} as const;

// Everything that used to be a hard-coded colour / size now comes from the tenant's theme.
function makeStyles(T: Theme) {
  const [reg, bold] = FONTS[T.font];
  const k = T.scale;
  const full = T.borders === "full";
  const lines = T.borders !== "none";
  const H = (w: number) => (lines ? `${w}pt solid ${T.border}` : undefined); // section dividers
  const V = (w: number) => (full ? `${w}pt solid ${T.border}` : undefined); // vertical cell dividers
  const soft = "0.5pt solid #ddd";
  const fs = (n: number) => n * k;
  return {
    reg,
    bold,
    fs,
    S: StyleSheet.create({
      page: {
        fontFamily: reg,
        fontSize: fs(9),
        color: T.text,
        backgroundColor: "#fff",
        paddingVertical: T.margin * 0.8,
        paddingHorizontal: T.margin,
      },
      outer: full ? { border: `1.5pt solid ${T.border}` } : {},
      titleBar: {
        borderBottom: H(1.5),
        paddingVertical: 5,
        paddingHorizontal: 8,
      },
      titleText: {
        fontSize: fs(13),
        fontFamily: bold,
        letterSpacing: 2,
        color: T.text,
      },
      subtitle: { fontSize: fs(7), color: T.muted, marginTop: 1 },

      headerRow: { borderBottom: H(1) },
      companyBlock: { padding: 8 },
      companyLine: { fontSize: fs(8), color: T.muted, marginBottom: 1 },
      companyGst: {
        fontSize: fs(8),
        fontFamily: bold,
        color: T.text,
        marginTop: 3,
        marginBottom: 1,
      },
      metaBlock: { width: 195, padding: 8 },
      metaRow: {
        flexDirection: "row",
        marginBottom: 4,
        alignItems: "flex-start",
      },
      metaLabel: {
        width: 80,
        fontSize: fs(8),
        fontFamily: bold,
        color: T.muted,
      },
      metaValue: { flex: 1, fontSize: fs(8), color: T.text },

      partyBlock: { padding: 8, borderBottom: H(1) },
      partyLabel: {
        fontSize: fs(7),
        fontFamily: bold,
        color: T.muted,
        textTransform: "uppercase",
        marginBottom: 3,
        letterSpacing: 0.5,
      },
      partyName: {
        fontSize: fs(10),
        fontFamily: bold,
        color: T.text,
        marginBottom: 2,
      },
      partyLine: { fontSize: fs(8), color: T.muted, marginBottom: 1 },

      tableContainer: { borderBottom: H(1) },
      tableRow: {
        flexDirection: "row",
        borderBottom: soft,
        paddingVertical: 5,
        minHeight: 22,
      },
      tdText: { fontSize: fs(8), color: T.text },
      tdDescSub: { fontSize: fs(7), color: T.muted, marginTop: 1 },
      emptyRow: { flexDirection: "row", borderBottom: soft, height: 18 },
      colSno: { width: 24, paddingHorizontal: 3, textAlign: "center" },
      colDesc: { flex: 1, paddingHorizontal: 4 },
      colHsn: { width: 52, paddingHorizontal: 3, textAlign: "center" },
      colQty: { width: 34, paddingHorizontal: 3, textAlign: "center" },
      colRate: { width: 62, paddingHorizontal: 4, textAlign: "right" },
      colDis: { width: 42, paddingHorizontal: 3, textAlign: "right" },
      colAmt: { width: 70, paddingHorizontal: 4, textAlign: "right" },

      amountWords: {
        flexDirection: "row",
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderBottom: H(1),
      },
      amountWordsLabel: {
        fontSize: fs(7.5),
        fontFamily: bold,
        color: T.muted,
        marginRight: 6,
      },
      amountWordsValue: { fontSize: fs(7.5), color: T.text, flex: 1 },

      bottomSection: { flexDirection: "row", borderBottom: H(1) },
      bottomLeft: { flex: 1, padding: 8 },
      sectionLabel: {
        fontSize: fs(7.5),
        fontFamily: bold,
        color: T.muted,
        textTransform: "uppercase",
        marginBottom: 4,
        letterSpacing: 0.5,
      },
      bankLine: { fontSize: fs(8), color: T.text, marginBottom: 2 },
      notesText: { fontSize: fs(7.5), color: T.muted, lineHeight: 1.4 },
      dividerH: { borderBottom: soft, marginVertical: 6 },
      bottomRight: { width: 215 },
      totalRow: {
        flexDirection: "row",
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderBottom: soft,
      },
      totalLabel: { flex: 1, fontSize: fs(8), color: T.muted },
      totalValue: {
        width: 85,
        fontSize: fs(8),
        textAlign: "right",
        color: T.text,
      },
      totalLabelBold: {
        flex: 1,
        fontSize: fs(9),
        fontFamily: bold,
        color: T.text,
      },
      totalValueBold: {
        width: 85,
        fontSize: fs(9),
        fontFamily: bold,
        textAlign: "right",
      },

      taxSection: { borderBottom: H(1) },
      taxHeader: {
        flexDirection: "row",
        backgroundColor: T.headerBg,
        borderBottom: H(0.5),
        paddingVertical: 4,
        paddingHorizontal: 4,
      },
      taxRow: {
        flexDirection: "row",
        borderBottom: soft,
        paddingVertical: 4,
        paddingHorizontal: 4,
      },
      taxTotalRow: {
        flexDirection: "row",
        paddingVertical: 4,
        paddingHorizontal: 4,
        backgroundColor: "#f0f0f0",
      },
      taxColW: { width: 90, fontSize: fs(7.5) },
      taxColN: { flex: 1, fontSize: fs(7.5), textAlign: "right" },
      taxColNH: {
        flex: 1,
        fontSize: fs(7.5),
        fontFamily: bold,
        textAlign: "right",
      },

      footerSection: { flexDirection: "row", borderBottom: H(1) },
      declarationBlock: { flex: 1, padding: 8 },
      signatureBlock: { width: 210, padding: 8, alignItems: "flex-end" },
      declarationText: {
        fontSize: fs(7),
        color: T.muted,
        lineHeight: 1.2,
        marginTop: 2,
      },
      signatureImage: {
        width: 120,
        height: 40,
        objectFit: "contain",
        marginTop: 4,
        marginBottom: -20,
      },
      signatureLine: {
        width: 150,
        borderTop: `1pt solid ${T.border}`,
        marginTop: 32,
        marginBottom: 4,
      },
      signatureFor: {
        fontSize: fs(8),
        fontFamily: bold,
        color: T.text,
        textAlign: "right",
      },
      signatureTitle: { fontSize: fs(7.5), color: T.muted, textAlign: "right" },
    }),
    V,
  };
}

const ALIGN = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

export function InvoicePDFDocument({
  invoice,
  client,
  company,
  logo,
  sign,
  title = "TAX INVOICE",
  labels,
  template,
}: {
  invoice: any;
  client?: any;
  company: InvoiceCompany;
  logo?: string; // data URL or URL of the issuer's logo
  sign?: string; // optional signature image
  title?: string;
  labels?: { number?: string; date?: string; due?: string };
  template?: any; // the tenant's Settings.invoiceTemplate; missing = the classic layout
}) {
  const tpl = normalizeTemplate(template);
  const T = tpl.theme;
  const { S, bold, fs, V } = makeStyles(T);
  const c = computeInvoice(invoice, client, company);

  const ctx: VarCtx = {
    "company.name": company.name,
    "company.phone": company.phone || "",
    "company.email": company.email || "",
    "client.name": c.clientName,
    "invoice.number": String(c.invNo),
    "invoice.date": c.invDate,
    "invoice.due": c.dueDate,
    "invoice.total": fmt(c.total),
    "invoice.balance": fmt(Math.max(0, c.balance)),
  };

  const renderBlock = (b: Block): React.ReactNode => {
    const p = b.props;
    switch (b.type) {
      case "title":
        return (
          <View
            key={b.id}
            style={[
              S.titleBar,
              { alignItems: ALIGN[p.align as keyof typeof ALIGN] || "center" },
              p.filled ? { backgroundColor: T.primary } : {},
            ]}
          >
            <Text style={[S.titleText, p.filled ? { color: "#fff" } : {}]}>
              {fillVars(p.text, ctx) || title}
            </Text>
            {p.subtitle ? (
              <Text style={[S.subtitle, p.filled ? { color: "#fff" } : {}]}>
                {fillVars(p.subtitle, ctx)}
              </Text>
            ) : null}
          </View>
        );

      case "header": {
        const stacked = p.layout === "stacked";
        const logoW = Number(p.logoWidth) || 150;
        return (
          <View
            key={b.id}
            style={[
              S.headerRow,
              {
                flexDirection: stacked
                  ? "column"
                  : p.swap
                    ? "row-reverse"
                    : "row",
              },
            ]}
          >
            <View
              style={[
                S.companyBlock,
                stacked
                  ? {}
                  : {
                      flex: 1,
                      borderRight: p.swap ? undefined : V(1),
                      borderLeft: p.swap ? V(1) : undefined,
                    },
              ]}
            >
              {p.showLogo && (p.logoSrc || logo) ? (
                <Image
                  src={p.logoSrc || logo}
                  style={{
                    width: logoW,
                    height: Number(p.logoHeight) || logoW / 3,
                    objectFit: "contain",
                    marginBottom: 4,
                    alignSelf:
                      ALIGN[p.logoAlign as keyof typeof ALIGN] || "flex-start",
                  }}
                />
              ) : null}
              <Text
                style={[
                  S.companyLine,
                  { fontFamily: bold, fontSize: fs(9), color: T.text },
                ]}
              >
                {company.name}
              </Text>
              {p.showAddress &&
                company.addressLines.map((l, i) => (
                  <Text key={i} style={S.companyLine}>
                    {l}
                  </Text>
                ))}
              {p.showContact && (company.email || company.phone) ? (
                <Text style={S.companyLine}>
                  {[
                    company.email && `Email: ${company.email}`,
                    company.phone && `Phone: ${company.phone}`,
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </Text>
              ) : null}
              {p.showContact && company.website ? (
                <Text style={S.companyLine}>Website: {company.website}</Text>
              ) : null}
              {p.showTaxIds && company.gst ? (
                <Text style={S.companyGst}>GSTIN: {company.gst}</Text>
              ) : null}
              {p.showTaxIds && (company.pan || company.state) ? (
                <Text style={S.companyLine}>
                  {[
                    company.pan && `PAN: ${company.pan}`,
                    company.state &&
                      `State: ${company.state}${company.stateCode ? ` (Code: ${company.stateCode})` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </Text>
              ) : null}
            </View>
            {p.showMeta ? (
              <View
                style={[
                  S.metaBlock,
                  stacked ? { width: "auto", borderTop: V(1) } : {},
                ]}
              >
                <View style={S.metaRow}>
                  <Text style={S.metaLabel}>
                    {labels?.number ?? "Invoice No."}
                  </Text>
                  <Text style={S.metaValue}>: {c.invNo}</Text>
                </View>
                <View style={S.metaRow}>
                  <Text style={S.metaLabel}>
                    {labels?.date ?? "Invoice Date"}
                  </Text>
                  <Text style={S.metaValue}>: {c.invDate}</Text>
                </View>
                <View style={S.metaRow}>
                  <Text style={S.metaLabel}>{labels?.due ?? "Due Date"}</Text>
                  <Text style={S.metaValue}>: {c.dueDate}</Text>
                </View>
                {invoice?.poNumber ? (
                  <View style={S.metaRow}>
                    <Text style={S.metaLabel}>PO / Ref No.</Text>
                    <Text style={S.metaValue}>: {invoice.poNumber}</Text>
                  </View>
                ) : null}
                {p.showPlace ? (
                  <View style={S.metaRow}>
                    <Text style={S.metaLabel}>Place of Service</Text>
                    <Text style={S.metaValue}>
                      : {c.clientState || company.state || "—"}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      }

      case "parties":
        return (
          <View key={b.id} style={S.partyBlock}>
            <Text style={S.partyLabel}>{p.label}</Text>
            <Text style={S.partyName}>{c.clientName}</Text>
            {c.fullAddress ? (
              <Text style={S.partyLine}>{c.fullAddress}</Text>
            ) : null}
            {p.showEmail && c.clientEmail ? (
              <Text style={S.partyLine}>Email: {c.clientEmail}</Text>
            ) : null}
            {p.showPhone && c.clientPhone ? (
              <Text style={S.partyLine}>Phone: {c.clientPhone}</Text>
            ) : null}
            {p.showGst && c.clientGst ? (
              <Text style={[S.partyLine, { fontFamily: bold }]}>
                GSTIN: {c.clientGst}
              </Text>
            ) : null}
          </View>
        );

      case "items": {
        const head = {
          fontSize: fs(7.5),
          fontFamily: bold,
          color: p.accentHeader ? "#fff" : T.text,
        };
        const cols = [
          p.sno && { key: "sno", style: S.colSno },
          { key: "desc", style: S.colDesc },
          p.hsn && { key: "hsn", style: S.colHsn },
          p.qty && { key: "qty", style: S.colQty },
          p.rate && { key: "rate", style: S.colRate },
          p.discount && { key: "dis", style: S.colDis },
          p.amount && { key: "amt", style: S.colAmt },
        ].filter(Boolean) as { key: string; style: any }[];
        const heading: Record<string, string> = {
          sno: "S.No",
          desc: p.descLabel,
          hsn: "HSN/SAC",
          qty: "Qty",
          rate: "Rate (Rs.)",
          dis: "Disc.",
          amt: "Amount (Rs.)",
        };
        const empty = Math.max(0, (Number(p.minRows) || 0) - c.items.length);
        return (
          <View key={b.id} style={S.tableContainer}>
            <View
              style={{
                flexDirection: "row",
                backgroundColor: p.accentHeader ? T.primary : T.headerBg,
                borderBottom:
                  T.borders === "none" ? undefined : `1pt solid ${T.border}`,
                paddingVertical: 5,
              }}
            >
              {cols.map((col) => (
                <Text key={col.key} style={[head, col.style]}>
                  {heading[col.key]}
                </Text>
              ))}
            </View>
            {c.items.map((it, idx) => {
              const cell: Record<string, React.ReactNode> = {
                sno: idx + 1,
                hsn: it.hsn,
                qty: it.qty,
                rate: fmt(it.rate),
                dis: it.disc > 0 ? fmt(it.disc) : "—",
                amt: fmt(it.amt),
              };
              return (
                <View
                  key={idx}
                  style={[
                    S.tableRow,
                    p.zebra && idx % 2 === 1
                      ? { backgroundColor: "#fafafa" }
                      : {},
                  ]}
                >
                  {cols.map((col) =>
                    col.key === "desc" ? (
                      <View key="desc" style={S.colDesc}>
                        <Text style={S.tdText}>{it.description}</Text>
                        {p.details && it.details ? (
                          <Text style={S.tdDescSub}>{it.details}</Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text key={col.key} style={[S.tdText, col.style]}>
                        {cell[col.key]}
                      </Text>
                    ),
                  )}
                </View>
              );
            })}
            {Array.from({ length: empty }).map((_, i) => (
              <View key={`e${i}`} style={S.emptyRow}>
                {cols.map((col) => (
                  <Text key={col.key} style={[S.tdText, col.style]}>
                    {" "}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      }

      case "words":
        return (
          <View
            key={b.id}
            style={[
              S.amountWords,
              p.tint ? { backgroundColor: "#f9f9f9" } : {},
            ]}
          >
            <Text style={S.amountWordsLabel}>{p.label}</Text>
            <Text style={S.amountWordsValue}>
              {numToWords(Math.round(c.total))}
            </Text>
          </View>
        );

      case "summary":
        return renderSummary(b);

      case "taxSummary":
        return c.taxAmt > 0 ? renderTax(b) : null;

      case "footer":
        return (
          <View key={b.id} style={S.footerSection}>
            {p.showDeclaration ? (
              <View
                style={[
                  S.declarationBlock,
                  p.showSignature ? { borderRight: V(1) } : {},
                ]}
              >
                <Text style={S.sectionLabel}>Declaration</Text>
                <Text style={S.declarationText}>
                  {p.declaration
                    ? fillVars(p.declaration, ctx)
                    : `We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.${company.jurisdiction ? `\nAll disputes are subject to ${company.jurisdiction} jurisdiction only.` : ""}`}
                </Text>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {p.showSignature ? (
              <View style={S.signatureBlock}>
                <Text
                  style={{
                    fontSize: fs(8),
                    color: T.muted,
                    textAlign: "right",
                  }}
                >
                  For {company.name}
                </Text>
                {p.signatureSrc || sign ? (
                  <Image
                    src={p.signatureSrc || sign}
                    style={[
                      S.signatureImage,
                      {
                        width: Number(p.signatureWidth) || 120,
                        height: Number(p.signatureHeight) || 40,
                      },
                    ]}
                  />
                ) : null}
                <View style={S.signatureLine} />
                <Text style={S.signatureFor}>{p.signatoryLabel}</Text>
                {company.signatoryTitle ? (
                  <Text style={S.signatureTitle}>{company.signatoryTitle}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );

      case "note":
        return (
          <View
            key={b.id}
            style={{
              paddingVertical: 5,
              paddingHorizontal: 8,
              alignItems: ALIGN[p.align as keyof typeof ALIGN] || "center",
              backgroundColor: p.fill || undefined,
            }}
          >
            <Text
              style={{
                fontSize: fs(Number(p.size) || 7.5),
                color: p.color || T.muted,
                fontFamily: p.bold ? bold : undefined,
                textAlign: p.align,
              }}
            >
              {fillVars(p.text, ctx)}
            </Text>
          </View>
        );

      case "image":
        return p.src ? (
          <View
            key={b.id}
            style={{
              padding: 6,
              alignItems: ALIGN[p.align as keyof typeof ALIGN] || "flex-start",
            }}
          >
            <Image
              src={p.src}
              style={{
                width: Number(p.width) || 120,
                height: Number(p.height) || 60,
                objectFit: "contain",
              }}
            />
          </View>
        ) : null;

      case "spacer":
        return <View key={b.id} style={{ height: Number(p.height) || 0 }} />;

      case "divider":
        return (
          <View
            key={b.id}
            style={{
              borderBottom: `${Number(p.thickness) || 1}pt solid ${p.color || T.border}`,
            }}
          />
        );
    }
  };

  function renderSummary(b: Block) {
    const p = b.props;
    const left = p.showBank || p.showTerms;
    const totalsFirst = p.totalsSide === "left";
    const bank = company.bank;
    return (
      <View
        key={b.id}
        style={[
          S.bottomSection,
          { flexDirection: totalsFirst ? "row-reverse" : "row" },
        ]}
      >
        {left ? (
          <View
            style={[
              S.bottomLeft,
              p.showTotals
                ? totalsFirst
                  ? { borderLeft: V(1) }
                  : { borderRight: V(1) }
                : {},
            ]}
          >
            {p.showBank && bank ? (
              <>
                <Text style={S.sectionLabel}>Bank Details</Text>
                {bank.name ? (
                  <Text style={S.bankLine}>Bank Name : {bank.name}</Text>
                ) : null}
                {bank.accountNo ? (
                  <Text style={S.bankLine}>Account No. : {bank.accountNo}</Text>
                ) : null}
                {bank.accountName ? (
                  <Text style={S.bankLine}>
                    Account Name : {bank.accountName}
                  </Text>
                ) : null}
                {bank.ifsc ? (
                  <Text style={S.bankLine}>IFSC Code : {bank.ifsc}</Text>
                ) : null}
                {bank.branch ? (
                  <Text style={S.bankLine}>Branch : {bank.branch}</Text>
                ) : null}
                {bank.type ? (
                  <Text style={S.bankLine}>Account Type : {bank.type}</Text>
                ) : null}
                {p.showTerms ? <View style={S.dividerH} /> : null}
              </>
            ) : null}
            {p.showTerms ? (
              <>
                <Text style={S.sectionLabel}>{p.termsLabel}</Text>
                <Text style={S.notesText}>
                  {fillVars(
                    invoice?.notes ||
                      (company.terms?.length
                        ? company.terms
                            .map((t, i) => `${i + 1}. ${t}`)
                            .join("\n")
                        : "1. Payment is due within 30 days of invoice date.\n2. Quote the document number in all payment references."),
                    ctx,
                  )}
                </Text>
              </>
            ) : null}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {p.showTotals ? renderTotals(c) : null}
      </View>
    );
  }

  function renderTotals(x: InvoiceCalc) {
    const row = (label: string, value: string, key: string) => (
      <View key={key} style={S.totalRow}>
        <Text style={S.totalLabel}>{label}</Text>
        <Text style={S.totalValue}>{value}</Text>
      </View>
    );
    return (
      <View style={S.bottomRight}>
        {row("Subtotal", fmt(x.subtotal), "s")}
        {x.discount > 0 && row("(-) Discount", fmt(x.discount), "d")}
        {row("Taxable Amount", fmt(x.taxable), "t")}
        {x.isInterState
          ? x.igst > 0 && row(`IGST (${x.gstPct}%)`, fmt(x.igst), "i")
          : x.taxAmt > 0 && (
              <>
                {row(`CGST (${x.halfPct}%)`, fmt(x.cgst), "c")}
                {row(`SGST (${x.halfPct}%)`, fmt(x.sgst), "g")}
              </>
            )}
        {row("Grand Total", fmt(x.total), "gt")}
        {x.paidAmount > 0 && (
          <>
            {row("(-) Amount Paid", fmt(x.paidAmount), "p")}
            <View
              style={[
                S.totalRow,
                { backgroundColor: x.balance > 0 ? "#fff5f5" : "#f0fdf4" },
              ]}
            >
              <Text style={S.totalLabelBold}>Balance Due</Text>
              <Text
                style={[
                  S.totalValueBold,
                  { color: x.balance > 0 ? "#dc2626" : "#16a34a" },
                ]}
              >
                {fmt(Math.max(0, x.balance))}
              </Text>
            </View>
          </>
        )}
      </View>
    );
  }

  function renderTax(b: Block) {
    const inter = c.isInterState;
    const rate = (label: string) => <Text style={S.taxColNH}>{label}</Text>;
    return (
      <View key={b.id} style={S.taxSection}>
        <View style={S.taxHeader}>
          <Text style={[S.taxColW, { fontFamily: bold }]}>HSN / SAC Code</Text>
          {rate("Taxable Value")}
          {inter ? (
            <>
              {rate("IGST Rate")}
              {rate("IGST Amt")}
            </>
          ) : (
            <>
              {rate("CGST Rate")}
              {rate("CGST Amt")}
              {rate("SGST Rate")}
              {rate("SGST Amt")}
            </>
          )}
          {rate("Total Tax")}
        </View>
        <View style={S.taxRow}>
          <Text style={S.taxColW}>{c.hsnDefault}</Text>
          <Text style={S.taxColN}>{fmt(c.taxable)}</Text>
          {inter ? (
            <>
              <Text style={S.taxColN}>{c.gstPct}%</Text>
              <Text style={S.taxColN}>{fmt(c.igst)}</Text>
            </>
          ) : (
            <>
              <Text style={S.taxColN}>{c.halfPct}%</Text>
              <Text style={S.taxColN}>{fmt(c.cgst)}</Text>
              <Text style={S.taxColN}>{c.halfPct}%</Text>
              <Text style={S.taxColN}>{fmt(c.sgst)}</Text>
            </>
          )}
          <Text style={S.taxColN}>{fmt(c.taxAmt)}</Text>
        </View>
        <View style={S.taxTotalRow}>
          <Text style={[S.taxColW, { fontFamily: bold }]}>Total</Text>
          {rate(fmt(c.taxable))}
          {inter ? (
            <>
              {rate(" ")}
              {rate(fmt(c.igst))}
            </>
          ) : (
            <>
              {rate(" ")}
              {rate(fmt(c.cgst))}
              {rate(" ")}
              {rate(fmt(c.sgst))}
            </>
          )}
          {rate(fmt(c.taxAmt))}
        </View>
      </View>
    );
  }

  const renderFloat = (f: Float) => {
    const box = {
      position: "absolute" as const,
      left: (f.x / 100) * PAGE_W,
      top: (f.y / 100) * PAGE_H,
      width: (f.w / 100) * PAGE_W,
      height: (f.h / 100) * PAGE_H,
      opacity: f.opacity,
    };
    if (f.kind === "image")
      return f.src ? (
        <View key={f.id} fixed={f.allPages} style={box}>
          <Image
            src={f.src}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </View>
      ) : null;
    return (
      <View key={f.id} fixed={f.allPages} style={box}>
        <Text
          style={{
            fontSize: f.size,
            color: f.color,
            fontFamily: f.bold ? bold : undefined,
            textAlign: f.align,
          }}
        >
          {fillVars(f.text, ctx)}
        </Text>
      </View>
    );
  };

  const floats = tpl.floats.filter((f) => f.visible);
  return (
    <Document>
      <Page size="A4" style={S.page}>
        {floats.filter((f) => f.back).map(renderFloat)}
        <View style={S.outer}>
          {groupRows(tpl.blocks.filter((b) => b.visible)).map((row) =>
            isPlainRow(row) ? (
              renderBlock(row[0])
            ) : (
              <View
                key={row[0].id}
                style={{
                  flexDirection: "row",
                  borderBottom:
                    T.borders === "none" ? undefined : `1pt solid ${T.border}`,
                }}
              >
                {row.map((b, i) => {
                  const node = renderBlock(b);
                  return (
                    <View
                      key={b.id}
                      style={{
                        width: `${blockW(b)}%`,
                        minHeight: blockH(b) || undefined,
                        borderRight:
                          i < row.length - 1 && T.borders === "full"
                            ? `1pt solid ${T.border}`
                            : undefined,
                      }}
                    >
                      {React.isValidElement<{ style?: any }>(node)
                        ? React.cloneElement(node, {
                            style: [
                              node.props.style,
                              { borderBottomWidth: 0, flexGrow: 1 },
                            ],
                          })
                        : node}
                    </View>
                  );
                })}
              </View>
            ),
          )}
        </View>
        {floats.filter((f) => !f.back).map(renderFloat)}
      </Page>
    </Document>
  );
}
