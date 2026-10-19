p = r"D:\projects\Pixelate Nest\NestGym\frontend\src\pages\MembersPage.tsx"
s = open(p, newline="").read()
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")

# imports
s = s.replace(
    'import { useTrainers } from "@/components/gym/pickers";',
    'import { useTrainers, usePlans } from "@/components/gym/pickers";\nimport { ExportImport } from "@/components/gym/ExportImport";',
    1,
)
s = s.replace("  const [status, setStatus] = useState(\"\");\n",
 '  const [status, setStatus] = useState("");\n  const [fl, setFl] = useState<Record<string, string>>({});\n  const plans = usePlans(false);\n', 1)
s = s.replace("() => ({ page, limit: 25, search, status }),\n    [page, search, status],",
 "() => ({ page, limit: 25, search, status, ...fl }),\n    [page, search, status, fl],", 1)

a = s.index("      <Toolbar")
b = s.index("      <Pager page={page}")
new = '''      <Toolbar
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
                </RowActions>
              </Td>
            </Tr>
          );
        })}
      </DataTable>
'''
s = s[:a] + new + s[b:]
open(p, "w", newline="").write(s.replace("\n", "\r\n") if crlf else s)
print("ok")
