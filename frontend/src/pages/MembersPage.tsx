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
  ScanFace,
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
import { useTrainers } from "@/components/gym/pickers";
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
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any>(null); // "new" | member
  const [form, setForm] = useState<any>(EMPTY);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sell, setSell] = useState<any>(null);
  const trainers = useTrainers();

  const params = useMemo(
    () => ({ page, limit: 25, search, status }),
    [page, search, status],
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
      if (editing === "new") await gym.members.create(body);
      else await gym.members.update(editing._id, body);
      notify.success(
        editing === "new" ? "Member added" : "Member updated",
        form.name,
      );
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e: any) {
      notify.error("Save failed", e.message);
    } finally {
      setSaving(false);
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
          can("Members", "create") && (
            <Btn onClick={openNew}>
              <Plus className="w-4 h-4" /> Add member
            </Btn>
          )
        }
      >
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Name, phone or member code…"
        />
        <select
          className={inputCls + " sm:w-44 font-bold"}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {["active", "inactive", "blacklisted"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Toolbar>

      <DataTable
        head={[
          "Member",
          "Contact",
          "Plan",
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
              <Td>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 border-2 border-black bg-[#024BAB] text-white flex items-center justify-center font-black shrink-0 overflow-hidden">
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
                  <div className="min-w-0">
                    <p className="font-black truncate">{m.name}</p>
                    <p className="text-xs text-black/50 font-bold">
                      {m.memberCode}
                      {m.faceRegistered && (
                        <ScanFace className="inline w-3 h-3 ml-1" />
                      )}
                    </p>
                  </div>
                </div>
              </Td>
              <Td>
                <p className="font-bold">{m.phone}</p>
                <p className="text-xs text-black/50">{m.email}</p>
              </Td>
              <Td>
                {c ? (
                  <div>
                    <p className="font-bold">{c.planName}</p>
                    <Pill value={c.status} />
                  </div>
                ) : (
                  <span className="text-xs font-black uppercase text-black/30">
                    No plan
                  </span>
                )}
              </Td>
              <Td>
                {c ? (
                  <div>
                    <p className="font-bold">{fmtDate(c.endDate)}</p>
                    <p
                      className={
                        left! < 0
                          ? "text-xs font-black text-red-600"
                          : left! <= 7
                            ? "text-xs font-black text-[#FA731C]"
                            : "text-xs text-black/50"
                      }
                    >
                      {left! < 0 ? `${-left!}d ago` : `${left}d left`}
                    </p>
                  </div>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                {c?.due > 0 ? (
                  <span className="font-black text-red-600">{inr(c.due)}</span>
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
                      tone="primary"
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
        tabs={TABS}
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
            {tab < TABS.length - 1 ? (
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
      </Modal>
    </AppLayout>
  );
}
