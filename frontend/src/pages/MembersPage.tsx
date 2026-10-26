import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Eye,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  ShoppingBag,
  UserCheck,
  Users,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import { waDigits } from "@/lib/countries";
import {
  PhoneField,
  ActionButton,
  Btn,
  DataTable,
  Field,
  Modal,
  Pager,
  Pill,
  RowActions,
  SearchBox,
  SelectInput,
  StatCard,
  StatGrid,
  Td,
  TextArea,
  TextInput,
  Toolbar,
  Tr,
  daysFromNow,
  fmtDate,
  inputCls,
  inr,
  toInputDate,
} from "@/components/gym/kit";
import { PhotoUpload } from "@/components/gym/PhotoUpload";
import { useTrainers, usePlans } from "@/components/gym/pickers";
import { ExportImport } from "@/components/gym/ExportImport";
import { SellMembershipModal } from "@/components/gym/SellMembershipModal";

const GOALS = [
  "weight_loss",
  "muscle_gain",
  "strength",
  "endurance",
  "flexibility",
  "general_fitness",
  "rehab",
  "sports",
];
const SOURCES = [
  "walk_in",
  "referral",
  "instagram",
  "facebook",
  "google",
  "website",
  "whatsapp",
  "poster",
  "corporate",
  "other",
];
const CONDITIONS = [
  "Diabetes",
  "Hypertension",
  "Heart condition",
  "Asthma",
  "Thyroid",
  "PCOS",
  "Back pain",
  "Knee issue",
  "Epilepsy",
];
const TABS = ["Basic", "Health (PAR-Q)", "Fitness & Source", "Emergency & ID"];

