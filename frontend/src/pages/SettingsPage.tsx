import { PhotoUpload } from "@/components/gym/PhotoUpload";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { authAPI, settingsAPI, usersAPI } from "@/services/api";
import { branchService } from "@/services/branchService";
import { useNotify } from "@/components/ui/Notification";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Loader2, Plus, Building2, GitBranch, Users, LayoutGrid, FileText, Receipt, ShieldCheck, MessageCircle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { MODULES, moduleOn } from "@/config/modules";
import { chequeReceiptHtml, DEFAULT_RECEIPT_DESIGN, SAMPLE_CHEQUE, type ReceiptDesign } from "@/lib/chequeReceipt";
import InvoiceDesigner from "@/components/settings/invoice-designer/InvoiceDesigner";
import RemindersSettings from "@/components/settings/RemindersSettings";
import TrashSettings from "@/components/settings/TrashSettings";
import SecuritySettings from "@/components/settings/SecuritySettings";

const STAFF_ROLES = ["branch_manager", "receptionist", "trainer", "accountant"];
const PROFILE0 = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyGST: "",
  companyPAN: "",
  invoicePrefix: "INV",
  invoiceFooter: "",
  companyWebsite: "",
  companyState: "",
  companyStateCode: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIFSC: "",
  bankBranch: "",
  bankAccountType: "",
  invoiceTerms: [] as string[],
  gymTiming: { open: "06:00", close: "22:00" },
  onlinePaymentsEnabled: false,
  razorpayKeyId: "",
  razorpayKeySecret: "",
  razorpaySecretSaved: false,
  razorpayWebhookSecret: "",
  razorpayWebhookSecretSaved: false,
};

