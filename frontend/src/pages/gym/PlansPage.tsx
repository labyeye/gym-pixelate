import { Dumbbell, Layers, Snowflake, Tag, Users } from "lucide-react";
import { ResourcePage } from "@/components/gym/ResourcePage";
import { Check2 } from "@/components/gym/pickers";
import { Pill, StatCard, StatGrid, inr, titleCase } from "@/components/gym/kit";
import { gym } from "@/services/gymApi";

const TYPES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "annual",
  "corporate",
  "custom",
];
const DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  half_yearly: 180,
  annual: 365,
};

export default function PlansPage() {
  return (
    <ResourcePage<any>
      title="Membership Plans"
      noun="plan"
      permission="MembershipPlans"
      api={gym.plans}
      queryKey="plans"
      wide
      filters={[
        { key: "isActive", label: "plans", options: ["true", "false"] },
      ]}
      stats={(rows, total) => (
        <StatGrid cols={5}>
          <StatCard label="Plans" value={total} icon={Layers} color="#024BAB" />
          <StatCard
            label="On sale"
            value={rows.filter((r) => r.isActive).length}
            icon={Tag}
            color="#00C48C"
          />
          <StatCard
            label="Active subscribers"
            value={rows.reduce((n, r) => n + (r.subscribers?.active || 0), 0)}
            icon={Users}
            color="#F59E0B"
          />
          <StatCard
            label="Allow freezing"
            value={rows.filter((r) => r.freezeAllowedDays > 0).length}
            icon={Snowflake}
            color="#14B8A6"
          />
          <StatCard
            label="With classes / PT"
            value={
              rows.filter((r) => r.includes?.classes || r.includes?.ptSessions)
                .length
            }
            icon={Dumbbell}
            color="#A855F7"
          />
        </StatGrid>
      )}
      columns={[
        {
          label: "Plan",
          render: (r) => (
            <div>
              <p className="font-black">{r.name}</p>
              <p className="text-xs text-black/50 capitalize">
                {titleCase(r.category)} · {titleCase(r.type)}
              </p>
            </div>
          ),
        },
        {
          label: "Subscribers",
          render: (r) => (
            <div>
              <p className="font-bold">{r.subscribers?.active ?? 0} active</p>
              <p className="text-xs text-black/50">
                {r.subscribers?.total ?? 0} total
              </p>
            </div>
          ),
        },
        {
          label: "Duration",
          render: (r) => (
            <span className="font-bold">{r.durationDays} days</span>
          ),
        },
        {
          label: "Price",
          render: (r) => (
            <div>
              <p className="font-black">{inr(r.price)}</p>
              <p className="text-xs text-black/50">
                {r.gstPercent}% GST {r.priceIncludesGst ? "incl." : "extra"}
                {r.admissionFee ? ` · +${inr(r.admissionFee)} joining` : ""}
              </p>
            </div>
          ),
        },
        {
          label: "Includes",
          render: (r) => (
            <div className="flex flex-wrap gap-1">
              {r.includes?.classes && (
                <span className="nb-badge nb-tag-purple">Classes</span>
              )}
              {r.includes?.ptSessions > 0 && (
                <span className="nb-badge nb-tag-orange">
                  {r.includes.ptSessions} PT
                </span>
              )}
              {r.includes?.locker && (
                <span className="nb-badge nb-tag-teal">Locker</span>
              )}
              {r.includes?.steamSauna && (
                <span className="nb-badge nb-tag-blue">Steam</span>
              )}
              {r.includes?.dietConsult && (
                <span className="nb-badge nb-tag-green">Diet</span>
              )}
            </div>
          ),
        },
        {
          label: "Freeze",
          render: (r) =>
            r.freezeAllowedDays
              ? `${r.freezeAllowedDays}d × ${r.maxFreezes}`
              : "No",
        },
        { label: "Transfer", render: (r) => <Check2 on={r.transferable} /> },
        {
          label: "Status",
          render: (r) => <Pill value={r.isActive ? "active" : "inactive"} />,
        },
      ]}
      fields={[
        {
          key: "name",
          label: "Plan name",
          required: true,
          placeholder: "Gold – 3 months",
        },
        {
          key: "type",
          label: "Duration type",
          type: "select",
          options: TYPES,
          default: "monthly",
          required: true,
        },
        {
          key: "category",
          label: "Category",
          type: "select",
          options: [
            "gym",
            "cardio",
            "crossfit",
            "yoga",
            "zumba",
            "personal_training",
            "combo",
            "other",
          ],
          default: "gym",
        },
        {
          key: "durationDays",
          label: "Duration (days)",
          type: "number",
          required: true,
          min: 1,
          default: 30,
          hint: "Monthly 30 · Quarterly 90 · Half-yearly 180 · Annual 365",
        },
        {
          key: "price",
          label: "Price (₹)",
          type: "number",
          required: true,
          min: 0,
        },
        {
          key: "admissionFee",
          label: "Joining fee (₹)",
          type: "number",
          default: 0,
          hint: "Charged only on a member's first plan",
        },
        {
          key: "gstPercent",
          label: "GST %",
          type: "number",
          default: 18,
          min: 0,
        },
        {
          key: "priceIncludesGst",
          label: "Price includes GST",
          type: "checkbox",
          hint: "Price already has GST in it",
        },
        {
          key: "freezeAllowedDays",
          label: "Freeze days allowed",
          type: "number",
          default: 0,
          hint: "0 = freezing not allowed",
        },
        { key: "maxFreezes", label: "Max freezes", type: "number", default: 1 },
        {
          key: "gracePeriodDays",
          label: "Grace after expiry (days)",
          type: "number",
          default: 0,
        },
        {
          key: "includes.classes",
          label: "Group classes",
          type: "checkbox",
          hint: "Included",
        },
        {
          key: "includes.classCreditsPerMonth",
          label: "Class credits / month",
          type: "number",
          default: 0,
          hint: "0 = unlimited (if classes included)",
        },
        {
          key: "includes.ptSessions",
          label: "PT sessions included",
          type: "number",
          default: 0,
        },
        {
          key: "includes.locker",
          label: "Locker",
          type: "checkbox",
          hint: "Included",
        },
        {
          key: "includes.steamSauna",
          label: "Steam / sauna",
          type: "checkbox",
          hint: "Included",
        },
        {
          key: "includes.dietConsult",
          label: "Diet consultation",
          type: "checkbox",
          hint: "Included",
        },
        {
          key: "transferable",
          label: "Transferable",
          type: "checkbox",
          hint: "Member may transfer remaining days",
        },
        {
          key: "isActive",
          label: "On sale",
          type: "checkbox",
          default: true,
          hint: "Show in sell-membership list",
        },
        { key: "description", label: "Description", type: "textarea", span: 2 },
      ]}
    />
  );
}