const get = (o: any, path: string) =>
  path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o: any, path: string, v: any) => {
  const keys = path.split(".");
  const next = { ...o };
  let cur = next;
  keys.slice(0, -1).forEach((k) => {
    cur[k] = { ...(cur[k] || {}) };
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = v;
  return next;
};
const wa = (phone: string, text: string) =>
  `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;
const EMPTY = {
  photo: "",
  name: "",
  phone: "",
  altPhone: "",
  email: "",
  gender: "male",
  dob: "",
  occupation: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  health: {
    bloodGroup: "",
    conditions: [] as string[],
    injuries: "",
    allergies: "",
    medications: "",
    pregnant: false,
    doctorClearance: false,
  },
  fitness: {
    goal: "",
    level: "",
    heightCm: "",
    startWeightKg: "",
    targetWeightKg: "",
    preferredSlot: "",
  },
  source: "walk_in",
  trainerId: "",
  referrerCode: "",
  emergencyContact: { name: "", phone: "", relation: "" },
  idProof: { type: "", number: "" },
  notes: "",
  acceptDeclaration: false,
};

export default function MembersPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fl, setFl] = useState<Record<string, string>>({});
  const plans = usePlans(false);
  const salePlans = usePlans(true);
  const [planId, setPlanId] = useState("");
  const [payNow, setPayNow] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any>(null); // "new" | member
  const [form, setForm] = useState<any>(EMPTY);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sell, setSell] = useState<any>(null);
  const trainers = useTrainers();

  const params = useMemo(
    () => ({ page, limit: 25, search, status, ...fl }),
    [page, search, status, fl],
  );
  const { data, isLoading } = useQuery({
    queryKey: ["members", params],
    queryFn: () => gym.members.list(params),
  });
  const members: any[] = data?.data || [];

  const expiringSoon = members.filter(
    (m) =>
      m.currentMembership?.status === "active" &&
      daysFromNow(m.currentMembership.endDate) <= 7,
  ).length;
  const withDues = members.filter(
    (m) => (m.currentMembership?.due || 0) > 0,
  ).length;
  const lapsed = members.filter(
    (m) => !m.currentMembership || m.currentMembership.status === "expired",
  ).length;

  const openNew = () => {
    setForm(EMPTY);
    setPlanId("");
    setPayNow("");
    setPayMethod("cash");
    setTab(0);
    setEditing("new");
  };
  const openEdit = (m: any) => {
    const f = JSON.parse(
      JSON.stringify({
        ...EMPTY,
        ...m,
        health: { ...EMPTY.health, ...m.health },
        fitness: { ...EMPTY.fitness, ...m.fitness },
        emergencyContact: { ...EMPTY.emergencyContact, ...m.emergencyContact },
        idProof: { ...EMPTY.idProof, ...m.idProof },
      }),
    );
    f.dob = toInputDate(m.dob);
    setForm(f);
    setTab(0);
    setEditing(m);
  };
  const bind = (path: string) => ({
    value: get(form, path) ?? "",
    onChange: (e: any) =>
      setForm((f: any) => set(f, path, e?.target ? e.target.value : e)),
  });

  const plan = salePlans.find((p: any) => p._id === planId);
  const planTotal = plan
    ? Math.round((plan.price + (plan.priceIncludesGst ? 0 : (plan.price * (plan.gstPercent || 0)) / 100)) * 100) / 100
    : 0;
  const months = (d: number) =>
    d >= 30 ? `${Math.round(d / 30)} month${Math.round(d / 30) > 1 ? "s" : ""}` : `${d} days`;
  const tabs = editing === "new" ? [...TABS, "Membership plan"] : TABS;

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setTab(0);
      return notify.error("Name and phone are required");
    }
    const body = JSON.parse(JSON.stringify(form));
    for (const k of ["heightCm", "startWeightKg", "targetWeightKg"])
      body.fitness[k] =
        body.fitness[k] === "" ? undefined : Number(body.fitness[k]);
    if (!body.dob) delete body.dob;
    if (!body.trainerId || editing !== "new") delete body.trainerId; // trainer is picked only when adding; change later from Trainers
    if (!body.idProof.type) delete body.idProof;
    try {
      setSaving(true);
      if (editing === "new") {
        const created: any = await gym.members.create(body);
        if (planId) {
          try {
            const memberId = created?.data?._id;
            const pay = payNow === "" ? planTotal : Number(payNow);
            await gym.memberships.create({
              memberId,
              planId,
              payNow: pay,
              method: payMethod,
              idempotencyKey: `${memberId}-${planId}-${Date.now()}`,
            });
          } catch (e: any) {
            notify.error("Member added, but the plan was not sold", e.message);
          }
        }
      } else await gym.members.update(editing._id, body);
      notify.success(
        editing === "new" ? "Member added" : "Member updated",
        form.name,
      );
      qc.invalidateQueries({ queryKey: ["memberships"] });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e: any) {
      notify.error("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (m: any) => {
    if (!window.confirm(`Delete ${m.name}? Members with invoices or plans are marked inactive instead.`)) return;
    try {
      const r: any = await gym.members.remove(m._id);
      notify.success(r.deactivated ? "Marked inactive (has history)" : "Member deleted", m.name);
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e: any) {
      notify.error("Delete failed", e.message);
    }
  };

  const toggleCondition = (c: string) =>
    setForm((f: any) => {
      const cur: string[] = f.health.conditions || [];
      return set(
        f,
        "health.conditions",
        cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
      );
    });

  return (
    <AppLayout title="Members">
      <StatGrid>
        <StatCard
          label="Total members"
          value={data?.total ?? 0}
          icon={Users}
          color="#024BAB"
          onClick={() => setStatus("")}
        />
        <StatCard
          label="Expiring ≤ 7 days"
          value={expiringSoon}
          icon={CalendarClock}
          color="#FA731C"
          sub="on this page"
        />
        <StatCard
          label="Payment dues"
          value={withDues}
          icon={AlertTriangle}
          color={withDues ? "#EF4444" : "#14B8A6"}
          sub="on this page"
        />
        <StatCard
          label="Lapsed / no plan"
          value={lapsed}
          icon={UserCheck}
          color="#A855F7"
          sub="on this page"
        />
      </StatGrid>

      <Toolbar
        right={
          <>
            <ExportImport
              name="members"
              fetchRows={async () =>
                (await gym.members.list({ ...params, page: 1, limit: 5000 }))
                  .data
              }
              cols={[
                { header: "Member ID", value: (m: any) => m.memberCode },
                { header: "Name", value: (m: any) => m.name },
                { header: "Phone", value: (m: any) => m.phone },
                { header: "Email", value: (m: any) => m.email },
                { header: "Gender", value: (m: any) => m.gender },
                { header: "DOB", value: (m: any) => toInputDate(m.dob) },
                { header: "Goal", value: (m: any) => m.fitness?.goal },
                { header: "Source", value: (m: any) => m.source },
                { header: "Plan", value: (m: any) => m.currentMembership?.planName },
                {
                  header: "Plan status",
                  value: (m: any) => m.currentMembership?.status,
                },
                {
                  header: "Valid till",
                  value: (m: any) => toInputDate(m.currentMembership?.endDate),
                },
                { header: "Dues", value: (m: any) => m.currentMembership?.due || 0 },
                { header: "Status", value: (m: any) => m.status },
              ]}
              importTemplate={{
                headers: ["Name", "Phone", "Email", "Gender", "DOB", "City", "Goal", "Source"],
                example: ["Rahul Sharma", "9876543210", "rahul@example.com", "male", "1995-04-21", "Patna", "weight_loss", "walk_in"],
              }}
              onImportRow={(r) => {
                const name = String(r.Name || "").trim();
                const phone = String(r.Phone || "").trim();
                if (!name || !phone) throw new Error("Name and Phone are required");
                return gym.members.create({
                  name,
                  phone,
                  email: r.Email || undefined,
                  gender: String(r.Gender || "male").toLowerCase(),
                  dob: r.DOB ? new Date(r.DOB).toISOString() : undefined,
                  city: r.City || undefined,
                  fitness: { goal: r.Goal || undefined },
                  source: r.Source || "walk_in",
                });
              }}
              onImported={() => qc.invalidateQueries({ queryKey: ["members"] })}
            />
            {can("Members", "create") && (
              <Btn onClick={openNew}>
                <Plus className="w-4 h-4" /> Add member
              </Btn>
            )}
          </>
        }
      >
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Name, phone or member ID…"
        />
        {(
          [
            ["status", "Status", ["active", "inactive", "blacklisted"]],
            ["planStatus", "Plan status", ["active", "expiring", "expired", "dues", "none"]],
            ["gender", "Gender", ["male", "female", "other"]],
            ["goal", "Goal", GOALS],
            ["source", "Source", SOURCES],
          ] as [string, string, string[]][]
        ).map(([k, label, opts]) => (
          <select
            key={k}
            className={inputCls + " sm:w-40 font-bold"}
            value={k === "status" ? status : fl[k] || ""}
            onChange={(e) => {
              if (k === "status") setStatus(e.target.value);
              else setFl((f) => ({ ...f, [k]: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">{label}: all</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        ))}
        <select
          className={inputCls + " sm:w-40 font-bold"}
          value={fl.plan || ""}
          onChange={(e) => {
            setFl((f) => ({ ...f, plan: e.target.value }));
            setPage(1);
          }}
        >
          <option value="">Plan: all</option>
          {plans.map((pl: any) => (
            <option key={pl._id} value={pl.name}>
              {pl.name}
            </option>
          ))}
        </select>
      </Toolbar>

      <DataTable
        head={[
          "Member ID",
          "Member",
          "Contact",
          "Plan",
          "Plan status",
          "Valid till",
          "Dues",
          "Status",
          "Actions",
        ]}
        loading={isLoading}
        empty={members.length === 0}
      >
        {members.map((m, i) => {
          const c = m.currentMembership;
          const left = c ? daysFromNow(c.endDate) : null;
          return (
            <Tr key={m._id} i={i} onClick={() => navigate(`/members/${m._id}`)}>
              <Td className="text-xs font-bold whitespace-nowrap">
                {m.memberCode}
              </Td>
              <Td>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 border border-black bg-[#024BAB] text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden rounded-full">
                    {m.photo ? (
                      <img
                        src={m.photo}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      m.name[0]?.toUpperCase()
                    )}
                  </div>
                  <p className="font-bold truncate">{m.name}</p>
                </div>
              </Td>
              <Td>
                <p className="font-medium">{m.phone}</p>
                <p className="text-xs text-black/50">{m.email}</p>
              </Td>
              <Td className="font-medium">
                {c ? c.planName : <span className="text-black/30">No plan</span>}
              </Td>
              <Td>{c ? <Pill value={c.status} /> : "—"}</Td>
              <Td className="text-xs">
                {c ? (
                  <div>
                    <p className="font-medium">{fmtDate(c.endDate)}</p>
                    <p
                      className={
                        left! < 0
                          ? "font-bold text-red-600"
                          : left! <= 7
                            ? "font-bold text-[#FA731C]"
                            : "text-black/50"
                      }
                    >
                      {left! < 0 ? `${-left!}d ago` : `${left}d left`}
                    </p>
                  </div>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="text-xs">
                {c?.due > 0 ? (
                  <span className="font-bold text-red-600">{inr(c.due)}</span>
                ) : (
                  <span className="text-black/30">—</span>
                )}
              </Td>
              <Td>
                <Pill value={m.status} />
              </Td>
              <Td>
                <RowActions>
                  <ActionButton
                    label="Open profile"
                    icon={Eye}
                    to={`/members/${m._id}`}
                  />
                  {can("Memberships", "create") && (
                    <ActionButton
                      label={c ? "Renew / sell plan" : "Sell membership"}
                      icon={ShoppingBag}
                      onClick={() => setSell(m)}
                    />
                  )}
                  <ActionButton
                    label="WhatsApp"
                    icon={MessageCircle}
                    onClick={() =>
                      window.open(wa(m.phone, `Hi ${m.name}, `), "_blank")
                    }
                  />
                  {can("Members", "update") && (
                    <ActionButton
                      label="Edit"
                      icon={Pencil}
                      onClick={() => openEdit(m)}
                    />
                  )}
                  {can("Members", "delete") && (
                    <ActionButton
                      label="Delete"
                      icon={Trash2}
                      tone="danger"
                      onClick={() => removeMember(m)}
                    />
                  )}
                </RowActions>
              </Td>
            </Tr>
          );
        })}
      </DataTable>
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <SellMembershipModal
        open={!!sell}
        member={sell}
        onClose={() => setSell(null)}
        mode="sell"
      />

      <Modal
        open={!!editing}
        wide
        title={editing === "new" ? "Add member" : `Edit ${editing?.name || ""}`}
        subtitle={
          editing !== "new"
            ? editing?.memberCode
            : "A member code is generated automatically"
        }
        onClose={() => setEditing(null)}
        tabs={tabs}
        tab={tab}
        onTab={setTab}
        footer={
          <>
            {tab > 0 && (
              <Btn light onClick={() => setTab(tab - 1)}>
                Previous
              </Btn>
            )}
            <Btn light onClick={() => setEditing(null)}>
              Cancel
            </Btn>
            {tab < tabs.length - 1 ? (
              <Btn onClick={() => setTab(tab + 1)}>Next</Btn>
            ) : (
              <Btn busy={saving} onClick={save}>
                Save member
              </Btn>
            )}
          </>
        }
      >
        {tab === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3">
              <PhotoUpload
                value={form.photo || ""}
                name={form.name || ""}
                onChange={(url) => setForm((f: any) => ({ ...f, photo: url }))}
                hint="Optional. You can also add or change it later by editing the member."
              />
            </div>
            <TextInput label="Full name" required {...bind("name")} />
            <PhoneField label="Mobile" required {...bind("phone")} />
            <PhoneField label="Alternate mobile" {...bind("altPhone")} />
            <TextInput label="Email" type="email" {...bind("email")} />
            <SelectInput
              label="Gender"
              options={["male", "female", "other"]}
              {...bind("gender")}
            />
            <TextInput label="Date of birth" type="date" {...bind("dob")} />
            <TextInput label="Occupation" {...bind("occupation")} />
             <TextArea
              className="sm:col-span-2"
              label="Address"
              {...bind("address")}
            />
            <TextInput label="Pincode" {...bind("pincode")} />
            <TextInput label="City" {...bind("city")} />
            <TextInput label="State" {...bind("state")} />
           
          </div>
        )}
        {tab === 1 && (
          <div className="space-y-4">
            <p className="text-xs font-bold text-black/60 border-2 border-black bg-[#FA731C]/10 p-2">
              Health screen before the first workout — trainers see this on the
              member profile.
            </p>
            <Field label="Medical conditions">
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => toggleCondition(c)}
                    className={`nb-badge ${form.health.conditions.includes(c) ? "nb-tag-red" : "nb-tag-white"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectInput
                label="Blood group"
                placeholder="Unknown"
                options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
                {...bind("health.bloodGroup")}
              />
              <TextInput label="Allergies" {...bind("health.allergies")} />
              <TextInput label="Medications" {...bind("health.medications")} />
              <TextInput
                label="Past injuries / surgeries"
                {...bind("health.injuries")}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              {form.gender === "female" && (
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={form.health.pregnant}
                    onChange={(e) =>
                      setForm((f: any) =>
                        set(f, "health.pregnant", e.target.checked),
                      )
                    }
                  />{" "}
                  Pregnant / postnatal
                </label>
              )}
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.health.doctorClearance}
                  onChange={(e) =>
                    setForm((f: any) =>
                      set(f, "health.doctorClearance", e.target.checked),
                    )
                  }
                />{" "}
                Has doctor's clearance
              </label>
            </div>
            {editing === "new" && (
              <label className="flex items-start gap-2 text-sm font-bold border-2 border-black p-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.acceptDeclaration}
                  onChange={(e) =>
                    setForm((f: any) => ({
                      ...f,
                      acceptDeclaration: e.target.checked,
                    }))
                  }
                />{" "}
                Member confirms the health details are correct and accepts the
                gym's liability waiver.
              </label>
            )}
          </div>
        )}
        {tab === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectInput
              label="Primary goal"
              placeholder="—"
              options={GOALS}
              {...bind("fitness.goal")}
            />
            <SelectInput
              label="Experience"
              placeholder="—"
              options={["beginner", "intermediate", "advanced"]}
              {...bind("fitness.level")}
            />
            <TextInput
              label="Height (cm)"
              type="number"
              {...bind("fitness.heightCm")}
            />
            <TextInput
              label="Starting weight (kg)"
              type="number"
              step="0.1"
              {...bind("fitness.startWeightKg")}
            />
            <TextInput
              label="Target weight (kg)"
              type="number"
              step="0.1"
              {...bind("fitness.targetWeightKg")}
            />
            <SelectInput
              label="Preferred slot"
              placeholder="—"
              options={[
                "early_morning",
                "morning",
                "afternoon",
                "evening",
                "night",
              ]}
              {...bind("fitness.preferredSlot")}
            />
            <SelectInput
              label="How did they find us?"
              options={SOURCES}
              {...bind("source")}
            />
            {editing === "new" && (
              <SelectInput label="Trainer (optional)" placeholder="No trainer" options={trainers} {...bind("trainerId")} />
            )}
            {editing === "new" && <TextInput label="Referred by (member code)" placeholder="GYM-00042" {...bind("referrerCode")} />}
            <TextArea
              className="sm:col-span-2"
              label="Notes"
              {...bind("notes")}
            />
          </div>
        )}
        {tab === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Emergency contact name"
              {...bind("emergencyContact.name")}
            />
            <PhoneField
              label="Emergency contact phone"
              {...bind("emergencyContact.phone")}
            />
            <TextInput
              label="Relation"
              {...bind("emergencyContact.relation")}
            />
            <span />
            <SelectInput
              label="ID proof"
              placeholder="None"
              options={[
                "aadhaar",
                "pan",
                "driving_license",
                "passport",
                "voter_id",
                "other",
              ]}
              {...bind("idProof.type")}
            />
            <TextInput label="ID number" {...bind("idProof.number")} />
          </div>
        )}
        {tab === 4 && editing === "new" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <p className="sm:col-span-2 text-sm text-black/60">
              Pick the plan this member is taking and its duration. Leave it empty to add the member now and sell a plan later.
            </p>
            <div className="sm:col-span-2">
              <SelectInput
                label="Membership plan"
                placeholder="No plan yet"
                options={salePlans.map((p: any) => ({
                  value: p._id,
                  label: `${p.name} — ${months(p.durationDays)} · ₹${p.price}`,
                }))}
                value={planId}
                onChange={(e: any) => {
                  setPlanId(e?.target ? e.target.value : e);
                  setPayNow("");
                }}
              />
            </div>
            {plan && (
              <>
                <div className="sm:col-span-2 border-2 border-black bg-[#EFF6FF] p-3 text-sm">
                  <p className="flex justify-between"><span>Duration</span><b>{plan.durationDays} days ({months(plan.durationDays)})</b></p>
                  <p className="flex justify-between"><span>Total with GST</span><b>₹{planTotal}</b></p>
                  {!!plan.admissionFee && (
                    <p className="text-xs text-black/60 mt-1">Joining fee of ₹{plan.admissionFee} is added automatically for new members.</p>
                  )}
                </div>
                <TextInput
                  label="Collect now (₹)"
                  type="number"
                  placeholder={String(planTotal)}
                  value={payNow}
                  onChange={(e: any) => setPayNow(e.target.value)}
                />
                <SelectInput
                  label="Payment method"
                  options={["cash", "upi", "card", "online", "bank_transfer", "cheque"]}
                  value={payMethod}
                  onChange={(e: any) => setPayMethod(e?.target ? e.target.value : e)}
                />
              </>
            )}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
