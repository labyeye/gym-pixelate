import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Dumbbell,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { request } from "@/services/api";
import { usersAPI } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  PhoneField,
  ActionButton,
  Btn,
  DataTable,
  Modal,
  Pill,
  RowActions,
  SelectInput,
  StatCard,
  StatGrid,
  Td,
  TextArea,
  TextInput,
  Tr,
  inr,
} from "@/components/gym/kit";
import { MemberPicker } from "@/components/gym/pickers";
import { PhotoUpload } from "@/components/gym/PhotoUpload";

const blank = {
  name: "",
  email: "",
  password: "",
  phone: "",
  specializations: "",
  certifications: "",
  experienceYears: "",
  ptRate: "",
  commissionPercent: "",
  shift: "",
  maxClients: "",
  bio: "",
  avatar: "",
  dob: "",
  gender: "",
  bloodGroup: "",
  address: "",
  city: "",
  pincode: "",
  languages: "",
  joiningDate: "",
  employmentType: "",
  monthlySalary: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelation: "",
  idType: "",
  idNumber: "",
};
const TABS = ["Basic", "Personal", "Professional", "Pay & ID"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ID_TYPES = ["aadhaar", "pan", "driving_license", "passport", "voter_id", "other"];
const dateOnly = (d?: string) => (d ? String(d).slice(0, 10) : "");
const fmtD = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export default function TrainersTeamPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [open, setOpen] = useState<any>(null);
  const [assign, setAssign] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>(blank);
  const [ftab, setFtab] = useState(0);
  const [busy, setBusy] = useState(false);

  const { data: tr, isLoading } = useQuery({
    queryKey: ["trainers-team"],
    queryFn: () => gym.users.list({ role: "trainer" }),
  });
  const { data: asg } = useQuery({
    queryKey: ["trainer-assignments"],
    queryFn: () => request<any>("/trainers?limit=500"),
  });
  const { data: pts } = useQuery({
    queryKey: ["pt", "active"],
    queryFn: () => gym.pt.list({ status: "active" }),
  });

  const trainers: any[] = tr?.data || [];
  const assignments: any[] = (asg?.data || []).filter((a: any) => a.isActive);
  const clientsOf = (id: string) =>
    assignments.filter((a) => (a.trainerId?._id || a.trainerId) === id);
  const ptOf = (id: string) =>
    (pts?.data || []).filter(
      (p: any) => (p.trainerId?._id || p.trainerId) === id,
    );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trainers-team"] });
    qc.invalidateQueries({ queryKey: ["trainer-assignments"] });
    qc.invalidateQueries({ queryKey: ["trainers-list"] });
  };
  const cur = open ? trainers.find((t) => t._id === open._id) || open : null;

  const openEdit = (t?: any) => {
    const p = t?.trainerProfile || {};
    setF(
      t
        ? {
            ...blank,
            name: t.name,
            email: t.email,
            phone: t.phone || "",
            specializations: (p.specializations || []).join(", "),
            certifications: (p.certifications || []).join(", "),
            experienceYears: p.experienceYears ?? "",
            ptRate: p.ptRate ?? "",
            commissionPercent: p.commissionPercent ?? "",
            shift: p.shift || "",
            maxClients: p.maxClients ?? "",
            bio: p.bio || "",
            avatar: t.avatar || "",
            dob: dateOnly(p.dob),
            gender: p.gender || "",
            bloodGroup: p.bloodGroup || "",
            address: p.address || "",
            city: p.city || "",
            pincode: p.pincode || "",
            languages: (p.languages || []).join(", "),
            joiningDate: dateOnly(p.joiningDate),
            employmentType: p.employmentType || "",
            monthlySalary: t.monthlySalary || "",
            emergencyName: p.emergencyContact?.name || "",
            emergencyPhone: p.emergencyContact?.phone || "",
            emergencyRelation: p.emergencyContact?.relation || "",
            idType: p.idProof?.type || "",
            idNumber: p.idProof?.number || "",
          }
        : blank,
    );
    setFtab(0);
    setEdit(t || "new");
  };
  const num = (v: any) => (v === "" ? undefined : Number(v));
  const save = async () => {
    const trainerProfile = {
      specializations: list(f.specializations),
      certifications: list(f.certifications),
      experienceYears: num(f.experienceYears),
      ptRate: num(f.ptRate),
      commissionPercent: num(f.commissionPercent),
      shift: f.shift,
      maxClients: num(f.maxClients),
      bio: f.bio,
      dob: f.dob || undefined,
      gender: f.gender,
      bloodGroup: f.bloodGroup,
      address: f.address,
      city: f.city,
      pincode: f.pincode,
      languages: list(f.languages),
      joiningDate: f.joiningDate || undefined,
      employmentType: f.employmentType,
      emergencyContact: { name: f.emergencyName, phone: f.emergencyPhone, relation: f.emergencyRelation },
      idProof: { type: f.idType, number: f.idNumber },
    };
    try {
      setBusy(true);
      if (edit === "new")
        await usersAPI.create({
          name: f.name,
          email: f.email,
          password: f.password,
          phone: f.phone,
          role: "trainer",
          avatar: f.avatar || undefined,
          monthlySalary: num(f.monthlySalary),
          trainerProfile,
        });
      else
        await usersAPI.update(edit._id, {
          name: f.name,
          phone: f.phone,
          avatar: f.avatar,
          monthlySalary: num(f.monthlySalary) ?? 0,
          trainerProfile,
        });
      notify.success("Trainer saved");
      setEdit(null);
      refresh();
    } catch (e: any) {
      notify.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };
  const doAssign = async () => {
    try {
      await request<any>("/trainers/assign", {
        method: "POST",
        body: JSON.stringify({ trainerId: assign._id, memberId: member._id }),
      });
      notify.success("Client assigned", `${member.name} → ${assign.name}`);
      setAssign(null);
      setMember(null);
      refresh();
    } catch (e: any) {
      notify.error("Could not assign", e.message);
    }
  };
  const unassign = async (id: string) => {
    try {
      await request<any>(`/trainers/${id}/unassign`, {
        method: "POST",
        body: "{}",
      });
      refresh();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <AppLayout title="Trainers">
      <StatGrid>
        <StatCard
          label="Trainers"
          value={trainers.filter((t) => t.status === "active").length}
          icon={Dumbbell}
          color="#024BAB"
        />
        <StatCard
          label="Assigned clients"
          value={assignments.length}
          icon={Users}
          color="#00C48C"
        />
        <StatCard
          label="Active PT packages"
          value={pts?.count ?? 0}
          icon={Dumbbell}
          color="#A855F7"
        />
        <StatCard
          label="Avg clients / trainer"
          value={
            trainers.length
              ? (assignments.length / trainers.length).toFixed(1)
              : "0"
          }
          icon={Users}
          color="#FA731C"
        />
      </StatGrid>
      <div className="flex justify-end mb-5">
        {can("Trainers", "create") && (
          <Btn onClick={() => openEdit()}>
            <Plus className="w-4 h-4" /> Add trainer
          </Btn>
        )}
      </div>

      <DataTable
        head={[
          "Trainer",
          "Specialisation",
          "Clients",
          "PT packages",
          "PT rate",
          "Commission",
          "Status",
          "Actions",
        ]}
        loading={isLoading}
        empty={trainers.length === 0}
      >
        {trainers.map((t, i) => {
          const c = clientsOf(t._id).length;
          const max = t.trainerProfile?.maxClients;
          return (
            <Tr key={t._id} i={i} onClick={() => setOpen(t)}>
              <Td>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 border-2 border-black bg-[#024BAB] text-white flex items-center justify-center font-black overflow-hidden">
                    {t.avatar ? (
                      <img
                        src={t.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      t.name[0]
                    )}
                  </div>
                  <div>
                    <p className="font-black">{t.name}</p>
                    <p className="text-xs text-black/50">
                      {t.phone || t.email}
                    </p>
                  </div>
                </div>
              </Td>
              <Td className="text-xs font-bold">
                {(t.trainerProfile?.specializations || []).join(", ") || "—"}
                {t.trainerProfile?.shift && (
                  <p className="text-black/50">{t.trainerProfile.shift}</p>
                )}
              </Td>
              <Td className="font-black">
                {c}
                {max ? (
                  <span className="text-black/40 font-bold"> / {max}</span>
                ) : null}
              </Td>
              <Td className="font-bold">{ptOf(t._id).length}</Td>
              <Td>
                {t.trainerProfile?.ptRate ? inr(t.trainerProfile.ptRate) : "—"}
              </Td>
              <Td>
                {t.trainerProfile?.commissionPercent != null
                  ? `${t.trainerProfile.commissionPercent}%`
                  : "—"}
              </Td>
              <Td>
                <Pill value={t.status} />
              </Td>
              <Td>
                <RowActions>
                  {can("Trainers", "create") && (
                    <ActionButton
                      label="Assign client"
                      icon={UserPlus}
                      tone="primary"
                      onClick={() => {
                        setAssign(t);
                        setMember(null);
                      }}
                    />
                  )}
                  {can("Trainers", "update") && (
                    <ActionButton
                      label="Edit profile"
                      icon={Pencil}
                      onClick={() => openEdit(t)}
                    />
                  )}
                </RowActions>
              </Td>
            </Tr>
          );
        })}
      </DataTable>

      <Modal
        open={!!cur}
        title={cur?.name || ""}
        subtitle={`${clientsOf(cur?._id).length} clients`}
        onClose={() => setOpen(null)}
        footer={
          <Btn light onClick={() => setOpen(null)}>
            Close
          </Btn>
        }
      >
        {cur && (
          <div className="flex gap-4 border-b-2 border-black pb-4">
            <div className="w-20 h-20 border-2 border-black bg-[#024BAB] text-white flex items-center justify-center text-2xl font-black overflow-hidden shrink-0">
              {cur.avatar ? <img src={cur.avatar} alt="" className="w-full h-full object-cover" /> : cur.name?.[0]}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs min-w-0">
              {(
                [
                  ["Phone", cur.phone],
                  ["Email", cur.email],
                  ["Date of birth", fmtD(cur.trainerProfile?.dob)],
                  ["Gender", cur.trainerProfile?.gender],
                  ["Joined", fmtD(cur.trainerProfile?.joiningDate)],
                  ["Experience", cur.trainerProfile?.experienceYears != null ? `${cur.trainerProfile.experienceYears} yrs` : ""],
                  ["Certifications", (cur.trainerProfile?.certifications || []).join(", ")],
                  ["Languages", (cur.trainerProfile?.languages || []).join(", ")],
                ] as [string, string][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="font-black uppercase tracking-wider text-black/50">{k}</dt>
                    <dd className="font-bold truncate">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
        {clientsOf(cur?._id).length === 0 ? (
          <p className="text-xs font-bold uppercase text-black/40">
            No assigned clients
          </p>
        ) : (
          <ul className="divide-y divide-black/10">
            {clientsOf(cur?._id).map((a: any) => (
              <li
                key={a._id}
                className="py-2 flex items-center justify-between"
              >
                <Link
                  className="font-black hover:underline"
                  to={`/members/${a.memberId?._id}`}
                >
                  {a.memberId?.name}
                </Link>
                <span className="text-xs text-black/50">
                  {a.memberId?.phone}
                </span>
                {can("Trainers", "update") && (
                  <ActionButton
                    label="Unassign"
                    icon={UserMinus}
                    tone="danger"
                    onClick={() => unassign(a._id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {cur?.trainerProfile?.bio && (
          <p className="text-sm border-t-2 border-black pt-3">
            {cur.trainerProfile.bio}
          </p>
        )}
      </Modal>

      <Modal
        open={!!assign}
        title={`Assign client to ${assign?.name || ""}`}
        onClose={() => setAssign(null)}
        footer={
          <>
            <Btn light onClick={() => setAssign(null)}>
              Cancel
            </Btn>
            <Btn disabled={!member} onClick={doAssign}>
              Assign
            </Btn>
          </>
        }
      >
        <MemberPicker value={member} onChange={setMember} required />
      </Modal>

      <Modal
        open={!!edit}
        wide
        title={edit === "new" ? "Add trainer" : "Edit trainer"}
        subtitle="Photo, personal details, skills and pay"
        tabs={TABS}
        tab={ftab}
        onTab={setFtab}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Btn light onClick={() => setEdit(null)}>
              Cancel
            </Btn>
            {ftab > 0 && (
              <Btn light onClick={() => setFtab(ftab - 1)}>
                Previous
              </Btn>
            )}
            {ftab < TABS.length - 1 ? (
              <Btn onClick={() => setFtab(ftab + 1)}>Next</Btn>
            ) : (
              <Btn
                busy={busy}
                onClick={save}
                disabled={!f.name || (edit === "new" && (!f.email || f.password.length < 6))}
              >
                Save trainer
              </Btn>
            )}
          </>
        }
      >
        {ftab === 0 && (
          <>
            <PhotoUpload value={f.avatar} name={f.name} onChange={(url) => setF({ ...f, avatar: url })} />
            <div className="grid sm:grid-cols-2 gap-4">
              <TextInput label="Name" required value={f.name} onChange={(e: any) => setF({ ...f, name: e.target.value })} />
              <PhoneField label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
              {edit === "new" && (
                <>
                  <TextInput label="Login email" type="email" required value={f.email} onChange={(e: any) => setF({ ...f, email: e.target.value })} />
                  <TextInput label="Password" type="password" required hint="Min 6 characters" value={f.password} onChange={(e: any) => setF({ ...f, password: e.target.value })} />
                </>
              )}
            </div>
          </>
        )}

        {ftab === 1 && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <TextInput label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={(e: any) => setF({ ...f, dob: e.target.value })} />
              <SelectInput label="Gender" placeholder="Select gender" options={["male", "female", "other"]} value={f.gender} onChange={(v: string) => setF({ ...f, gender: v })} />
              <SelectInput label="Blood group" placeholder="Select blood group" options={BLOOD} value={f.bloodGroup} onChange={(v: string) => setF({ ...f, bloodGroup: v })} />
              <TextInput label="Languages" value={f.languages} onChange={(e: any) => setF({ ...f, languages: e.target.value })} hint="Comma separated: English, Hindi" />
              <TextInput label="City" value={f.city} onChange={(e: any) => setF({ ...f, city: e.target.value })} />
              <TextInput label="Pincode" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e: any) => setF({ ...f, pincode: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
            <TextArea label="Address" value={f.address} onChange={(e: any) => setF({ ...f, address: e.target.value })} />
            <div className="grid sm:grid-cols-3 gap-4">
              <TextInput label="Emergency contact name" value={f.emergencyName} onChange={(e: any) => setF({ ...f, emergencyName: e.target.value })} />
              <PhoneField label="Emergency contact phone" value={f.emergencyPhone} onChange={(v) => setF({ ...f, emergencyPhone: v })} />
              <TextInput label="Relation" value={f.emergencyRelation} onChange={(e: any) => setF({ ...f, emergencyRelation: e.target.value })} />
            </div>
          </>
        )}

        {ftab === 2 && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <TextInput label="Specialisations" value={f.specializations} onChange={(e: any) => setF({ ...f, specializations: e.target.value })} hint="Comma separated: weight training, yoga" />
              <TextInput label="Certifications" value={f.certifications} onChange={(e: any) => setF({ ...f, certifications: e.target.value })} hint="ACE, ISSA, NASM…" />
              <TextInput label="Experience (years)" type="number" min={0} value={f.experienceYears} onChange={(e: any) => setF({ ...f, experienceYears: e.target.value })} />
              <TextInput label="Shift" value={f.shift} onChange={(e: any) => setF({ ...f, shift: e.target.value })} placeholder="06:00-14:00" />
              <TextInput label="Max clients" type="number" min={0} value={f.maxClients} onChange={(e: any) => setF({ ...f, maxClients: e.target.value })} hint="Blocks assigning beyond this" />
            </div>
            <TextArea label="Bio" rows={3} value={f.bio} onChange={(e: any) => setF({ ...f, bio: e.target.value })} />
          </>
        )}

        {ftab === 3 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <TextInput label="Joining date" type="date" value={f.joiningDate} onChange={(e: any) => setF({ ...f, joiningDate: e.target.value })} />
            <SelectInput
              label="Employment type"
              placeholder="Select type"
              options={[
                { value: "full_time", label: "Full time" },
                { value: "part_time", label: "Part time" },
                { value: "freelance", label: "Freelance" },
              ]}
              value={f.employmentType}
              onChange={(v: string) => setF({ ...f, employmentType: v })}
            />
            <TextInput label="Monthly salary (₹)" type="number" min={0} value={f.monthlySalary} onChange={(e: any) => setF({ ...f, monthlySalary: e.target.value })} hint="Used by payroll" />
            <TextInput label="PT rate / session (₹)" type="number" min={0} value={f.ptRate} onChange={(e: any) => setF({ ...f, ptRate: e.target.value })} />
            <TextInput label="Default commission %" type="number" min={0} max={100} value={f.commissionPercent} onChange={(e: any) => setF({ ...f, commissionPercent: e.target.value })} />
            <div />
            <SelectInput label="ID proof" placeholder="Select ID proof" options={ID_TYPES} value={f.idType} onChange={(v: string) => setF({ ...f, idType: v })} />
            <TextInput label="ID number" value={f.idNumber} onChange={(e: any) => setF({ ...f, idNumber: e.target.value })} />
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
