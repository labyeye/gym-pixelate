import io

p = r"D:\projects\Pixelate Nest\NestGym\frontend\src\pages\SettingsPage.tsx"
s = io.open(p, newline="", encoding="utf-8").read()
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")


def need(a, b, count=1):
    global s
    assert a in s, a
    s = s.replace(a, b, count)


need('import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";', 'import { Tabs, TabsContent } from "@/components/ui/tabs";')
need('import { Loader2, Plus, Building2 } from "lucide-react";', 'import { Loader2, Plus, Building2, GitBranch, Users, LayoutGrid, FileText, Receipt } from "lucide-react";')
need('import InvoiceDesigner', 'import { chequeReceiptHtml, DEFAULT_RECEIPT_DESIGN, SAMPLE_CHEQUE, type ReceiptDesign } from "@/lib/chequeReceipt";\nimport InvoiceDesigner')

need(
    '  const [savingMods, setSavingMods] = useState(false);\n',
    '''  const [savingMods, setSavingMods] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptDesign>(DEFAULT_RECEIPT_DESIGN);
  const [savingReceipt, setSavingReceipt] = useState(false);
''',
)
need(
    "    if (d) setMods(d.modules || {});",
    "    if (d) setMods(d.modules || {});\n    if (d) setReceipt({ ...DEFAULT_RECEIPT_DESIGN, ...(d.receiptDesign || {}) });",
)
need(
    "  const branches = branchesRes?.data || [];",
    '''  const saveReceipt = async () => {
    try {
      setSavingReceipt(true);
      await settingsAPI.update({ receiptDesign: receipt });
      queryClient.invalidateQueries({ queryKey: ["gym-settings"] });
      notify.success("Receipt design saved", "Used the next time a receipt is printed.");
    } catch (error: any) {
      notify.error("Save Failed", error.message);
    } finally {
      setSavingReceipt(false);
    }
  };

  const branches = branchesRes?.data || [];''',
)
need(
    "        invoiceTemplate,\n        razorpaySecretSaved,",
    "        invoiceTemplate,\n        receiptDesign,\n        razorpaySecretSaved,",
)

# --- layout: header + sidebar, replacing the horizontal TabsList
i = s.index("        <TabsList")
j = s.index("        </TabsList>\n") + len("        </TabsList>\n")
side = '''        <div className="mb-6">
          <h1 className="text-3xl font-display font-bold text-black">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your gym, team, modules and print designs
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-0 border-2 border-black bg-white">
          <aside className="md:w-56 shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-black bg-white flex flex-col">
            {(
              [
                { group: "Gym", items: [
                  { id: "general", label: "General Info", icon: Building2 },
                  { id: "branches", label: "Branches", icon: GitBranch },
                  { id: "staff", label: "Users / Staff", icon: Users },
                ] },
                ...(isOwner
                  ? [{ group: "Customise", items: [
                      { id: "modules", label: "Modules", icon: LayoutGrid },
                      { id: "invoice", label: "Invoice design", icon: FileText },
                      { id: "receipt", label: "Receipt design", icon: Receipt },
                    ] }]
                  : []),
              ] as { group: string; items: { id: string; label: string; icon: any }[] }[]
            ).map((g) => (
              <div key={g.group} className="border-b-2 border-black last:border-b-0">
                <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-gray-50 border-b border-black/10">
                  {g.group}
                </p>
                {g.items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id);
                      if (t.id === "invoice") setDesignerOpened(true);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-left transition-all border-b border-black/10 last:border-b-0",
                      tab === t.id ? "bg-[#024BAB] text-white" : "text-black hover:bg-[#F0F6FF]",
                    )}
                  >
                    <t.icon className="w-4 h-4 shrink-0" />
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <div className="flex-1 min-w-0 p-6">
'''
s = s[:i] + side + s[j:]

