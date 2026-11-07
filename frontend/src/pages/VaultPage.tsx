import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/Notification";
import { Download, Lock, ShieldCheck, Trash2, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { request } from "@/services/api";
import { gym } from "@/services/gymApi";
import { Btn, Panel, fmtDate, inputCls, titleCase } from "@/components/gym/kit";

const API = import.meta.env.VITE_API_URL;
const CATS = [
  "govt_id",
  "license",
  "gst",
  "agreement",
  "insurance",
  "id_proof",
  "medical",
  "invoice",
  "other",
];
const kb = (n = 0) =>
  n > 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Encrypted document vault: nothing is listed or opened until a one-time code (WhatsApp/email) unlocks a 10-minute pass. */
export default function VaultPage() {
  const { confirm } = useConfirm();
  // pass lives in memory only: a refresh locks the vault again
  const [pass, setPass] = useState("");
  const [left, setLeft] = useState(0);
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState("");
  const [docs, setDocs] = useState<any[]>([]);
  const [cat, setCat] = useState("");
  const [title, setTitle] = useState("");
  const [upCat, setUpCat] = useState("other");
  const [forKind, setForKind] = useState<
    "gym" | "member" | "trainer" | "staff"
  >("gym");
  const [who, setWho] = useState("");
  const [people, setPeople] = useState<{ members: any[]; users: any[] }>({
    members: [],
    users: [],
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const H = { "X-Vault-Pass": pass };
  const lock = (m = "") => {
    setPass("");
    setDocs([]);
    setOtp("");
    setMsg(m);
  };
  const call = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.status === 423) lock("Vault locked again. Request a new code.");
      else setMsg(e?.message || "Something went wrong");
      return undefined;
    }
  };

  useEffect(() => {
    if (!pass) return;
    const end = Date.now() + 600000;
    const t = setInterval(() => {
      const s = Math.round((end - Date.now()) / 1000);
      if (s <= 0) lock("Vault locked after 10 minutes.");
      else setLeft(s);
    }, 1000);
    return () => clearInterval(t);
  }, [pass]);

  const load = async (p = pass, c = cat) => {
    const r = await call(() =>
      request<any>(`/vault${c ? `?category=${c}` : ""}`, {
        headers: { "X-Vault-Pass": p },
      }),
    );
    if (r) setDocs(r.data);
  };
  useEffect(() => {
    if (pass) load();
  }, [pass, cat]); // eslint-disable-line

  useEffect(() => {
    if (!pass) return;
    Promise.all([gym.members.list({ limit: 200 }), gym.users.list()])
      .then(([m, u]: any[]) =>
        setPeople({ members: m?.data || [], users: u?.data || [] }),
      )
      .catch(() => {});
  }, [pass]);
  const options =
    forKind === "member"
      ? people.members
      : people.users.filter((u) =>
          forKind === "trainer"
            ? u.role === "trainer"
            : u.role !== "trainer" && u.role !== "gym_owner",
        );

  const sendCode = async () => {
    setBusy(true);
    setMsg("");
    const r = await call(() => request<any>("/vault/otp", { method: "POST" }));
    if (r) setSent(r.via);
    setBusy(false);
  };
  const unlock = async () => {
    setBusy(true);
    setMsg("");
    const r = await call(() =>
      request<any>("/vault/unlock", {
        method: "POST",
        body: JSON.stringify({ otp }),
      }),
    );
    if (r) {
      setPass(r.pass);
      setLeft(600);
      setOtp("");
    }
    setBusy(false);
  };
  const add = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return setMsg("Choose a file first");
    const fd = new FormData();
    if (forKind !== "gym" && !who)
      return setMsg("Choose the person this document belongs to");
    if (forKind === "member") fd.append("memberId", who);
    else if (forKind !== "gym") fd.append("userId", who);
    fd.append("file", f);
    fd.append("title", title || f.name);
    fd.append("category", upCat);
    setBusy(true);
    setMsg("");
    const r = await call(() =>
      request<any>("/vault", { method: "POST", body: fd, headers: H }),
    );
    if (r) {
      setTitle("");
      setWho("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    }
    setBusy(false);
  };
  const view = async (d: any) => {
    // fetch with the pass header, then open the decrypted bytes as a blob (never a plain URL)
    const res = await fetch(`${API}/vault/${d._id}/file`, {
      credentials: "include",
      headers: {
        ...H,
        Authorization: `Bearer ${sessionStorage.getItem("_aft") || ""}`,
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (res.status === 423)
      return lock("Vault locked again. Request a new code.");
    if (!res.ok) return setMsg("Could not open this file");
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const del = async (d: any) => {
    if (
      !(await confirm({
        title: `Delete "${d.title}"?`,
        message: "This cannot be undone.",
        confirmText: "Delete",
        tone: "danger",
      }))
    )
      return;
    await call(() =>
      request<any>(`/vault/${d._id}`, { method: "DELETE", headers: H }),
    );
    load();
  };

  if (!pass)
    return (
      <AppLayout title="Document Vault">
        <div className="max-w-md mx-auto mt-10">
          <Panel title="Vault is locked" right={<Lock className="w-4 h-4" />}>
            <p className="text-sm text-black/60 mb-4">
              Documents are stored encrypted. Get a one-time code on your
              verified WhatsApp number (or email) to open the vault for 10
              minutes.
            </p>
            {!sent ? (
              <Btn onClick={sendCode} disabled={busy}>
                {busy ? "Sending…" : "Send code"}
              </Btn>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-bold text-black/60">
                  Code sent by {sent}. Valid 10 minutes.
                </p>
                <input
                  className={
                    inputCls + " tracking-[0.5em] text-center font-black"
                  }
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                />
                <div className="flex gap-2">
                  <Btn onClick={unlock} disabled={busy || otp.length !== 6}>
                    Unlock
                  </Btn>
                  <button
                    className="text-xs font-black uppercase underline"
                    onClick={sendCode}
                    disabled={busy}
                  >
                    Resend
                  </button>
                </div>
              </div>
            )}
            {msg && (
              <p className="text-xs font-bold text-red-600 mt-3">{msg}</p>
            )}
          </Panel>
        </div>
      </AppLayout>
    );

  return (
    <AppLayout title="Document Vault">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#00C48C]" /> Unlocked ·{" "}
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left
        </p>
        <button
          className="text-xs font-black uppercase underline"
          onClick={() => lock()}
        >
          Lock now
        </button>
      </div>

      <Panel title="Add document" className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <select
            className={inputCls + " font-bold"}
            value={forKind}
            onChange={(e) => {
              setForKind(e.target.value as any);
              setWho("");
            }}
          >
            <option value="gym">For: Gym (licence, GST, agreements...)</option>
            <option value="member">For: Member</option>
            <option value="trainer">For: Trainer</option>
            <option value="staff">For: Staff</option>
          </select>
          {forKind !== "gym" && (
            <select
              className={inputCls + " font-bold"}
              value={who}
              onChange={(e) => setWho(e.target.value)}
            >
              <option value="">Select {forKind}...</option>
              {options.map((o: any) => (
                <option key={o._id} value={o._id}>
                  {o.name}
                  {o.memberCode ? ` (${o.memberCode})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <input
            className={inputCls}
            placeholder="Title (e.g. Aadhaar card)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className={inputCls + " font-bold"}
            value={upCat}
            onChange={(e) => setUpCat(e.target.value)}
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className={inputCls}
          />
          <Btn onClick={add} disabled={busy}>
            <Upload className="w-4 h-4" /> {busy ? "Encrypting…" : "Upload"}
          </Btn>
        </div>
        <p className="text-[11px] text-black/50 mt-2">
          PDF, JPG, PNG or WebP, up to 10 MB. Encrypted before it is saved.
        </p>
        {msg && <p className="text-xs font-bold text-red-600 mt-2">{msg}</p>}
      </Panel>

      <div className="mb-3">
        <select
          className={inputCls + " sm:w-48 font-bold"}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="">Category: all</option>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {titleCase(c)}
            </option>
          ))}
        </select>
      </div>

      <Panel title={`Documents (${docs.length})`}>
        {docs.length === 0 ? (
          <p className="text-xs font-black uppercase tracking-widest text-black/30 py-4 text-center">
            Nothing stored yet
          </p>
        ) : (
          <ul className="divide-y divide-black/10">
            {docs.map((d) => (
              <li
                key={d._id}
                className="py-2 flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-black truncate">{d.title}</p>
                  <p className="text-xs text-black/50 truncate">
                    {titleCase(d.category)} · {kb(d.size)} ·{" "}
                    {fmtDate(d.createdAt)}
                    {d.memberId?.name
                      ? ` \u00b7 Member: ${d.memberId.name}`
                      : d.userId?.name
                        ? ` \u00b7 ${titleCase(d.userId.role)}: ${d.userId.name}`
                        : " \u00b7 Gym"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    title="Open"
                    onClick={() => view(d)}
                    className="p-1.5 border-2 border-black"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => del(d)}
                    className="p-1.5 border-2 border-black text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AppLayout>
  );
}
