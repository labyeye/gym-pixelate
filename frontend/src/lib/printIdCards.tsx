import { renderToStaticMarkup } from "react-dom/server";
import { IdCardView } from "@/components/idcard/IdCardView";
import { cardDims, qrValue, type IdCardTemplate, type IdCompany } from "@/lib/idCard";
import { buildQrMap } from "@/lib/idCardQr";
import { writePrintDocument } from "@/lib/printWindow";

export interface PrintIdOptions {
  employees: any[];
  template: IdCardTemplate;
  company: IdCompany;
  sides: "front" | "both";
  /** cards: one card per page (card printer). sheet: several per A4 page, with cut lines. */
  layout: "cards" | "sheet";
}

/**
 * Opens a print tab with the cards. Call it straight from a click handler: the tab is opened before anything is
 * awaited so the browser doesn't treat it as a blocked pop-up. Returns false if the tab could not be opened.
 */
export async function printIdCards(opts: PrintIdOptions): Promise<boolean> {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write("<p style='font:14px sans-serif;padding:16px'>Preparing ID cards…</p>");

  const { employees, template, company, layout } = opts;
  const withBack = opts.sides === "both" && template.backEnabled;
  const { w, h } = cardDims(template);

  // Every QR code the cards need, built up front so rendering stays synchronous.
  const values: string[] = [];
  for (const emp of employees)
    for (const side of [template.front, template.back])
      for (const el of side.elements)
        if (el.kind === "qr" && el.visible) values.push(qrValue(el, emp, company));
  const qrMap = await buildQrMap(values);

  const card = (emp: any, side: "front" | "back") =>
    renderToStaticMarkup(
      <IdCardView template={template} side={side} employee={emp} company={company} qrMap={qrMap} />,
    );

  let body = "";
  let css = "";
  if (layout === "cards") {
    css = `@page{size:${w}mm ${h}mm;margin:0}
      .page{width:${w}mm;height:${h}mm;overflow:hidden;page-break-after:always}
      .page:last-child{page-break-after:auto}
      @media screen{body{background:#e5e7eb;padding:12px}.page{margin:0 auto 12px;box-shadow:0 1px 6px rgba(0,0,0,.3)}}`;
    for (const emp of employees) {
      body += `<div class="page">${card(emp, "front")}</div>`;
      if (withBack) body += `<div class="page">${card(emp, "back")}</div>`;
    }
  } else {
    const M = 10; // page margin, mm
    const G = 4; // gap between cards, mm
    const cols = Math.max(1, Math.floor((210 - 2 * M + G) / (w + G)));
    const rows = Math.max(1, Math.floor((297 - 2 * M + G) / (h + G)));
    const perSheet = cols * rows;
    css = `@page{size:A4;margin:${M}mm}
      .sheet{display:grid;grid-template-columns:repeat(${cols},${w}mm);gap:${G}mm;justify-content:center;align-content:start;page-break-after:always}
      .sheet:last-child{page-break-after:auto}
      .cell{outline:0.2mm dashed #b8b8b8;width:${w}mm;height:${h}mm}
      @media screen{body{background:#e5e7eb;padding:12px}.sheet{background:#fff;width:210mm;margin:0 auto 12px;padding:${M}mm;box-sizing:border-box;box-shadow:0 1px 6px rgba(0,0,0,.3)}}`;
    const sheet = (cells: string[]) =>
      `<div class="sheet">${cells.map((c) => `<div class="cell">${c}</div>`).join("")}</div>`;
    for (let i = 0; i < employees.length; i += perSheet) {
      const chunk = employees.slice(i, i + perSheet);
      body += sheet(chunk.map((e) => card(e, "front")));
      if (withBack) {
        // Back sheet is mirrored per row so each back lines up behind its front when printed double-sided.
        const backs: string[] = [];
        for (let r = 0; r < chunk.length; r += cols) {
          const row = chunk.slice(r, r + cols).map((e) => card(e, "back")).reverse();
          // pad short rows on the left, so a lone card ends up behind its front when the sheet is flipped
          while (row.length < cols) row.unshift("");
          backs.push(...row);
        }
        body += sheet(backs);
      }
    }
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ID cards</title>
    <style>html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    *{box-sizing:border-box}${css}</style></head><body>${body}</body></html>`;

  win.document.open();
  writePrintDocument(win, html, false);
  // Photos and the logo load over the network; give them a moment before the print dialog opens.
  setTimeout(() => win.print(), 1500);
  return true;
}
