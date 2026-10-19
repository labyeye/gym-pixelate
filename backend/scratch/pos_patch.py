import io

ROOT = r"D:\projects\Pixelate Nest\NestGym\frontend\src"


def edit(p, fn):
    s = io.open(p, newline="", encoding="utf-8").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    s = fn(s)
    io.open(p, "w", newline="", encoding="utf-8").write(s.replace("\n", "\r\n") if crlf else s)


def need(s, a, b):
    assert a in s, a
    return s.replace(a, b, 1)


def api(s):
    s = need(
        s,
        "  expenses: resource(\"expenses\"),",
        '''  purchases: {
    list: (p?: any) => get("/purchases", p),
    create: (b: any) => post("/purchases", b),
    receive: (id: string) => post(`/purchases/${id}/receive`),
    cancel: (id: string) => post(`/purchases/${id}/cancel`),
    setBill: (id: string, b: any) =>
      request<any>(`/purchases/${id}/bill`, json("PUT", b)),
  },
  expenses: resource("expenses"),''',
    )
    s = need(
        s,
        "    stock: (id: string, b: any) => post(`/products/${id}/stock`, b),",
        "    stock: (id: string, b: any) => post(`/products/${id}/stock`, b),\n    sales: (p?: any) => get(\"/products/sales\", p),",
    )
    return s


edit(ROOT + r"\services\gymApi.ts", api)


