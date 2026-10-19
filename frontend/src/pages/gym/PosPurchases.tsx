import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FileText, PackageCheck, Paperclip, Plus, Printer, Trash2 } from "lucide-react";
import { gym } from "@/services/gymApi";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  ActionButton,
  Btn,
  DataTable,
  Modal,
  Pager,
  Pill,
  RowActions,
  SearchBox,
  SelectInput,
  Td,
  TextArea,
  TextInput,
  Thumb,
  Toolbar,
  Tr,
  fmtDate,
  fmtDateTime,
  inputCls,
  inr,
} from "@/components/gym/kit";
import { ExportImport } from "@/components/gym/ExportImport";

const line = () => ({ productId: "", quantity: "1", unitCost: "", gstPercent: "" });

/** upload a vendor bill (pdf / photo) and return its URL */
async function uploadBill(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  return (await request<{ url: string }>("/upload/bill", { method: "POST", body: fd })).url;
}

function printGrn(p: any) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const rows = p.items
    .map(
      (i: any) =>
        `<tr><td>${i.sku || ""}</td><td>${i.name}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${inr(i.unitCost, 2)}</td><td style="text-align:right">${inr(i.quantity * i.unitCost, 2)}</td></tr>`,
    )
    .join("");
  w.document.write(`<html><head><title>${p.grnNumber || p.poNumber}</title><style>body{font-family:Arial;padding:28px;color:#111}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #999;padding:6px 8px;font-size:13px;text-align:left}th{background:#eef2fb}h2{margin:0}</style></head><body>
  <h2>Goods Received Note</h2>
  <p><b>GRN:</b> ${p.grnNumber || "— (not received yet)"} &nbsp; <b>PO:</b> ${p.poNumber}<br/><b>Vendor:</b> ${p.vendor}${p.vendorPhone ? " · " + p.vendorPhone : ""}<br/><b>Bill:</b> ${p.billNumber || "—"} ${p.billDate ? "(" + fmtDate(p.billDate) + ")" : ""}<br/><b>Received:</b> ${p.receivedOn ? fmtDate(p.receivedOn) : "—"}</p>
  <table><tr><th>Code</th><th>Product</th><th>Qty</th><th>Unit cost</th><th>Amount</th></tr>${rows}
  <tr><td colspan="4" style="text-align:right">Subtotal</td><td style="text-align:right">${inr(p.subtotal, 2)}</td></tr>
  <tr><td colspan="4" style="text-align:right">GST</td><td style="text-align:right">${inr(p.gst, 2)}</td></tr>
  <tr><td colspan="4" style="text-align:right"><b>Total</b></td><td style="text-align:right"><b>${inr(p.total, 2)}</b></td></tr></table>
  <p style="margin-top:50px">Received by: ____________________ &nbsp;&nbsp; Checked by: ____________________</p>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export function PurchasesTab({ products }: { products: any[] }) {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [vendorF, setVendorF] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ vendor: "", vendorPhone: "", billNumber: "", billDate: "", billFile: "", paidAmount: "", notes: "" });
  const [lines, setLines] = useState([line()]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const attachFor = useRef<any>(null);

  const params = useMemo(() => ({ page, limit: 25, q, status, vendor: vendorF }), [page, q, status, vendorF]);
  const { data, isLoading } = useQuery({ queryKey: ["purchases", params], queryFn: () => gym.purchases.list(params) });
  const rows: any[] = data?.data || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["purchases"] });

  const total = lines.reduce((s, l) => {
    const base = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
    return s + base * (1 + (Number(l.gstPercent) || 0) / 100);
  }, 0);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files?.[0];
    e.target.value = "";
    if (!fl) return;
    try {
      const url = await uploadBill(fl);
      if (attachFor.current) {
        await gym.purchases.setBill(attachFor.current._id, { billFile: url });
        attachFor.current = null;
        notify.success("Bill attached");
        refresh();
      } else setF((x: any) => ({ ...x, billFile: url }));
    } catch (err: any) {
      notify.error("Upload failed", err.message);
    }
  };

  const save = async () => {
    try {
      setBusy(true);
      await gym.purchases.create({
        ...f,
        billDate: f.billDate || undefined,
        paidAmount: Number(f.paidAmount) || 0,
        items: lines
          .filter((l) => l.productId)
          .map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost),
            gstPercent: Number(l.gstPercent) || 0,
          })),
      });
      notify.success("Purchase order saved");
      setOpen(false);
      setLines([line()]);
      setF({ vendor: "", vendorPhone: "", billNumber: "", billDate: "", billFile: "", paidAmount: "", notes: "" });
      refresh();
    } catch (e: any) {
      notify.error("Could not save", e.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      refresh();
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <>
      <input ref={file} type="file" accept=".pdf,image/*" className="hidden" onChange={pickFile} />
      <Toolbar
        right={
          <>
            <ExportImport
              name="purchases"
              rows={rows}
              cols={[
                { header: "PO no", value: (p: any) => p.poNumber },
                { header: "GRN no", value: (p: any) => p.grnNumber },
                { header: "Vendor", value: (p: any) => p.vendor },
                { header: "Bill no", value: (p: any) => p.billNumber },
                { header: "Bill date", value: (p: any) => (p.billDate || "").slice(0, 10) },
                { header: "Items", value: (p: any) => p.items.map((i: any) => `${i.name} x${i.quantity}`).join("; ") },
                { header: "Total", value: (p: any) => p.total },
                { header: "Paid", value: (p: any) => p.paidAmount },
                { header: "Status", value: (p: any) => p.status },
              ]}
            />
            {can("Products", "create") && (
              <Btn onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4" /> New purchase
              </Btn>
            )}
          </>
        }
      >
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="PO, GRN, vendor or bill no…" />
        <select className={inputCls + " sm:w-40 font-bold"} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Status: all</option>
          {["ordered", "received", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className={inputCls + " sm:w-44 font-bold"} value={vendorF} onChange={(e) => { setVendorF(e.target.value); setPage(1); }}>
          <option value="">Vendor: all</option>
          {(data?.vendors || []).map((v: string) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Toolbar>

      <DataTable
        head={["PO no", "GRN no", "Vendor", "Bill", "Items", "Total", "Paid", "Status", "Actions"]}
        loading={isLoading}
        empty={rows.length === 0}
      >
        {rows.map((p, i) => (
          <Tr key={p._id} i={i}>
            <Td className="text-xs font-bold whitespace-nowrap">{p.poNumber}</Td>
            <Td className="text-xs font-bold whitespace-nowrap">{p.grnNumber || "—"}</Td>
            <Td>
              <p className="font-medium">{p.vendor}</p>
              <p className="text-xs text-black/50">{fmtDate(p.createdAt)}</p>
            </Td>
            <Td className="text-xs">
              {p.billNumber || "—"}
              {p.billFile && (
                <a href={p.billFile} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#024BAB] font-bold">
                  <FileText className="w-3 h-3" /> View bill
                </a>
              )}
            </Td>
            <Td className="text-xs">{p.items.map((i: any) => `${i.name} ×${i.quantity}`).join(", ").slice(0, 60)}</Td>
            <Td className="font-medium">{inr(p.total, 2)}</Td>
            <Td className="text-xs">{inr(p.paidAmount, 2)}</Td>
            <Td>
              <Pill value={p.status === "ordered" ? "pending" : p.status === "received" ? "completed" : "cancelled"} />
            </Td>
            <Td>
              <RowActions>
                {p.status === "ordered" && can("Products", "update") && (
                  <ActionButton
                    label="Mark received (issue GRN, add stock)"
                    icon={PackageCheck}
                    onClick={() => act(() => gym.purchases.receive(p._id), "Received — stock added")}
                  />
                )}
                <ActionButton
                  label="Attach / replace bill"
                  icon={Paperclip}
                  onClick={() => {
                    attachFor.current = p;
                    file.current?.click();
                  }}
                />
                <ActionButton label="Print GRN" icon={Printer} onClick={() => printGrn(p)} />
                {p.status === "ordered" && can("Products", "update") && (
                  <ActionButton
                    label="Cancel order"
                    icon={Ban}
                    tone="danger"
                    onClick={() => window.confirm(`Cancel ${p.poNumber}?`) && act(() => gym.purchases.cancel(p._id), "Order cancelled")}
                  />
                )}
              </RowActions>
            </Td>
          </Tr>
        ))}
      </DataTable>
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <Modal
        open={open}
        wide
        title="New purchase"
        subtitle="Vendor, bill and the products bought. Receiving it issues a GRN and adds stock."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn light onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn busy={busy} onClick={save} disabled={!f.vendor.trim() || !lines.some((l) => l.productId)}>
              Save order · {inr(total, 2)}
            </Btn>
          </>
        }
      >
        <div className="grid sm:grid-cols-3 gap-4">
          <TextInput label="Vendor" required value={f.vendor} onChange={(e: any) => setF({ ...f, vendor: e.target.value })} list="vendors-dl" />
          <datalist id="vendors-dl">
            {(data?.vendors || []).map((v: string) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <TextInput label="Vendor phone" value={f.vendorPhone} onChange={(e: any) => setF({ ...f, vendorPhone: e.target.value })} />
          <TextInput label="Bill number" value={f.billNumber} onChange={(e: any) => setF({ ...f, billNumber: e.target.value })} />
          <TextInput label="Bill date" type="date" value={f.billDate} onChange={(e: any) => setF({ ...f, billDate: e.target.value })} />
          <div className="sm:col-span-2 flex items-end gap-3">
            <Btn light onClick={() => { attachFor.current = null; file.current?.click(); }}>
              <Paperclip className="w-4 h-4" /> {f.billFile ? "Replace bill" : "Upload bill (PDF / photo)"}
            </Btn>
            {f.billFile && (
              <a href={f.billFile} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#024BAB] underline pb-2">
                Bill attached — view
              </a>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest">Products</p>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <SelectInput
                  label={i === 0 ? "Product" : "Product "}
                  placeholder="Select product"
                  options={products.map((p) => ({ value: p._id, label: `${p.name}${p.sku ? " · " + p.sku : ""}` }))}
                  value={l.productId}
                  onChange={(v: string) => {
                    const p = products.find((x) => x._id === v);
                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, productId: v, unitCost: x.unitCost || String(p?.costPrice || ""), gstPercent: x.gstPercent || String(p?.gstPercent ?? "") } : x)));
                  }}
                />
              </div>
              <div className="col-span-2"><TextInput label="Qty" type="number" min={1} value={l.quantity} onChange={(e: any) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} /></div>
              <div className="col-span-2"><TextInput label="Unit cost" type="number" min={0} value={l.unitCost} onChange={(e: any) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))} /></div>
              <div className="col-span-2"><TextInput label="GST %" type="number" min={0} value={l.gstPercent} onChange={(e: any) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, gstPercent: e.target.value } : x)))} /></div>
              <div className="col-span-1 pb-1">
                {lines.length > 1 && <ActionButton label="Remove" icon={Trash2} tone="danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />}
              </div>
            </div>
          ))}
          <Btn light onClick={() => setLines((ls) => [...ls, line()])}>
            <Plus className="w-4 h-4" /> Add product
          </Btn>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <TextInput label="Paid to vendor (₹)" type="number" min={0} value={f.paidAmount} onChange={(e: any) => setF({ ...f, paidAmount: e.target.value })} hint="Booked as an expense when received" />
          <TextArea className="sm:col-span-2" label="Notes" value={f.notes} onChange={(e: any) => setF({ ...f, notes: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}

export function SalesTab() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, limit: 25, q, from, to }), [page, q, from, to]);
  const { data, isLoading } = useQuery({ queryKey: ["pos-sales", params], queryFn: () => gym.products.sales(params) });
  const rows: any[] = data?.data || [];
  const prodLines = (v: any) => (v.items || []).filter((i: any) => i.kind === "product");
  return (
    <>
      <Toolbar
        right={
          <ExportImport
            name="pos_sales"
            fetchRows={async () => (await gym.products.sales({ ...params, page: 1, limit: 5000 })).data}
            cols={[
              { header: "Invoice no", value: (v: any) => v.invoiceNumber },
              { header: "Date", value: (v: any) => (v.issuedAt || "").slice(0, 16).replace("T", " ") },
              { header: "Member ID", value: (v: any) => v.memberId?.memberCode || "Walk-in" },
              { header: "Member", value: (v: any) => v.memberId?.name },
              { header: "Products", value: (v: any) => prodLines(v).map((i: any) => `${i.description} x${i.quantity}`).join("; ") },
              { header: "Total", value: (v: any) => v.totalAmount },
              { header: "Paid", value: (v: any) => v.paidAmount },
              { header: "Sold by", value: (v: any) => v.createdBy?.name },
            ]}
          />
        }
      >
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Invoice number…" />
        <input type="date" className={inputCls + " sm:w-40"} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" />
        <input type="date" className={inputCls + " sm:w-40"} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" />
      </Toolbar>
      <DataTable
        head={["Invoice no", "Date", "Gym ID", "Bought by", "What", "Total", "Paid", "Sold by", "Status"]}
        loading={isLoading}
        empty={rows.length === 0}
      >
        {rows.map((v, i) => (
          <Tr key={v._id} i={i}>
            <Td className="text-xs font-bold whitespace-nowrap">{v.invoiceNumber}</Td>
            <Td className="text-xs whitespace-nowrap">{fmtDateTime(v.issuedAt)}</Td>
            <Td className="text-xs font-bold">{v.memberId?.memberCode || "—"}</Td>
            <Td>{v.memberId ? <Thumb photo={v.memberId.photo} name={v.memberId.name} /> : <span className="text-xs text-black/40">Walk-in</span>}</Td>
            <Td className="text-xs">{prodLines(v).map((l: any) => `${l.description} ×${l.quantity}`).join(", ")}</Td>
            <Td className="font-medium">{inr(v.totalAmount, 2)}</Td>
            <Td className="text-xs">{inr(v.paidAmount, 2)}</Td>
            <Td className="text-xs">{v.createdBy?.name || "—"}</Td>
            <Td><Pill value={v.status} /></Td>
          </Tr>
        ))}
      </DataTable>
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />
    </>
  );
}
