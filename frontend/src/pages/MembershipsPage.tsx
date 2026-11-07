import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  BadgeCheck,
  CalendarX2,
  IndianRupee,
  Plus,
  Printer,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { usePermission } from "@/hooks/usePermission";
import { SellMembershipModal } from "@/components/gym/SellMembershipModal";
import { PaymentModal } from "@/components/gym/ActionModals";
import { ExportImport } from "@/components/gym/ExportImport";
import { printInvoice } from "@/components/gym/printInvoice";
import {
  ActionButton,
  Btn,
  DataTable,
  Modal,
  Pager,
  Pill,
  RowActions,
  SearchBox,
  StatCard,
  StatGrid,
  Td,
  Thumb,
  Toolbar,
  Tr,
  daysFromNow,
  fmtDate,
  inputCls,
  inr,
  titleCase,
  useDebounced,
} from "@/components/gym/kit";

const STATUSES = [
  "active",
  "upcoming",
  "frozen",
  "expired",
  "cancelled",
  "upgraded",
];

/** Dedicated membership status: who holds which plan, until when, and what is still unpaid. */
export default function MembershipsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [search, setSearch] = useState("");
  const dsearch = useDebounced(search);
  const [status, setStatus] = useState("");
  const [only, setOnly] = useState<"" | "expiring" | "dues">("");
  const [sort, setSort] = useState("-createdAt");
  const [page, setPage] = useState(1);
  const [sell, setSell] = useState<{
    mode: "sell" | "renew" | "upgrade";
    membership?: any;
  } | null>(null);
  const [collect, setCollect] = useState<any>(null);
  const [term, setTerm] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const params = useMemo(
    () => ({
      page,
      limit: 25,
      search: dsearch,
      status,
      sort,
      ...(only === "expiring" ? { expiringInDays: 7 } : {}),
      ...(only === "dues" ? { dues: "true" } : {}),
    }),
    [page, dsearch, status, sort, only],
  );
  const { data, isLoading } = useQuery({
    queryKey: ["memberships", params],
    queryFn: () => gym.memberships.list(params),
  });
  const rows: any[] = data?.data || [];
  const c = (data as any)?.counts || {};
  const pick = (s: string, o: "" | "expiring" | "dues" = "") => {
    setStatus(s);
    setOnly(o);
    setPage(1);
  };

  return (
    <AppLayout title="Memberships">
      <StatGrid>
        <StatCard
          label="Active"
          value={c.active ?? 0}
          icon={BadgeCheck}
          color="#00C48C"
          active={status === "active" && !only}
          onClick={() => pick("active")}
        />
        <StatCard
          label="Expiring ≤ 7 days"
          value={c.expiring ?? 0}
          icon={AlertTriangle}
          color="#FA731C"
          active={only === "expiring"}
          onClick={() => pick("", "expiring")}
        />
        <StatCard
          label="Expired"
          value={c.expired ?? 0}
          icon={CalendarX2}
          color="#EF4444"
          active={status === "expired"}
          onClick={() => pick("expired")}
        />
        <StatCard
          label="With dues"
          value={c.dues ?? 0}
          icon={IndianRupee}
          color="#A855F7"
          active={only === "dues"}
          onClick={() => pick("", "dues")}
        />
      </StatGrid>

      <Toolbar
        right={
          can("Memberships", "create") && (
            <Btn onClick={() => setSell({ mode: "sell" })}>
              <Plus className="w-4 h-4" /> Sell membership
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
          placeholder="Member name, phone or ID…"
        />
        <select
          className={inputCls + " sm:w-44 font-bold"}
          value={status}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">Status: all</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        <select
          className={inputCls + " sm:w-44 font-bold"}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="-createdAt">Newest first</option>
          <option value="endDate">Expiring soonest</option>
          <option value="-endDate">Expiring last</option>
        </select>
      </Toolbar>

      <DataTable
        head={[
          "Member",
          "Plan",
          "Period",
          "Time left",
          "Fees (paid / total)",
          "Fee status",
          "Actions",
        ]}
        loading={isLoading}
        empty={rows.length === 0}
      >
        {rows.map((m, i) => {
          const left = daysFromNow(m.endDate);
          const due = Math.max(0, (m.totalAmount || 0) - (m.paidAmount || 0));
          const live = ["active", "frozen", "upcoming"].includes(m.status);
          return (
            <Tr
              key={m._id}
              i={i}
              onClick={() => navigate(`/members/${m.memberId?._id}`)}
            >
              <Td>
                <Thumb
                  photo={m.memberId?.photo}
                  name={m.memberId?.name || "—"}
                  sub={`${m.memberId?.memberCode || ""} · ${m.memberId?.phone || ""}`}
                />
              </Td>
              <Td className="font-bold">{m.planName || m.planId?.name}</Td>
              <Td className="text-xs whitespace-nowrap">
                {fmtDate(m.startDate)} → {fmtDate(m.endDate)}
              </Td>
              <Td className="whitespace-nowrap">
                {live ? (
                  <span
                    className={
                      left < 0
                        ? "font-bold text-red-600"
                        : left <= 7
                          ? "font-bold text-orange-600"
                          : "font-bold"
                    }
                  >
                    {left < 0 ? `${-left}d overdue` : `${left}d left`}
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                <p className="font-black">{inr(m.totalAmount)}</p>
                <p className="text-xs text-black/50">
                  Paid {inr(m.paidAmount)}
                  {due > 0 && (
                    <span className="text-red-600 font-bold">
                      {" "}
                      · Due {inr(due)}
                    </span>
                  )}
                </p>
              </Td>
              <Td>
                <Pill value={m.status} />
              </Td>
              <Td>
                <RowActions>
                  {can("Memberships", "update") && m.status === "active" && (
                    <ActionButton
                      icon={TrendingUp}
                      label="Change plan"
                      onClick={() =>
                        setSell({ mode: "upgrade", membership: m })
                      }
                    />
                  )}
                  {can("Memberships", "create") &&
                    (live || m.status === "expired") && (
                      <ActionButton
                        icon={RefreshCw}
                        label="Renew"
                        onClick={() =>
                          setSell({ mode: "renew", membership: m })
                        }
                      />
                    )}
                  {can("Memberships", "update") && live && (
                    <ActionButton
                      icon={Ban}
                      label="Terminate"
                      onClick={() => {
                        setReason("");
                        setErr("");
                        setTerm(m);
                      }}
                    />
                  )}
                </RowActions>
              </Td>
            </Tr>
          );
        })}
      </DataTable>
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <PaymentModal
        invoice={collect}
        onClose={() => {
          setCollect(null);
          qc.invalidateQueries({ queryKey: ["memberships"] });
        }}
      />
      <Modal
        open={!!term}
        title="Terminate membership"
        subtitle={
          term
            ? `${term.memberId?.name} · ${term.planName || term.planId?.name}`
            : ""
        }
        onClose={() => setTerm(null)}
        footer={
          <Btn
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await gym.memberships.cancel(term._id, {
                  reason: reason.trim(),
                });
                setTerm(null);
                qc.invalidateQueries({ queryKey: ["memberships"] });
              } catch (e: any) {
                setErr(e?.message || "Could not terminate");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Terminating…" : "Terminate"}
          </Btn>
        }
      >
        <label className="text-xs font-black uppercase">
          Reason (required)
        </label>
        <textarea
          className={inputCls + " mt-1 h-24"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Moving city, medical, member request…"
        />
        {err && <p className="text-xs font-bold text-red-600 mt-2">{err}</p>}
      </Modal>
      <SellMembershipModal
        open={!!sell}
        mode={sell?.mode}
        membership={sell?.membership}
        onClose={() => setSell(null)}
      />
    </AppLayout>
  );
}