export default function SettingsPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<any>(PROFILE0);
  const [saving, setSaving] = useState(false);
  const { user, setModules, updateUser } = useAuth();
  const isOwner = user?.role === "gym_owner";
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") || "general");
  const [designerOpened, setDesignerOpened] = useState(false);
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [savingMods, setSavingMods] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptDesign>(DEFAULT_RECEIPT_DESIGN);
  const [savingReceipt, setSavingReceipt] = useState(false);

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchCity, setBranchCity] = useState("");
  const [branchPhone, setBranchPhone] = useState("");

  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "receptionist",
  });

  const { data: branchesRes, isLoading: branchesLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchService.getAll(),
  });
  const { data: usersRes, isLoading: usersLoading } = useQuery({
    queryKey: ["staff-users"],
    queryFn: () => usersAPI.getAll(),
  });

  const { data: settingsRes } = useQuery({
    queryKey: ["gym-settings"],
    queryFn: () => settingsAPI.get(),
  });
  useEffect(() => {
    const d = settingsRes?.data;
    if (d)
      setProfile({
        ...PROFILE0,
        ...d,
        gymTiming: { ...PROFILE0.gymTiming, ...(d.gymTiming || {}) },
      });
    if (d) setMods(d.modules || {});
    if (d) setReceipt({ ...DEFAULT_RECEIPT_DESIGN, ...(d.receiptDesign || {}) });
  }, [settingsRes]);

  const saveModules = async () => {
    try {
      setSavingMods(true);
      const res = await settingsAPI.update({ modules: mods });
      setModules(res.data?.modules || mods);
      queryClient.invalidateQueries({ queryKey: ["gym-settings"] });
      notify.success("Modules saved", "Menu updated for everyone.");
    } catch (error: any) {
      notify.error("Save Failed", error.message);
    } finally {
      setSavingMods(false);
    }
  };

  const saveReceipt = async () => {
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

  const branches = branchesRes?.data || [];
  const users = usersRes?.data || [];

  const handleSaveGeneral = async () => {
    try {
      setSaving(true);
      if (
        profile.companyGST &&
        !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
          profile.companyGST.trim().toUpperCase(),
        )
      )
        throw new Error(
          "GSTIN looks wrong — it should be 15 characters, e.g. 27ABCDE1234F1Z5",
        );
      const {
        _id,
        tenantId,
        createdAt,
        updatedAt,
        __v,
        permissions,
        modules,
        invoiceTemplate,
        receiptDesign,
        razorpaySecretSaved,
        razorpayKeySecret,
        razorpayWebhookSecretSaved,
        razorpayWebhookSecret,
        ...body
      } = profile;
      if (razorpayKeySecret)
        (body as any).razorpayKeySecret = razorpayKeySecret; // write-only; blank keeps the saved secret
      if (razorpayWebhookSecret)
        (body as any).razorpayWebhookSecret = razorpayWebhookSecret; // write-only
      await settingsAPI.update({
        ...body,
        companyGST: (body.companyGST || "").trim().toUpperCase(),
      });
      notify.success("Settings Saved");
    } catch (error: any) {
      notify.error("Save Failed", error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await branchService.create({
        name: branchName,
        address: branchAddress,
        city: branchCity,
        phone: branchPhone,
        isActive: true,
      } as any);
      notify.success("Branch Added");
      setBranchModalOpen(false);
      setBranchName("");
      setBranchAddress("");
      setBranchCity("");
      setBranchPhone("");
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    } catch (error: any) {
      notify.error("Save Failed", error.message);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await usersAPI.create(staffForm);
      notify.success("Staff Invited");
      setStaffModalOpen(false);
      setStaffForm({ name: "", email: "", password: "", role: "receptionist" });
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
    } catch (error: any) {
      notify.error("Save Failed", error.message);
    }
  };

  return (
    <AppLayout title="Settings">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          if (v === "invoice") setDesignerOpened(true);
        }}
      >
        <div className="mb-6">
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
                { group: "Account", items: [
                  { id: "security", label: "Security", icon: ShieldCheck },
                ] },
                ...(isOwner
                  ? [{ group: "Customise", items: [
                      { id: "modules", label: "Modules", icon: LayoutGrid },
                      { id: "invoice", label: "Invoice design", icon: FileText },
                      { id: "receipt", label: "Receipt design", icon: Receipt },
                      { id: "reminders", label: "WhatsApp", icon: MessageCircle },
                      { id: "bin", label: "Recycle bin", icon: Trash2 },
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

        <TabsContent
          value="general"
          className="max-w-3xl"
        >
          <p className="text-xs font-bold text-black/60 mb-4">
            These details print on every GST invoice and receipt.
          </p>
          <div className="space-y-1 mb-4">
            <label className="block text-[10px] font-black uppercase tracking-widest text-black">
              Your profile photo
            </label>
            <PhotoUpload
              value={user?.avatar ?? ""}
              name={user?.name || "U"}
              onChange={async (url) => {
                try {
                  await authAPI.updateProfile({ avatar: url });
                  updateUser({ avatar: url });
                  notify.success(url ? "Photo saved" : "Photo removed");
                } catch (e: any) {
                  notify.error("Could not save photo", e.message);
                }
              }}
              hint="Shown in the top bar. JPG, PNG or WebP, up to 5 MB."
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Gym / business name
              </label>
              <input
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.companyName ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, companyName: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Phone
              </label>
              <PhoneInput
                value={profile.companyPhone ?? ""}
                onChange={(v) => setProfile({ ...profile, companyPhone: v })}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Email
              </label>
              <input
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.companyEmail ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, companyEmail: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                GSTIN
              </label>
              <input
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.companyGST ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, companyGST: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                PAN
              </label>
              <input
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.companyPAN ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, companyPAN: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Invoice prefix
              </label>
              <input
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.invoicePrefix ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, invoicePrefix: e.target.value })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Gym logo
              </label>
              <PhotoUpload
                value={profile.logoUrl ?? ""}
                name={profile.companyName || "G"}
                onChange={(url) => setProfile({ ...profile, logoUrl: url })}
                hint="Printed on invoices. JPG, PNG or WebP, up to 5 MB — saved on our server."
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Address
              </label>
              <textarea
                rows={2}
                className="border-2 w-full px-3 py-2 text-sm resize-none"
                value={profile.companyAddress ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, companyAddress: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Opens at
              </label>
              <input
                type="time"
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.gymTiming?.open ?? ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    gymTiming: { ...profile.gymTiming, open: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Closes at
              </label>
              <input
                type="time"
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.gymTiming?.close ?? ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    gymTiming: { ...profile.gymTiming, close: e.target.value },
                  })
                }
              />
            </div>
            <div className="sm:col-span-2 border-2 border-black p-3 space-y-3 bg-[#024BAB]/5">
              <p className="text-[10px] font-black uppercase tracking-widest">
                Member online payments (your own Razorpay account)
              </p>
              <p className="text-xs font-bold text-black/60">
                Members pay dues from their portal; money goes straight to your
                Razorpay. Use your Razorpay Key ID and Key Secret.
              </p>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={!!profile.onlinePaymentsEnabled}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      onlinePaymentsEnabled: e.target.checked,
                    })
                  }
                />{" "}
                Accept online payments
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  className="border-2 w-full px-3 py-2.5 text-sm"
                  placeholder="Key ID (rzp_live_…)"
                  value={profile.razorpayKeyId ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, razorpayKeyId: e.target.value })
                  }
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  className="border-2 w-full px-3 py-2.5 text-sm"
                  placeholder={
                    profile.razorpaySecretSaved
                      ? "Secret saved — type to replace"
                      : "Key Secret"
                  }
                  value={profile.razorpayKeySecret ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      razorpayKeySecret: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">
                  Optional but recommended: in Razorpay Dashboard &gt; Webhooks add this URL
                  with events <b>payment.captured</b> and <b>order.paid</b>, then paste the
                  webhook secret here. Payments are then recorded even if the member closes
                  the page.
                </p>
                <input
                  readOnly
                  className="border-2 w-full px-3 py-2.5 text-xs bg-muted/40"
                  value={`${import.meta.env.VITE_API_URL}/webhooks/razorpay/${profile.tenantId ?? ""}`}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  className="border-2 w-full px-3 py-2.5 text-sm"
                  placeholder={
                    profile.razorpayWebhookSecretSaved
                      ? "Webhook secret saved — type to replace"
                      : "Webhook secret"
                  }
                  value={profile.razorpayWebhookSecret ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, razorpayWebhookSecret: e.target.value })
                  }
                />
              </div>
            </div>
            {(
              [
                ["Website", "companyWebsite", "www.mygym.com"],
                ["State", "companyState", "Maharashtra"],
                ["State code", "companyStateCode", "27"],
                ["Bank name", "bankName", "HDFC Bank"],
                ["Account holder name", "bankAccountName", ""],
                ["Account number", "bankAccountNumber", ""],
                ["IFSC code", "bankIFSC", "HDFC0001234"],
                ["Bank branch", "bankBranch", ""],
                ["Account type", "bankAccountType", "Current"],
              ] as [string, string, string][]
            ).map(([label, key, ph]) => (
              <div className="space-y-1" key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                  {label}
                </label>
                <input
                  className="border-2 w-full px-3 py-2.5 text-sm"
                  placeholder={ph || `Enter ${label.toLowerCase()}`}
                  value={profile[key] ?? ""}
                  onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Terms &amp; conditions (one per line)
              </label>
              <textarea
                rows={3}
                className="border-2 w-full px-3 py-2.5 text-sm"
                placeholder="e.g. Fees once paid are non-refundable"
                value={(profile.invoiceTerms || []).join("\n")}
                onChange={(e) =>
                  setProfile({ ...profile, invoiceTerms: e.target.value.split("\n") })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-black">
                Invoice footer
              </label>
              <input
                className="border-2 w-full px-3 py-2.5 text-sm"
                value={profile.invoiceFooter ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, invoiceFooter: e.target.value })
                }
              />
            </div>
          </div>
          <button
            onClick={handleSaveGeneral}
            disabled={saving}
            className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </TabsContent>

        {isOwner && (
          <TabsContent value="modules" className="max-w-3xl">
            <p className="text-xs font-bold text-black/60 mb-4">
              Switch off what your gym does not use. It disappears from the menu for everyone, and its pages are
              blocked. Your data is kept; switch it back on any time.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((m) => {
                const on = moduleOn(mods, m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMods({ ...mods, [m.key]: !on })}
                    aria-pressed={on}
                    className={cn(
                      "flex items-start gap-3 border-2 border-black p-3 text-left bg-white",
                      on ? "" : "opacity-60",
                    )}
                  >
                    <span
                      className="w-9 h-9 border-2 border-black flex items-center justify-center shrink-0"
                      style={{ backgroundColor: on ? "#024BAB" : "#e5e7eb" }}
                    >
                      <m.icon className={cn("w-4 h-4", on ? "text-white" : "text-black/50")} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-black text-sm">{m.label}</span>
                      <span className="block text-[11px] font-medium text-black/60">{m.desc}</span>
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 px-2 py-0.5 text-[10px] font-black uppercase border-2 border-black",
                        on ? "bg-[#00C48C]" : "bg-white",
                      )}
                    >
                      {on ? "On" : "Off"}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={saveModules}
              disabled={savingMods}
              className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50 mt-5"
            >
              {savingMods && <Loader2 className="w-4 h-4 animate-spin" />} Save modules
            </button>
          </TabsContent>
        )}

        {isOwner && designerOpened && (
          <div className={tab === "invoice" ? "mt-3" : "hidden"}>
            <InvoiceDesigner
              kind="invoice"
              settings={profile}
              active={tab === "invoice"}
              onSaved={(tpl: any) => setProfile((p: any) => ({ ...p, invoiceTemplate: tpl }))}
            />
          </div>
        )}

        {isOwner && (
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

        {isOwner && (
          <TabsContent value="reminders" className="mt-3 max-w-3xl">
            <RemindersSettings />
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="bin" className="mt-3 max-w-3xl">
            <TrashSettings />
          </TabsContent>
        )}

        <TabsContent value="security" className="mt-3">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="branches" className="mt-3">
          <div className="flex justify-end mb-3">
            <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
              <DialogTrigger asChild>
                <button className="nb-btn bg-[#024BAB] text-white px-4 py-2 text-sm flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Add Branch
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md border-2 border-black p-0 gap-0">
                <form onSubmit={handleAddBranch}>
                  <DialogHeader className="border-b-2 border-black bg-[#024BAB] px-5 py-4">
                    <DialogTitle className="text-white font-black uppercase tracking-wider text-base">
                      Add Branch
                    </DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 p-5 bg-white">
                    <input
                      className="border-2 w-full px-3 py-2.5 text-sm"
                      placeholder="Branch name"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      required
                    />
                    <input
                      className="border-2 w-full px-3 py-2.5 text-sm"
                      placeholder="Address"
                      value={branchAddress}
                      onChange={(e) => setBranchAddress(e.target.value)}
                    />
                    <input
                      className="border-2 w-full px-3 py-2.5 text-sm"
                      placeholder="City"
                      value={branchCity}
                      onChange={(e) => setBranchCity(e.target.value)}
                    />
                    <PhoneInput value={branchPhone} onChange={setBranchPhone} />
                  </div>
                  <DialogFooter className="border-t-2 border-black px-5 py-3 flex gap-2 bg-white">
                    <button
                      type="button"
                      onClick={() => setBranchModalOpen(false)}
                      className="nb-btn bg-white text-black px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm"
                    >
                      Save
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="border-2 border-black bg-white divide-y-2 divide-black">
            {branchesLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-[#024BAB]" />
              </div>
            ) : branches.length === 0 ? (
              <p className="text-center py-10 text-xs font-black uppercase text-black/30">
                No branches yet
              </p>
            ) : (
              branches.map((b: any) => (
                <div
                  key={b._id || b.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="font-black text-sm">{b.name}</p>
                    <p className="text-xs text-black/50">{b.address}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="staff" className="mt-3">
          <div className="flex justify-end mb-3">
            <Dialog open={staffModalOpen} onOpenChange={setStaffModalOpen}>
              <DialogTrigger asChild>
                <button className="nb-btn bg-[#024BAB] text-white px-4 py-2 text-sm flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Invite Staff
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md border-2 border-black p-0 gap-0">
                <form onSubmit={handleAddStaff}>
                  <DialogHeader className="border-b-2 border-black bg-[#024BAB] px-5 py-4">
                    <DialogTitle className="text-white font-black uppercase tracking-wider text-base">
                      Invite Staff
                    </DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 p-5 bg-white">
                    <input
                      className="border-2 w-full px-3 py-2.5 text-sm"
                      placeholder="Name"
                      value={staffForm.name}
                      onChange={(e) =>
                        setStaffForm({ ...staffForm, name: e.target.value })
                      }
                      required
                    />
                    <input
                      className="border-2 w-full px-3 py-2.5 text-sm"
                      placeholder="Email"
                      type="email"
                      value={staffForm.email}
                      onChange={(e) =>
                        setStaffForm({ ...staffForm, email: e.target.value })
                      }
                      required
                    />
                    <input
                      className="border-2 w-full px-3 py-2.5 text-sm"
                      placeholder="Password"
                      type="password"
                      value={staffForm.password}
                      onChange={(e) =>
                        setStaffForm({ ...staffForm, password: e.target.value })
                      }
                      required
                    />
                    <Select
                      value={staffForm.role}
                      onValueChange={(v) =>
                        setStaffForm({ ...staffForm, role: v })
                      }
                    >
                      <SelectTrigger className="border-2 border-black bg-white font-bold h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-2 border-black">
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter className="border-t-2 border-black px-5 py-3 flex gap-2 bg-white">
                    <button
                      type="button"
                      onClick={() => setStaffModalOpen(false)}
                      className="nb-btn bg-white text-black px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm"
                    >
                      Save
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="border-2 border-black overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-black bg-[#024BAB]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-white uppercase">
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-white uppercase">
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-white uppercase">
                    Role
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-black text-white uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#024BAB]" />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-10 text-xs font-black uppercase text-black/30"
                    >
                      No staff yet
                    </td>
                  </tr>
                ) : (
                  users.map((u: any, i: number) => (
                    <tr
                      key={u._id || u.id}
                      className={cn(
                        "border-b-2 border-black last:border-b-0",
                        i % 2 === 1 && "bg-[#024BAB]/5",
                      )}
                    >
                      <td className="px-4 py-2.5 font-black">{u.name}</td>
                      <td className="px-4 py-2.5 font-bold">{u.email}</td>
                      <td className="px-4 py-2.5 capitalize font-bold">
                        {u.role?.replace("_", " ")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "nb-badge",
                            u.status === "active"
                              ? "nb-tag-green"
                              : "nb-tag-white",
                          )}
                        >
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
          </div>
        </div>
      </Tabs>
    </AppLayout>
  );
}
