import { pdf } from "@react-pdf/renderer";
import { InvoicePDFDocument } from "@/components/pdf/InvoicePDFDocument";
import { resolveLogo, settingsToCompany } from "@/lib/invoicePdf";
import { templateFor, type DocKind } from "@/lib/invoiceTemplate";
import { waDigits } from "@/lib/countries";
import { request } from "@/services/api";

// Workout and diet charts are printed with the same engine (and the same designer) as invoices: each
// exercise / meal becomes an invoice row with its own cell text, the member is the "client".

const nice = (s: any) =>
  String(s ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export type PlanKind = "workout" | "diet";

export function workoutForPdf(plan: any, member?: any) {
  const items: any[] = [];
  for (const d of plan.days || []) {
    items.push({ group: true, description: d.label, details: d.focus });
    for (const e of d.exercises || [])
      items.push({
        description: e.name,
        details: [nice(e.muscleGroup), e.notes].filter(Boolean).join(" · "),
        cells: {
          hsn: `${e.sets ?? 3} x ${e.reps ?? 10}`,
          qty: `${e.restSec ?? 60}s`,
          rate: e.weightKg ? `${e.weightKg} kg` : "-",
        },
      });
  }
  if (plan.notes) {
    items.push({ group: true, description: "Trainer notes" });
    items.push({ description: plan.notes, cells: {} });
  }
  return {
    invoice: {
      invoiceNo: plan.name,
      createdAt: plan.updatedAt || plan.createdAt || new Date(),
      dueText: `${plan.weeks || 4} weeks${plan.level ? " · " + nice(plan.level) : ""}`,
      items,
      plan: { cols: { hsn: "Sets x Reps", qty: "Rest", rate: "Weight" } },
    },
    client: member || plan.memberId || { name: "Member" },
    title: "WORKOUT PLAN",
    labels: { number: "Plan", date: "Date", due: "Duration" },
  };
}

export function dietForPdf(plan: any, member?: any) {
  const target = [
    plan.targetCalories && `${plan.targetCalories} kcal`,
    plan.targetProteinG && `${plan.targetProteinG} g protein`,
    plan.waterLitres && `${plan.waterLitres} L water`,
  ].filter(Boolean);
  const items: any[] = [];
  if (target.length)
    items.push({
      group: true,
      description: "Daily target",
      details: target.join(" · "),
    });
  for (const m of plan.meals || [])
    items.push({
      description: nice(m.slot),
      details: m.items,
      cells: {
        rate: m.proteinG ? `${m.proteinG} g` : "-",
        amt: m.calories ? `${m.calories} kcal` : "-",
      },
    });
  if (plan.supplements) {
    items.push({ group: true, description: "Supplements" });
    items.push({ description: plan.supplements, cells: {} });
  }
  if (plan.avoid) {
    items.push({ group: true, description: "Avoid" });
    items.push({ description: plan.avoid, cells: {} });
  }
  return {
    invoice: {
      invoiceNo: plan.name,
      createdAt: plan.updatedAt || plan.createdAt || new Date(),
      dueText: `${nice(plan.type || "veg")}${plan.goal ? " · " + nice(plan.goal) : ""}`,
      items,
      plan: { cols: { rate: "Protein", amt: "Calories" } },
    },
    client: member || plan.memberId || { name: "Member" },
    title: "DIET PLAN",
    labels: { number: "Plan", date: "Date", due: "Type" },
  };
}

export const planForPdf = (kind: PlanKind, plan: any, member?: any) =>
  kind === "workout" ? workoutForPdf(plan, member) : dietForPdf(plan, member);

// What the designer previews while the owner lays the chart out.
const SAMPLE_WORKOUT = {
  name: "Muscle Gain - Phase 1",
  weeks: 8,
  level: "intermediate",
  notes: "Increase weight when you can finish every set with good form.",
  days: [
    {
      label: "Day 1",
      focus: "Push",
      exercises: [
        {
          name: "Bench Press",
          muscleGroup: "chest",
          sets: 4,
          reps: "8-10",
          restSec: 90,
          weightKg: 40,
        },
        {
          name: "Shoulder Press",
          muscleGroup: "shoulders",
          sets: 3,
          reps: "10",
          restSec: 60,
          weightKg: 20,
        },
        {
          name: "Triceps Pushdown",
          muscleGroup: "triceps",
          sets: 3,
          reps: "12",
          restSec: 60,
        },
      ],
    },
    {
      label: "Day 2",
      focus: "Pull",
      exercises: [
        {
          name: "Lat Pulldown",
          muscleGroup: "back",
          sets: 4,
          reps: "10",
          restSec: 90,
          weightKg: 45,
        },
        {
          name: "Barbell Curl",
          muscleGroup: "biceps",
          sets: 3,
          reps: "12",
          restSec: 60,
          weightKg: 15,
        },
      ],
    },
  ],
};
const SAMPLE_DIET = {
  name: "Lean Bulk 2200",
  type: "veg",
  goal: "muscle_gain",
  targetCalories: 2200,
  targetProteinG: 110,
  waterLitres: 3,
  supplements: "Whey protein after workout, creatine 3 g daily",
  avoid: "Sugary drinks, deep-fried snacks",
  meals: [
    {
      slot: "breakfast",
      items: "Oats with milk, banana, 4 almonds",
      calories: 450,
      proteinG: 18,
    },
    {
      slot: "lunch",
      items: "2 roti, dal, paneer sabzi, salad",
      calories: 650,
      proteinG: 32,
    },
    {
      slot: "post_workout",
      items: "Whey shake, 1 fruit",
      calories: 250,
      proteinG: 25,
    },
    { slot: "dinner", items: "Rice, rajma, curd", calories: 600, proteinG: 22 },
  ],
};
export const PLAN_SAMPLES = {
  workout: () =>
    workoutForPdf(SAMPLE_WORKOUT, {
      name: "Rahul Sharma",
      phone: "9876543210",
    }),
  diet: () =>
    dietForPdf(SAMPLE_DIET, { name: "Rahul Sharma", phone: "9876543210" }),
};

/** The finished PDF for one plan, laid out with the gym's own workout / diet design. */
export async function buildPlanPdf(
  kind: PlanKind,
  plan: any,
  settings: any,
): Promise<Blob> {
  const doc = planForPdf(kind, plan);
  const field = kind === "workout" ? "workoutTemplate" : "dietTemplate";
  return pdf(
    <InvoicePDFDocument
      {...doc}
      company={settingsToCompany(settings)}
      logo={await resolveLogo(settings?.logoUrl)}
      template={templateFor(kind as DocKind, settings?.[field])}
    />,
  ).toBlob();
}

export async function openPlanPdf(kind: PlanKind, plan: any, settings: any) {
  const tab = window.open("", "_blank"); // inside the click, so the browser allows it
  try {
    const url = URL.createObjectURL(await buildPlanPdf(kind, plan, settings));
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/**
 * Makes the PDF, uploads it to this server and opens WhatsApp to the member's number with the message and
 * the download link ready (works without the WhatsApp API, same as the payment-link button).
 * Call straight from a click handler (or pass a tab opened there as `pre`): the WhatsApp tab has to be opened before the first await.
 */
export async function sendPlanOnWhatsApp(
  kind: PlanKind,
  plan: any,
  settings: any,
  pre?: Window | null,
) {
  const member = plan.memberId;
  const digits = waDigits(member?.phone);
  if (!digits) {
    pre?.close();
    throw new Error("This member has no phone number");
  }
  const tab = pre ?? window.open("", "_blank");
  try {
    const blob = await buildPlanPdf(kind, plan, settings);
    const fd = new FormData();
    fd.append(
      "file",
      new File([blob], `${kind}-plan.pdf`, { type: "application/pdf" }),
    );
    const { url } = await request<{ url: string }>("/upload/bill", {
      method: "POST",
      body: fd,
    });
    const gym = settings?.companyName || "the gym";
    const text = `Hi ${member.name}, your ${kind === "workout" ? "workout" : "diet"} plan "${plan.name}" from ${gym} is ready.\nDownload it here: ${url}`;
    const wa = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    if (tab) tab.location.href = wa;
    else window.open(wa, "_blank");
  } catch (e) {
    tab?.close();
    throw e;
  }
}
