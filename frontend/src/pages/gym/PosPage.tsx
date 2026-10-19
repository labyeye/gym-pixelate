import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  Wallet,
  Boxes,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  ActionButton,
  Btn,
  DataTable,
  Modal,
  Panel,
  Pill,
  RowActions,
  SearchBox,
  SelectInput,
  StatCard,
  StatGrid,
  Tabs,
  Td,
  TextInput,
  Tr,
  inr,
  titleCase,
} from "@/components/gym/kit";
import { MemberPicker } from "@/components/gym/pickers";
import { printInvoice } from "@/components/gym/printInvoice";
import { cn } from "@/lib/utils";

const CATS = [
  "supplement",
  "beverage",
  "snack",
  "apparel",
  "accessory",
  "other",
];
const blank = {
  name: "",
  sku: "",
  category: "supplement",
  price: "",
  costPrice: "",
  gstPercent: "18",
  stock: "0",
  reorderLevel: "5",
  isActive: true,
};

export default function PosPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = useState("sell");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [member, setMember] = useState<any>(null);
  const [method, setMethod] = useState("cash");
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>(blank);
  const [stockFor, setStockFor] = useState<any>(null);
  const [delta, setDelta] = useState("");

  const { data } = useQuery({
    queryKey: ["products", q],
    queryFn: () => gym.products.list({ q, limit: 100 }),
  });
  const products: any[] = data?.data || [];
  const lines = products.filter((p) => cart[p._id]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });

  const totals = useMemo(() => {
    const sub = lines.reduce((s, p) => s + p.price * cart[p._id], 0);
    const disc = Math.min(sub, Number(discount) || 0);
    const gst = lines.reduce(
      (s, p) =>
        s +
        p.price *
          cart[p._id] *
          (1 - (sub ? disc / sub : 0)) *
          (p.gstPercent / 100),
      0,
    );
    return {
      sub,
      disc,
      gst,
      total: Math.round((sub - disc + gst) * 100) / 100,
    };
  }, [lines, cart, discount]);

  const add = (p: any, n = 1) =>
    setCart((c) => {
      const v = (c[p._id] || 0) + n;
      const next = { ...c };
      if (v <= 0) delete next[p._id];
      else next[p._id] = Math.min(v, p.stock);
      return next;
    });

  const checkout = async () => {
    try {
      setBusy(true);
      const r = await gym.products.sell({
        lines: lines.map((p) => ({ productId: p._id, quantity: cart[p._id] })),
        memberId: member?._id,
        method,
        discount: Number(discount) || 0,
      });
      notify.success(
        "Sale complete",
        `${r.data.invoiceNumber} · ${inr(r.data.totalAmount, 2)}`,
      );
      printInvoice(r.data, member || undefined);
      setCart({});
      setMember(null);
      setDiscount("");
      refresh();
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      notify.error("Sale failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const body = {
      ...form,
      price: Number(form.price),
      costPrice: Number(form.costPrice) || 0,
      gstPercent: Number(form.gstPercent),
      stock: Number(form.stock),
      reorderLevel: Number(form.reorderLevel),
    };
    try {
      edit === "new"
        ? await gym.products.create(body)
        : await gym.products.update(edit._id, body);
      notify.success("Product saved");
      setEdit(null);
      refresh();
    } catch (e: any) {
      notify.error("Save failed", e.message);
    }
  };
  const adjust = async () => {
    try {
      await gym.products.stock(stockFor._id, {
        delta: Number(delta),
        reason: "manual adjustment",
      });
      notify.success("Stock updated");
      setStockFor(null);
      setDelta("");
      refresh();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  const low = products.filter((p) => p.isActive && p.stock <= p.reorderLevel);
  const value = products.reduce((s, p) => s + p.stock * (p.costPrice || 0), 0);

  return (
    <AppLayout title="Shop / POS">
      <StatGrid>
        <StatCard
          label="Products"
          value={data?.total ?? 0}
          icon={Boxes}
          color="#024BAB"
        />
        <StatCard
          label="Low stock"
          value={low.length}
          icon={AlertTriangle}
          color={low.length ? "#EF4444" : "#14B8A6"}
        />
        <StatCard
          label="Stock value (cost)"
          value={inr(value)}
          icon={Wallet}
          color="#A855F7"
        />
        <StatCard
          label="In cart"
          value={Object.values(cart).reduce((s, n) => s + n, 0)}
          icon={ShoppingCart}
          color="#FA731C"
        />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "sell", label: "Sell" },
          { id: "stock", label: "Inventory" },
        ]}
      />

      {tab === "sell" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="mb-3">
              <SearchBox
                value={q}
                onChange={setQ}
                placeholder="Search products…"
              />
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {products
                .filter((p) => p.isActive)
                .map((p) => (
                  <button
                    key={p._id}
                    disabled={p.stock <= 0}
                    onClick={() => add(p)}
                    className={cn(
                      "nb-card nb-rise nb-lift p-3 text-left disabled:opacity-40",
                      cart[p._id] && "bg-[#024BAB]/10",
                    )}
                  >
                    <p className="font-black truncate">{p.name}</p>
                    <p className="text-xs font-bold text-black/50 capitalize">
                      {titleCase(p.category)} · {p.gstPercent}% GST
                    </p>
                    <div className="flex justify-between items-end mt-2">
                      <span className="text-lg font-black">{inr(p.price)}</span>
                      <span
                        className={cn(
                          "text-xs font-black uppercase",
                          p.stock <= p.reorderLevel
                            ? "text-red-600"
                            : "text-black/50",
                        )}
                      >
                        {p.stock <= 0 ? "Out of stock" : `${p.stock} left`}
                      </span>
                    </div>
                    {cart[p._id] ? (
                      <span className="nb-badge nb-tag-orange mt-2 inline-block">
                        × {cart[p._id]} in cart
                      </span>
                    ) : null}
                  </button>
                ))}
              {products.length === 0 && (
                <p className="col-span-full text-center py-10 text-sm font-black uppercase text-black/30">
                  No products yet — add some in Inventory.
                </p>
              )}
            </div>
          </div>
          <Panel title="Cart" className="h-fit">
            {lines.length === 0 ? (
              <p className="text-xs font-bold uppercase text-black/40">
                Tap products to add
              </p>
            ) : (
              <ul className="space-y-2 mb-3">
                {lines.map((p) => (
                  <li
                    key={p._id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-bold truncate">{p.name}</span>
                    <span className="flex items-center gap-1">
                      <ActionButton
                        label="Less"
                        icon={Minus}
                        onClick={() => add(p, -1)}
                      />
                      <b className="w-6 text-center">{cart[p._id]}</b>
                      <ActionButton
                        label="More"
                        icon={Plus}
                        onClick={() => add(p, 1)}
                      />
                    </span>
                    <span className="font-black w-20 text-right">
                      {inr(p.price * cart[p._id])}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <MemberPicker
              label="Member (optional)"
              value={member}
              onChange={setMember}
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <SelectInput
                label="Method"
                options={["cash", "upi", "card"]}
                value={method}
                onChange={setMethod}
              />
              <TextInput
                label="Discount (₹)"
                type="number"
                min={0}
                value={discount}
                onChange={(e: any) => setDiscount(e.target.value)}
              />
            </div>
            <div className="border-2 border-black bg-[#024BAB]/5 p-3 text-sm space-y-1 mt-3">
              <p className="flex justify-between font-bold">
                <span>Subtotal</span>
                <span>{inr(totals.sub, 2)}</span>
              </p>
              <p className="flex justify-between font-bold">
                <span>GST</span>
                <span>{inr(totals.gst, 2)}</span>
              </p>
              <p className="flex justify-between font-black text-base border-t-2 border-black pt-1">
                <span>Total</span>
                <span>{inr(totals.total, 2)}</span>
              </p>
            </div>
            <Btn
              className="w-full mt-3"
              color="#00A070"
              busy={busy}
              disabled={!lines.length}
              onClick={checkout}
            >
              <ShoppingCart className="w-4 h-4" /> Charge {inr(totals.total, 2)}
            </Btn>
          </Panel>
        </div>
      )}

      {tab === "stock" && (
        <>
          <div className="flex justify-end mb-3">
            {can("Products", "create") && (
              <Btn
                onClick={() => {
                  setForm(blank);
                  setEdit("new");
                }}
              >
                <Plus className="w-4 h-4" /> Add product
              </Btn>
            )}
          </div>
          <DataTable
            head={[
              "Product",
              "Category",
              "Price",
              "Cost",
              "Stock",
              "Status",
              "Actions",
            ]}
            empty={products.length === 0}
          >
            {products.map((p, i) => (
              <Tr key={p._id} i={i}>
                <Td>
                  <p className="font-black">{p.name}</p>
                  <p className="text-xs text-black/50">{p.sku}</p>
                </Td>
                <Td className="capitalize text-xs font-bold">
                  {titleCase(p.category)}
                </Td>
                <Td className="font-bold">{inr(p.price)}</Td>
                <Td>{inr(p.costPrice)}</Td>
                <Td>
                  <span
                    className={cn(
                      "font-black",
                      p.stock <= p.reorderLevel && "text-red-600",
                    )}
                  >
                    {p.stock}
                  </span>
                  <span className="text-xs text-black/40">
                    {" "}
                    (reorder {p.reorderLevel})
                  </span>
                </Td>
                <Td>
                  <Pill value={p.isActive ? "active" : "inactive"} />
                </Td>
                <Td>
                  <RowActions>
                    <ActionButton
                      label="Adjust stock"
                      icon={PackagePlus}
                      tone="primary"
                      onClick={() => {
                        setStockFor(p);
                        setDelta("");
                      }}
                    />
                    {can("Products", "update") && (
                      <ActionButton
                        label="Edit"
                        icon={Pencil}
                        onClick={() => {
                          setForm({
                            ...blank,
                            ...p,
                            price: String(p.price),
                            costPrice: String(p.costPrice),
                            gstPercent: String(p.gstPercent),
                            stock: String(p.stock),
                            reorderLevel: String(p.reorderLevel),
                          });
                          setEdit(p);
                        }}
                      />
                    )}
                    {can("Products", "delete") && (
                      <ActionButton
                        label="Delete"
                        icon={Trash2}
                        tone="danger"
                        onClick={async () => {
                          if (window.confirm(`Delete ${p.name}?`)) {
                            await gym.products.remove(p._id);
                            refresh();
                          }
                        }}
                      />
                    )}
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </>
      )}

      <Modal
        open={!!edit}
        title={edit === "new" ? "Add product" : "Edit product"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Btn light onClick={() => setEdit(null)}>
              Cancel
            </Btn>
            <Btn onClick={save} disabled={!form.name || form.price === ""}>
              Save
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            className="col-span-2"
            label="Name"
            required
            value={form.name}
            onChange={(e: any) => setForm({ ...form, name: e.target.value })}
          />
          <TextInput
            label="SKU"
            value={form.sku}
            onChange={(e: any) => setForm({ ...form, sku: e.target.value })}
          />
          <SelectInput
            label="Category"
            options={CATS}
            value={form.category}
            onChange={(v: string) => setForm({ ...form, category: v })}
          />
          <TextInput
            label="Selling price (₹)"
            type="number"
            min={0}
            required
            value={form.price}
            onChange={(e: any) => setForm({ ...form, price: e.target.value })}
          />
          <TextInput
            label="Cost price (₹)"
            type="number"
            min={0}
            value={form.costPrice}
            onChange={(e: any) =>
              setForm({ ...form, costPrice: e.target.value })
            }
          />
          <TextInput
            label="GST %"
            type="number"
            min={0}
            value={form.gstPercent}
            onChange={(e: any) =>
              setForm({ ...form, gstPercent: e.target.value })
            }
          />
          <TextInput
            label="Reorder level"
            type="number"
            min={0}
            value={form.reorderLevel}
            onChange={(e: any) =>
              setForm({ ...form, reorderLevel: e.target.value })
            }
          />
          {edit === "new" && (
            <TextInput
              label="Opening stock"
              type="number"
              min={0}
              value={form.stock}
              onChange={(e: any) => setForm({ ...form, stock: e.target.value })}
            />
          )}
        </div>
      </Modal>
      <Modal
        open={!!stockFor}
        title={`Stock — ${stockFor?.name || ""}`}
        subtitle={`Now ${stockFor?.stock} in stock`}
        onClose={() => setStockFor(null)}
        footer={
          <>
            <Btn light onClick={() => setStockFor(null)}>
              Cancel
            </Btn>
            <Btn disabled={!Number(delta)} onClick={adjust}>
              Apply
            </Btn>
          </>
        }
      >
        <TextInput
          label="Change (+ received / − damaged or lost)"
          type="number"
          value={delta}
          onChange={(e: any) => setDelta(e.target.value)}
          placeholder="+24 or -2"
        />
      </Modal>
    </AppLayout>
  );
}
