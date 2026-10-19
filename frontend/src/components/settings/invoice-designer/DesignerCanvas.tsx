import React, { useLayoutEffect, useRef, useState } from "react";
import type { InvoiceCompany } from "@/components/pdf/InvoicePDFDocument";
import { computeInvoice, fmt, numToWords } from "@/lib/invoiceCalc";
import {
  blockH,
  blockW,
  CAN_WIDTH,
  fillVars,
  groupRows,
  isPlainRow,
  PAGE_H,
  PAGE_W,
  type Block,
  type Float,
  type InvoiceTemplate,
  type VarCtx,
} from "@/lib/invoiceTemplate";

export type Selection = { kind: "block" | "float"; id: string } | null;

const FAMILY = {
  Helvetica: "Helvetica, Arial, sans-serif",
  Times: "'Times New Roman', Times, serif",
  Courier: "'Courier New', monospace",
} as const;
const JUSTIFY = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

// A live, clickable A4 page. Blocks are an HTML twin of the PDF renderer (same theme values,
// same numbers via computeInvoice); floats are positioned exactly as the PDF places them.
export function DesignerCanvas({
  template,
  company,
  logo,
  sample,
  selection,
  onSelect,
  onFloatChange,
  onBlockProps,
}: {
  template: InvoiceTemplate;
  company: InvoiceCompany;
  logo?: string;
  sample: {
    invoice: any;
    client: any;
    title: string;
    labels: { number: string; date: string; due: string };
  };
  selection: Selection;
  onSelect: (s: Selection) => void;
  onFloatChange: (id: string, patch: Partial<Float>, group: string) => void;
  onBlockProps: (id: string, patch: Record<string, any>, group: string) => void;
}) {
  const T = template.theme;
  const wrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setWidth(Math.max(320, Math.min(820, el.clientWidth - 8))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = width / PAGE_W;
  const px = (pt: number) => pt * k;
  const height = px(PAGE_H);
  const c = computeInvoice(sample.invoice, sample.client, company);

  useLayoutEffect(() => {
    setOverflow(
      (contentRef.current?.offsetHeight ?? 0) + px(T.margin * 1.6) > height + 1,
    );
  });

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

  const full = T.borders === "full";
  const lines = T.borders !== "none";
  const H = (w: number) => (lines ? `${px(w)}px solid ${T.border}` : "none");
  const V = (w: number) => (full ? `${px(w)}px solid ${T.border}` : "none");
  const soft = `${px(0.5)}px solid #ddd`;
  const fs = (n: number) => px(n * T.scale);
  const bold = 700;

  const text = (
    size: number,
    extra: React.CSSProperties = {},
  ): React.CSSProperties => ({ fontSize: fs(size), color: T.text, ...extra });

  const imgDrag = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const isSel = (b: Block) =>
    selection?.kind === "block" && selection.id === b.id;

  // An image inside a section. While its section is selected, the blue corner resizes it (in pt,
  // clamped like the inspector sliders); replace / remove it from the panel on the right.
  // (a plain function, not a component, so it isn't remounted mid-drag on every re-render)
  const imgBox = ({
    src,
    w,
    h,
    on,
    onResize,
    style,
  }: {
    src: string;
    w: number;
    h: number;
    on: boolean;
    onResize: (w: number, h: number) => void;
    style?: React.CSSProperties;
  }) => {
    return (
      <div
        style={{ position: "relative", width: px(w), height: px(h), ...style }}
      >
        <img
          src={src}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
        {on && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              imgDrag.current = { x: e.clientX, y: e.clientY, w, h };
            }}
            onPointerMove={(e) => {
              const s = imgDrag.current;
              if (!s) return;
              const cl = (v: number) =>
                Math.round(Math.min(500, Math.max(10, v)));
              onResize(
                cl(s.w + (e.clientX - s.x) / k),
                cl(s.h + (e.clientY - s.y) / k),
              );
            }}
            onPointerUp={() => (imgDrag.current = null)}
            style={{
              position: "absolute",
              right: -6,
              bottom: -6,
              width: 12,
              height: 12,
              background: "#2563eb",
              border: "2px solid #fff",
              cursor: "nwse-resize",
              borderRadius: 2,
              touchAction: "none",
            }}
          />
        )}
      </div>
    );
  };

  const renderBlock = (b: Block): React.ReactNode => {
    const p = b.props;
    switch (b.type) {
      case "title":
        return (
          <div
            style={{
              borderBottom: H(1.5),
              padding: `${px(5)}px ${px(8)}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: JUSTIFY[p.align as keyof typeof JUSTIFY],
              background: p.filled ? T.primary : undefined,
            }}
          >
            <div
              style={text(13, {
                fontWeight: bold,
                letterSpacing: px(2),
                color: p.filled ? "#fff" : T.text,
              })}
            >
              {fillVars(p.text, ctx) || sample.title}
            </div>
            {p.subtitle ? (
              <div
                style={text(7, {
                  color: p.filled ? "#fff" : T.muted,
                  marginTop: px(1),
                })}
              >
                {fillVars(p.subtitle, ctx)}
              </div>
            ) : null}
          </div>
        );

      case "header": {
        const stacked = p.layout === "stacked";
        const line = (t: string, extra: React.CSSProperties = {}) => (
          <div
            style={text(8, { color: T.muted, marginBottom: px(1), ...extra })}
          >
            {t}
          </div>
        );
        return (
          <div
            style={{
              display: "flex",
              flexDirection: stacked
                ? "column"
                : p.swap
                  ? "row-reverse"
                  : "row",
              borderBottom: H(1),
            }}
          >
            <div
              style={{
                flex: 1,
                padding: px(8),
                borderRight: !stacked && !p.swap ? V(1) : undefined,
                borderLeft: !stacked && p.swap ? V(1) : undefined,
              }}
            >
              {p.showLogo && (p.logoSrc || logo)
                ? imgBox({
                    src: p.logoSrc || logo,
                    w: p.logoWidth,
                    h: p.logoHeight || p.logoWidth / 3,
                    on: isSel(b),
                    onResize: (w, h) =>
                      onBlockProps(
                        b.id,
                        { logoWidth: w, logoHeight: h },
                        `img-${b.id}`,
                      ),
                    style: {
                      marginBottom: px(4),
                      marginLeft: p.logoAlign === "left" ? 0 : "auto",
                      marginRight: p.logoAlign === "right" ? 0 : "auto",
                    },
                  })
                : null}
              {line(company.name, {
                fontWeight: bold,
                fontSize: fs(9),
                color: T.text,
              })}
              {p.showAddress &&
                company.addressLines.map((l, i) => (
                  <React.Fragment key={i}>{line(l)}</React.Fragment>
                ))}
              {p.showContact && (company.email || company.phone)
                ? line(
                    [
                      company.email && `Email: ${company.email}`,
                      company.phone && `Phone: ${company.phone}`,
                    ]
                      .filter(Boolean)
                      .join(" | "),
                  )
                : null}
              {p.showContact && company.website
                ? line(`Website: ${company.website}`)
                : null}
              {p.showTaxIds && company.gst
                ? line(`GSTIN: ${company.gst}`, {
                    fontWeight: bold,
                    color: T.text,
                    marginTop: px(3),
                  })
                : null}
              {p.showTaxIds && (company.pan || company.state)
                ? line(
                    [
                      company.pan && `PAN: ${company.pan}`,
                      company.state &&
                        `State: ${company.state}${company.stateCode ? ` (Code: ${company.stateCode})` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" | "),
                  )
                : null}
            </div>
            {p.showMeta ? (
              <div
                style={{
                  width: stacked ? "auto" : px(195),
                  padding: px(8),
                  borderTop: stacked ? V(1) : undefined,
                }}
              >
                {[
                  [sample.labels.number, c.invNo],
                  [sample.labels.date, c.invDate],
                  [sample.labels.due, c.dueDate],
                  ...(p.showPlace
                    ? [
                        [
                          "Place of Service",
                          c.clientState || company.state || "—",
                        ],
                      ]
                    : []),
                ].map(([label, value]) => (
                  <div
                    key={label as string}
                    style={{ display: "flex", marginBottom: px(4) }}
                  >
                    <div
                      style={text(8, {
                        width: px(80),
                        fontWeight: bold,
                        color: T.muted,
                      })}
                    >
                      {label}
                    </div>
                    <div style={text(8, { flex: 1 })}>: {value}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      }

      case "parties":
        return (
          <div style={{ padding: px(8), borderBottom: H(1) }}>
            <div
              style={text(7, {
                fontWeight: bold,
                color: T.muted,
                textTransform: "uppercase",
                marginBottom: px(3),
                letterSpacing: px(0.5),
              })}
            >
              {p.label}
            </div>
            <div style={text(10, { fontWeight: bold, marginBottom: px(2) })}>
              {c.clientName}
            </div>
            {c.fullAddress ? (
              <div style={text(8, { color: T.muted })}>{c.fullAddress}</div>
            ) : null}
            {p.showEmail && c.clientEmail ? (
              <div style={text(8, { color: T.muted })}>
                Email: {c.clientEmail}
              </div>
            ) : null}
            {p.showPhone && c.clientPhone ? (
              <div style={text(8, { color: T.muted })}>
                Phone: {c.clientPhone}
              </div>
            ) : null}
            {p.showGst && c.clientGst ? (
              <div style={text(8, { color: T.muted, fontWeight: bold })}>
                GSTIN: {c.clientGst}
              </div>
            ) : null}
          </div>
        );

      case "items": {
        const cols = [
          p.sno && ["sno", 24, "center", "S.No"],
          ["desc", 0, "left", p.descLabel],
          p.hsn && ["hsn", 52, "center", "HSN/SAC"],
          p.qty && ["qty", 34, "center", "Qty"],
          p.rate && ["rate", 62, "right", "Rate (Rs.)"],
          p.discount && ["dis", 42, "right", "Disc."],
          p.amount && ["amt", 70, "right", "Amount (Rs.)"],
        ].filter(Boolean) as [
          string,
          number,
          "left" | "center" | "right",
          string,
        ][];
        const cellStyle = (
          w: number,
          align: string,
          size: number,
          extra: React.CSSProperties = {},
        ): React.CSSProperties => ({
          ...(w ? { width: px(w), flex: "none" } : { flex: 1 }),
          padding: `0 ${px(4)}px`,
          textAlign: align as any,
          fontSize: fs(size),
          ...extra,
        });
        const empty = Math.max(0, (Number(p.minRows) || 0) - c.items.length);
        return (
          <div style={{ borderBottom: H(1) }}>
            <div
              style={{
                display: "flex",
                padding: `${px(5)}px 0`,
                background: p.accentHeader ? T.primary : T.headerBg,
                borderBottom: H(1),
              }}
            >
              {cols.map(([key, w, align, label]) => (
                <div
                  key={key}
                  style={cellStyle(w, align, 7.5, {
                    fontWeight: bold,
                    color: p.accentHeader ? "#fff" : T.text,
                  })}
                >
                  {label}
                </div>
              ))}
            </div>
            {c.items.map((it, i) => {
              const val: Record<string, React.ReactNode> = {
                sno: i + 1,
                hsn: it.hsn,
                qty: it.qty,
                rate: fmt(it.rate),
                dis: it.disc > 0 ? fmt(it.disc) : "—",
                amt: fmt(it.amt),
              };
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    padding: `${px(5)}px 0`,
                    minHeight: px(22),
                    borderBottom: soft,
                    background: p.zebra && i % 2 ? "#fafafa" : undefined,
                  }}
                >
                  {cols.map(([key, w, align]) =>
                    key === "desc" ? (
                      <div key={key} style={cellStyle(0, "left", 8)}>
                        {it.description}
                        {p.details && it.details ? (
                          <div
                            style={{
                              fontSize: fs(7),
                              color: T.muted,
                              marginTop: px(1),
                            }}
                          >
                            {it.details}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div key={key} style={cellStyle(w, align, 8)}>
                        {val[key]}
                      </div>
                    ),
                  )}
                </div>
              );
            })}
            {Array.from({ length: empty }).map((_, i) => (
              <div
                key={`e${i}`}
                style={{ height: px(18), borderBottom: soft }}
              />
            ))}
          </div>
        );
      }

      case "words":
        return (
          <div
            style={{
              display: "flex",
              padding: `${px(5)}px ${px(8)}px`,
              borderBottom: H(1),
              background: p.tint ? "#f9f9f9" : undefined,
            }}
          >
            <span
              style={text(7.5, {
                fontWeight: bold,
                color: T.muted,
                marginRight: px(6),
              })}
            >
              {p.label}
            </span>
            <span style={text(7.5, { flex: 1 })}>
              {numToWords(Math.round(c.total))}
            </span>
          </div>
        );

      case "summary": {
        const left = p.showBank || p.showTerms;
        const bank = company.bank;
        const row = (
          label: string,
          value: string,
          extra: React.CSSProperties = {},
        ) => (
          <div
            key={label}
            style={{
              display: "flex",
              padding: `${px(4)}px ${px(10)}px`,
              borderBottom: soft,
              ...extra,
            }}
          >
            <span style={text(8, { flex: 1, color: T.muted })}>{label}</span>
            <span style={text(8, { width: px(85), textAlign: "right" })}>
              {value}
            </span>
          </div>
        );
        const sec = (t: string) => (
          <div
            style={text(7.5, {
              fontWeight: bold,
              color: T.muted,
              textTransform: "uppercase",
              marginBottom: px(4),
              letterSpacing: px(0.5),
            })}
          >
            {t}
          </div>
        );
        const terms = fillVars(
          sample.invoice.notes ||
            (company.terms?.length
              ? company.terms.map((t, i) => `${i + 1}. ${t}`).join("\n")
              : "1. Payment is due within 30 days of invoice date.\n2. Quote the document number in all payment references."),
          ctx,
        );
        return (
          <div
            style={{
              display: "flex",
              flexDirection: p.totalsSide === "left" ? "row-reverse" : "row",
              borderBottom: H(1),
            }}
          >
            {left ? (
              <div
                style={{
                  flex: 1,
                  padding: px(8),
                  borderRight:
                    p.showTotals && p.totalsSide !== "left" ? V(1) : undefined,
                  borderLeft:
                    p.showTotals && p.totalsSide === "left" ? V(1) : undefined,
                }}
              >
                {p.showBank && bank ? (
                  <>
                    {sec("Bank Details")}
                    {(
                      [
                        ["Bank Name", bank.name],
                        ["Account No.", bank.accountNo],
                        ["Account Name", bank.accountName],
                        ["IFSC Code", bank.ifsc],
                        ["Branch", bank.branch],
                        ["Account Type", bank.type],
                      ] as const
                    ).map(([l, v]) =>
                      v ? (
                        <div key={l} style={text(8, { marginBottom: px(2) })}>
                          {l} : {v}
                        </div>
                      ) : null,
                    )}
                    {p.showTerms ? (
                      <div
                        style={{ borderBottom: soft, margin: `${px(6)}px 0` }}
                      />
                    ) : null}
                  </>
                ) : null}
                {p.showTerms ? (
                  <>
                    {sec(p.termsLabel)}
                    <div
                      style={text(7.5, {
                        color: T.muted,
                        lineHeight: 1.4,
                        whiteSpace: "pre-line",
                      })}
                    >
                      {terms}
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {p.showTotals ? (
              <div style={{ width: px(215) }}>
                {row("Subtotal", fmt(c.subtotal))}
                {c.discount > 0 && row("(-) Discount", fmt(c.discount))}
                {row("Taxable Amount", fmt(c.taxable))}
                {c.isInterState
                  ? c.igst > 0 && row(`IGST (${c.gstPct}%)`, fmt(c.igst))
                  : c.taxAmt > 0 && (
                      <>
                        {row(`CGST (${c.halfPct}%)`, fmt(c.cgst))}
                        {row(`SGST (${c.halfPct}%)`, fmt(c.sgst))}
                      </>
                    )}
                {row("Grand Total", fmt(c.total))}
                {c.paidAmount > 0 && (
                  <>
                    {row("(-) Amount Paid", fmt(c.paidAmount))}
                    {row("Balance Due", fmt(Math.max(0, c.balance)), {
                      background: c.balance > 0 ? "#fff5f5" : "#f0fdf4",
                      fontWeight: bold,
                    })}
                  </>
                )}
              </div>
            ) : null}
          </div>
        );
      }

      case "taxSummary": {
        if (c.taxAmt <= 0) return null;
        const cell = (v: string, b = false) => (
          <div
            style={{
              flex: 1,
              textAlign: "right",
              fontSize: fs(7.5),
              fontWeight: b ? bold : 400,
            }}
          >
            {v}
          </div>
        );
        const first = (v: string, b = false) => (
          <div
            style={{
              width: px(90),
              fontSize: fs(7.5),
              fontWeight: b ? bold : 400,
            }}
          >
            {v}
          </div>
        );
        const taxCells = (rate: boolean, b = false) =>
          c.isInterState ? (
            <>
              {cell(rate ? `${c.gstPct}%` : " ", b)}
              {cell(fmt(c.igst), b)}
            </>
          ) : (
            <>
              {cell(rate ? `${c.halfPct}%` : " ", b)}
              {cell(fmt(c.cgst), b)}
              {cell(rate ? `${c.halfPct}%` : " ", b)}
              {cell(fmt(c.sgst), b)}
            </>
          );
        return (
          <div style={{ borderBottom: H(1) }}>
            <div
              style={{
                display: "flex",
                padding: px(4),
                background: T.headerBg,
                borderBottom: H(0.5),
              }}
            >
              {first("HSN / SAC Code", true)}
              {cell("Taxable Value", true)}
              {c.isInterState ? (
                <>
                  {cell("IGST Rate", true)}
                  {cell("IGST Amt", true)}
                </>
              ) : (
                <>
                  {cell("CGST Rate", true)}
                  {cell("CGST Amt", true)}
                  {cell("SGST Rate", true)}
                  {cell("SGST Amt", true)}
                </>
              )}
              {cell("Total Tax", true)}
            </div>
            <div
              style={{ display: "flex", padding: px(4), borderBottom: soft }}
            >
              {first(c.hsnDefault)}
              {cell(fmt(c.taxable))}
              {taxCells(true)}
              {cell(fmt(c.taxAmt))}
            </div>
            <div
              style={{ display: "flex", padding: px(4), background: "#f0f0f0" }}
            >
              {first("Total", true)}
              {cell(fmt(c.taxable), true)}
              {taxCells(false, true)}
              {cell(fmt(c.taxAmt), true)}
            </div>
          </div>
        );
      }

      case "footer":
        return (
          <div style={{ display: "flex", borderBottom: H(1) }}>
            {p.showDeclaration ? (
              <div
                style={{
                  flex: 1,
                  padding: px(8),
                  borderRight: p.showSignature ? V(1) : undefined,
                }}
              >
                <div
                  style={text(7.5, {
                    fontWeight: bold,
                    color: T.muted,
                    textTransform: "uppercase",
                    marginBottom: px(4),
                    letterSpacing: px(0.5),
                  })}
                >
                  Declaration
                </div>
                <div
                  style={text(7, {
                    color: T.muted,
                    lineHeight: 1.2,
                    whiteSpace: "pre-line",
                  })}
                >
                  {p.declaration
                    ? fillVars(p.declaration, ctx)
                    : "We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct."}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {p.showSignature ? (
              <div
                style={{
                  width: px(210),
                  padding: px(8),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <div style={text(8, { color: T.muted })}>
                  For {company.name}
                </div>
                {p.signatureSrc
                  ? imgBox({
                      src: p.signatureSrc,
                      w: p.signatureWidth,
                      h: p.signatureHeight,
                      on: isSel(b),
                      onResize: (w, h) =>
                        onBlockProps(
                          b.id,
                          { signatureWidth: w, signatureHeight: h },
                          `img-${b.id}`,
                        ),
                      style: { marginTop: px(4), marginBottom: px(-20) },
                    })
                  : null}
                <div
                  style={{
                    width: px(150),
                    borderTop: `${px(1)}px solid ${T.border}`,
                    marginTop: px(32),
                    marginBottom: px(4),
                  }}
                />
                <div style={text(8, { fontWeight: bold })}>
                  {p.signatoryLabel}
                </div>
              </div>
            ) : null}
          </div>
        );

      case "note":
        return (
          <div
            style={{
              padding: `${px(5)}px ${px(8)}px`,
              textAlign: p.align,
              background: p.fill || undefined,
              fontSize: fs(Number(p.size) || 7.5),
              color: p.color || T.muted,
              fontWeight: p.bold ? bold : 400,
              whiteSpace: "pre-line",
            }}
          >
            {fillVars(p.text, ctx)}
          </div>
        );

      case "image":
        return p.src ? (
          <div
            style={{
              padding: px(6),
              display: "flex",
              justifyContent: JUSTIFY[p.align as keyof typeof JUSTIFY],
            }}
          >
            {imgBox({
              src: p.src,
              w: p.width,
              h: p.height,
              on: isSel(b),
              onResize: (w, h) =>
                onBlockProps(b.id, { width: w, height: h }, `img-${b.id}`),
            })}
          </div>
        ) : (
          <div
            style={{
              padding: px(6),
              fontSize: 11,
              color: "#999",
              textAlign: "center",
              border: "1px dashed #bbb",
              margin: px(6),
            }}
          >
            Image block: pick a file in the panel
          </div>
        );

      case "spacer":
        return <div style={{ height: px(Number(p.height) || 0) }} />;

      case "divider":
        return (
          <div
            style={{
              borderBottom: `${px(Number(p.thickness) || 1)}px solid ${p.color || T.border}`,
            }}
          />
        );
    }
  };

  // Floats: drag to move, corner handle to resize. Percent of the page, like the PDF.
  const drag = useRef<{
    id: string;
    mode: "move" | "resize";
    sx: number;
    sy: number;
    f: Float;
  } | null>(null);

  const onDown = (e: React.PointerEvent, f: Float, mode: "move" | "resize") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, sx: e.clientX, sy: e.clientY, f };
    onSelect({ kind: "float", id: f.id });
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / width) * 100;
    const dy = ((e.clientY - d.sy) / height) * 100;
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(hi, Math.max(lo, v));
    const patch: Partial<Float> =
      d.mode === "move"
        ? {
            x: clamp(d.f.x + dx, 0, 100 - d.f.w),
            y: clamp(d.f.y + dy, 0, 100 - d.f.h),
          }
        : {
            w: clamp(d.f.w + dx, 2, 100 - d.f.x),
            h: clamp(d.f.h + dy, 1, 100 - d.f.y),
          };
    onFloatChange(d.id, patch, `drag-${d.id}`);
  };
  const onUp = () => {
    drag.current = null;
  };

  const renderFloat = (f: Float) => {
    const sel = selection?.kind === "float" && selection.id === f.id;
    return (
      <div
        key={f.id}
        onPointerDown={(e) => onDown(e, f, "move")}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{
          position: "absolute",
          left: `${f.x}%`,
          top: `${f.y}%`,
          width: `${f.w}%`,
          height: `${f.h}%`,
          cursor: "move",
          touchAction: "none",
          outline: sel ? "2px solid #2563eb" : "1px dashed rgba(37,99,235,.35)",
          zIndex: sel ? 30 : f.back ? 0 : 20,
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            opacity: f.opacity,
            overflow: "hidden",
          }}
        >
          {f.kind === "image" ? (
            f.src ? (
              <img
                src={f.src}
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  pointerEvents: "none",
                }}
              />
            ) : (
              <div style={{ fontSize: 10, color: "#999", padding: 4 }}>
                No image
              </div>
            )
          ) : (
            <div
              style={{
                fontSize: px(f.size),
                color: f.color,
                fontWeight: f.bold ? 700 : 400,
                textAlign: f.align,
                whiteSpace: "pre-wrap",
                lineHeight: 1.2,
              }}
            >
              {fillVars(f.text, ctx)}
            </div>
          )}
        </div>
        {sel && (
          <div
            onPointerDown={(e) => onDown(e, f, "resize")}
            onPointerMove={onMove}
            onPointerUp={onUp}
            style={{
              position: "absolute",
              right: -6,
              bottom: -6,
              width: 12,
              height: 12,
              background: "#2563eb",
              border: "2px solid #fff",
              cursor: "nwse-resize",
              borderRadius: 2,
            }}
          />
        )}
      </div>
    );
  };

  // Drag the blue corner of the selected block: sideways = width (% of the row), down/up = height.
  const sizeDrag = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Clickable wrapper around one block. Inside a shared row the block fills the row's height and
  // drops its own bottom line (the row draws one), so blocks of different heights still line up.
  const wrapBlock = (b: Block, inRow = false) => {
    const sel = selection?.kind === "block" && selection.id === b.id;
    let node = renderBlock(b);
    if (inRow && React.isValidElement<{ style?: React.CSSProperties }>(node))
      node = React.cloneElement(node, {
        style: { ...node.props.style, flexGrow: 1, borderBottom: "none" },
      });
    const alone = !inRow && isPlainRow([b]);
    return (
      <div
        key={b.id}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect({ kind: "block", id: b.id });
        }}
        style={{
          pointerEvents: "auto",
          cursor: "pointer",
          outline: sel ? "2px solid #2563eb" : undefined,
          outlineOffset: -2,
          position: "relative",
          ...(inRow
            ? { flex: 1, display: "flex", flexDirection: "column" }
            : {}),
        }}
        className={
          sel
            ? ""
            : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-400 hover:-outline-offset-1"
        }
      >
        {node}
        {sel && (
          <div
            title="Drag to resize"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              sizeDrag.current = {
                x: e.clientX,
                y: e.clientY,
                w: blockW(b),
                h: (e.currentTarget.parentElement?.offsetHeight ?? 0) / k,
              };
            }}
            onPointerMove={(e) => {
              const d = sizeDrag.current;
              const inner = contentRef.current?.clientWidth;
              if (!d || !inner) return;
              const patch: Record<string, number> = {
                h: Math.round(
                  Math.min(800, Math.max(0, d.h + (e.clientY - d.y) / k)),
                ),
              };
              if (CAN_WIDTH(b.type))
                patch.w = Math.round(
                  Math.min(
                    100,
                    Math.max(10, d.w + ((e.clientX - d.x) / inner) * 100),
                  ),
                );
              onBlockProps(b.id, patch, `size-${b.id}`);
            }}
            onPointerUp={() => (sizeDrag.current = null)}
            style={{
              position: "absolute",
              right: -6,
              bottom: -6,
              width: 12,
              height: 12,
              background: "#2563eb",
              border: "2px solid #fff",
              cursor: alone && !CAN_WIDTH(b.type) ? "ns-resize" : "nwse-resize",
              borderRadius: 2,
              touchAction: "none",
              zIndex: 40,
            }}
          />
        )}
      </div>
    );
  };

  const floats = template.floats.filter((f) => f.visible);
  return (
    <div ref={wrapRef} className="w-full flex flex-col items-center">
      <div
        ref={pageRef}
        onPointerDown={() => onSelect(null)}
        style={{
          position: "relative",
          width,
          height,
          background: "#fff",
          boxShadow: "0 2px 16px rgba(0,0,0,.25)",
          overflow: "hidden",
          fontFamily: FAMILY[T.font],
          color: T.text,
        }}
      >
        {floats.filter((f) => f.back).map(renderFloat)}
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: `${px(T.margin * 0.8)}px ${px(T.margin)}px`,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div
            ref={contentRef}
            style={{ border: full ? `${px(1.5)}px solid ${T.border}` : "none" }}
          >
            {groupRows(template.blocks.filter((b) => b.visible)).map((row) =>
              isPlainRow(row) ? (
                wrapBlock(row[0])
              ) : (
                <div
                  key={row[0].id}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    borderBottom: H(1),
                  }}
                >
                  {row.map((b, i) => (
                    <div
                      key={b.id}
                      style={{
                        width: `${blockW(b)}%`,
                        flex: "none",
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        borderRight: i < row.length - 1 ? V(1) : undefined,
                        minHeight: px(blockH(b)) || undefined,
                      }}
                    >
                      {wrapBlock(b, true)}
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        </div>
        {floats.filter((f) => !f.back).map(renderFloat)}
      </div>
      {overflow && (
        <p className="mt-2 text-[11px] font-bold text-amber-700">
          Content is longer than one page here. Extra rows continue on page 2 in
          the PDF.
        </p>
      )}
    </div>
  );
}