def pos(s):
    s = need(s, "  Tabs,\n  Td,", "  Tabs,\n  Td,\n  Thumb,\n  Toolbar,\n  Pager,\n  Field,\n  inputCls,\n  fmtDate,\n  fmtDateTime,")
    s = need(s, 'import { MemberPicker } from "@/components/gym/pickers";', 'import { MemberPicker } from "@/components/gym/pickers";\nimport { ExportImport } from "@/components/gym/ExportImport";\nimport { PhotoUpload } from "@/components/gym/PhotoUpload";\nimport { PurchasesTab, SalesTab } from "./PosPurchases";')
    s = need(s, '  sku: "",\n  category', '  sku: "",\n  photo: "",\n  vendor: "",\n  category')
    s = need(s, '          { id: "stock", label: "Inventory" },', '          { id: "stock", label: "Inventory" },\n          { id: "purchases", label: "Purchases / GRN" },\n          { id: "history", label: "Sales history" },')
    # inventory tab
    i = s.index('      {tab === "stock" && (')
    j = s.index("      <Modal\n        open={!!edit}")
    s = s[:i] + '''      {tab === "stock" && (
        <>
          <Toolbar
            right={
              <>
                <ExportImport
                  name="products"
                  rows={shown}
                  cols={[
                    { header: "Code", value: (p: any) => p.sku },
                    { header: "Name", value: (p: any) => p.name },
                    { header: "Category", value: (p: any) => p.category },
                    { header: "Selling price", value: (p: any) => p.price },
                    { header: "Cost price", value: (p: any) => p.costPrice },
                    { header: "GST %", value: (p: any) => p.gstPercent },
                    { header: "Stock", value: (p: any) => p.stock },
                    { header: "Reorder level", value: (p: any) => p.reorderLevel },
                    { header: "Vendor", value: (p: any) => p.vendor },
                    { header: "Active", value: (p: any) => (p.isActive ? "Yes" : "No") },
                  ]}
                  importTemplate={{
                    headers: ["Name", "Code", "Category", "Selling price", "Cost price", "GST %", "Opening stock", "Reorder level", "Vendor"],
                    example: ["Whey 1kg", "", "supplement", 2500, 1900, 18, 10, 5, "ABC Nutrition"],
                  }}
                  onImportRow={
                    can("Products", "create")
                      ? (r) => {
                          if (!r.Name) throw new Error("Name is required");
                          return gym.products.create({
                            name: r.Name,
                            sku: r.Code || undefined,
                            category: String(r.Category || "supplement").toLowerCase(),
                            price: Number(r["Selling price"]) || 0,
                            costPrice: Number(r["Cost price"]) || 0,
                            gstPercent: r["GST %"] === "" ? 18 : Number(r["GST %"]),
                            stock: Number(r["Opening stock"]) || 0,
                            reorderLevel: r["Reorder level"] === "" ? 5 : Number(r["Reorder level"]),
                            vendor: r.Vendor || undefined,
                          });
                        }
                      : undefined
                  }
                  onImported={refresh}
                />
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
              </>
            }
          >
            <SearchBox value={q} onChange={setQ} placeholder="Name, code or vendor…" />
            <select className={inputCls + " sm:w-40 font-bold"} value={catF} onChange={(e) => setCatF(e.target.value)}>
              <option value="">Category: all</option>
              {CATS.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </select>
            <select className={inputCls + " sm:w-40 font-bold"} value={stockF} onChange={(e) => setStockF(e.target.value)}>
              <option value="">Stock: all</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </Toolbar>
          <DataTable
            head={["Code", "Product", "Category", "Vendor", "Price", "Cost", "Stock", "Status", "Actions"]}
            empty={shown.length === 0}
          >
            {shown.map((p, i) => (
              <Tr key={p._id} i={i}>
                <Td className="text-xs font-bold whitespace-nowrap">{p.sku || "—"}</Td>
                <Td>
                  <Thumb photo={p.photo} name={p.name} />
                </Td>
                <Td className="capitalize text-xs">{titleCase(p.category)}</Td>
                <Td className="text-xs">{p.vendor || "—"}</Td>
                <Td className="font-medium">{inr(p.price)}</Td>
                <Td>{inr(p.costPrice)}</Td>
                <Td>
                  <span className={cn("font-bold", p.stock <= p.reorderLevel && "text-red-600")}>
                    {p.stock}
                  </span>
                  <span className="text-xs text-black/40"> (reorder {p.reorderLevel})</span>
                </Td>
                <Td>
                  <Pill value={p.isActive ? "active" : "inactive"} />
                </Td>
                <Td>
                  <RowActions>
                    <ActionButton
                      label="Adjust stock"
                      icon={PackagePlus}
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

      {tab === "purchases" && <PurchasesTab products={products} />}
      {tab === "history" && <SalesTab />}

''' + s[j:]
    s = need(
        s,
        "  const low = products.filter",
        '''  const [catF, setCatF] = useState("");
  const [stockF, setStockF] = useState("");
  const shown = products.filter(
    (p) =>
      (!catF || p.category === catF) &&
      (!stockF ||
        (stockF === "out" ? p.stock <= 0 : p.stock <= p.reorderLevel)),
  );
  const low = products.filter''',
    )
    s = need(
        s,
        '''          <TextInput
            className="col-span-2"
            label="Name"''',
        '''          <Field label="Photo" className="col-span-2">
            <PhotoUpload
              value={form.photo || ""}
              name={form.name || "P"}
              onChange={(url) => setForm({ ...form, photo: url })}
            />
          </Field>
          <TextInput
            className="col-span-2"
            label="Name"''',
    )
    s = need(s, '            label="SKU"', '            label="Product code"\n            hint="Leave blank to auto-generate (PRD-0001)"')
    s = need(
        s,
        "          <SelectInput\n            label=\"Category\"",
        '''          <TextInput
            label="Vendor"
            value={form.vendor || ""}
            onChange={(e: any) => setForm({ ...form, vendor: e.target.value })}
          />
          <SelectInput
            label="Category"''',
    )
    # sell cards: show photo
    s = need(
        s,
        '                    <p className="font-black truncate">{p.name}</p>',
        '                    <Thumb photo={p.photo} name={p.name} />',
    )
    return s


edit(ROOT + r"\pages\gym\PosPage.tsx", pos)
print("ok")