# panels lose their own frame
s = s.replace('className="border-2 border-black bg-white p-5 mt-3 max-w-3xl"', 'className="max-w-3xl"')
s = s.replace('<TabsContent value="modules" className="border-2 border-black bg-white p-5 mt-3 max-w-3xl">', '<TabsContent value="modules" className="max-w-3xl">')

# receipt tab before branches
need(
    '        <TabsContent value="branches" className="mt-3">',
    '''        {isOwner && (
          <TabsContent value="receipt" className="max-w-5xl">
            <p className="text-xs font-bold text-black/60 mb-4">
              Design the receipt you hand to members for membership and invoice payments. The cheque style prints the amount
              in words, a date box row, an A/C Payee crossing and a signature line, like a bank cheque.
            </p>
            <div className="grid lg:grid-cols-5 gap-5">
              <div className="lg:col-span-2 space-y-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest">Template</label>
                  <div className="flex border-2 border-black">
                    {(["standard", "cheque"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setReceipt({ ...receipt, style: k })}
                        className={cn(
                          "flex-1 px-3 py-2 text-sm font-bold border-r-2 border-black last:border-r-0 capitalize",
                          receipt.style === k ? "bg-[#024BAB] text-white" : "bg-white hover:bg-[#F0F6FF]",
                        )}
                      >
                        {k === "cheque" ? "Cheque template" : "Standard invoice"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-black/50">Standard uses your Invoice design.</p>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest">Accent colour</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={receipt.accent}
                      onChange={(e) => setReceipt({ ...receipt, accent: e.target.value })}
                      className="w-12 h-10 border-2 border-black p-0.5 bg-white"
                    />
                    <input
                      className="border-2 flex-1 px-3 py-2.5 text-sm"
                      value={receipt.accent}
                      onChange={(e) => setReceipt({ ...receipt, accent: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest">Signatory</label>
                  <input
                    className="border-2 w-full px-3 py-2.5 text-sm"
                    value={receipt.signatory}
                    onChange={(e) => setReceipt({ ...receipt, signatory: e.target.value })}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest">Footer note</label>
                  <textarea
                    rows={3}
                    className="border-2 w-full px-3 py-2.5 text-sm resize-none"
                    value={receipt.note}
                    onChange={(e) => setReceipt({ ...receipt, note: e.target.value })}
                    maxLength={200}
                  />
                </div>
                {(
                  [
                    ["showWords", "Amount in words"],
                    ["showCrossing", "A/C PAYEE crossing"],
                    ["showLogo", "Gym logo"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[#024BAB]"
                      checked={receipt[k]}
                      onChange={(e) => setReceipt({ ...receipt, [k]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
                <button
                  onClick={saveReceipt}
                  disabled={savingReceipt}
                  className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {savingReceipt && <Loader2 className="w-4 h-4 animate-spin" />} Save receipt design
                </button>
              </div>
              <div className="lg:col-span-3">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1">Preview (sample data)</p>
                <iframe
                  title="Receipt preview"
                  className="w-full h-[360px] border-2 border-black bg-white"
                  srcDoc={chequeReceiptHtml(
                    {
                      ...SAMPLE_CHEQUE,
                      company: {
                        name: profile.companyName || SAMPLE_CHEQUE.company.name,
                        address: profile.companyAddress || SAMPLE_CHEQUE.company.address,
                        phone: profile.companyPhone || SAMPLE_CHEQUE.company.phone,
                        gst: profile.companyGST || SAMPLE_CHEQUE.company.gst,
                        logoUrl: profile.logoUrl,
                      },
                    },
                    receipt,
                  )}
                />
                {receipt.style === "standard" && (
                  <p className="text-[11px] text-black/50 mt-1">
                    Standard is selected, so receipts print with your Invoice design. The preview shows the cheque look.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="branches" className="mt-3">''',
)

# close the extra wrappers right before </Tabs>
need("        </TabsContent>\n      </Tabs>", "        </TabsContent>\n          </div>\n        </div>\n      </Tabs>")
io.open(p, "w", newline="", encoding="utf-8").write(s.replace("\n", "\r\n") if crlf else s)
print("ok")
