import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Flame,
  Pencil,
  Plus,
  Trash2,
  Apple,
  Dumbbell,
  ClipboardList,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  ActionButton,
  Btn,
  DataTable,
  Field,
  Modal,
  Pill,
  RowActions,
  SelectInput,
  StatCard,
  StatGrid,
  Tabs,
  Td,
  TextArea,
  TextInput,
  Tr,
  fmtDate,
  inputCls,
  titleCase,
} from "@/components/gym/kit";
import { MemberPicker, useTrainers } from "@/components/gym/pickers";

const GOALS = [
  "weight_loss",
  "muscle_gain",
  "strength",
  "endurance",
  "flexibility",
  "general_fitness",
  "rehab",
];
const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "glutes",
  "core",
  "cardio",
  "full_body",
  "other",
];
const SLOTS = [
  "early_morning",
  "breakfast",
  "mid_morning",
  "lunch",
  "evening_snack",
  "pre_workout",
  "post_workout",
  "dinner",
  "bedtime",
];
const ex = () => ({
  name: "",
  muscleGroup: "other",
  sets: "3",
  reps: "10",
  restSec: "60",
  weightKg: "",
});
const day = (n: number) => ({
  label: `Day ${n}`,
  focus: "",
  exercises: [ex()],
});
const meal = () => ({
  slot: "breakfast",
  items: "",
  calories: "",
  proteinG: "",
});
const W0 = {
  name: "",
  goal: "",
  level: "",
  weeks: "4",
  isTemplate: false,
  member: null as any,
  trainerId: "",
  notes: "",
  days: [day(1)],
};
const D0 = {
  name: "",
  type: "veg",
  goal: "",
  targetCalories: "",
  targetProteinG: "",
  waterLitres: "3",
  isTemplate: false,
  member: null as any,
  supplements: "",
  avoid: "",
  meals: [meal()],
};

export default function WorkoutDietPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const trainers = useTrainers();
  const [tab, setTab] = useState("workout");
  const [view, setView] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [w, setW] = useState<any>(W0);
  const [d, setD] = useState<any>(D0);
  const [busy, setBusy] = useState(false);

  const api = tab === "workout" ? gym.workouts : gym.diets;
  const { data, isLoading } = useQuery({
    queryKey: ["plans-" + tab, view],
    queryFn: () =>
      api.list({
        limit: 100,
        ...(view === "templates"
          ? { isTemplate: "true" }
          : view === "assigned"
            ? { isTemplate: "false" }
            : {}),
      }),
  });
  const rows: any[] = data?.data || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["plans-" + tab] });

  const openNew = (src?: any, asCopy = false) => {
    if (tab === "workout") {
      setW(
        src
          ? {
              ...W0,
              ...src,
              weeks: String(src.weeks),
              member: asCopy ? null : src.memberId,
              trainerId: src.trainerId?._id || src.trainerId || "",
              isTemplate: asCopy ? false : src.isTemplate,
              name: asCopy ? `${src.name} (copy)` : src.name,
              days: src.days.map((x: any) => ({
                ...x,
                exercises: x.exercises.map((e: any) => ({
                  ...e,
                  sets: String(e.sets),
                  restSec: String(e.restSec),
                  weightKg: e.weightKg ?? "",
                })),
              })),
            }
          : W0,
      );
    } else {
      setD(
        src
          ? {
              ...D0,
              ...src,
              member: asCopy ? null : src.memberId,
              isTemplate: asCopy ? false : src.isTemplate,
              name: asCopy ? `${src.name} (copy)` : src.name,
              targetCalories: src.targetCalories ?? "",
              targetProteinG: src.targetProteinG ?? "",
              waterLitres: String(src.waterLitres ?? 3),
              meals: src.meals.map((m: any) => ({
                ...m,
                calories: m.calories ?? "",
                proteinG: m.proteinG ?? "",
              })),
            }
          : D0,
      );
    }
    setEdit(src && !asCopy ? src : "new");
  };

  const num = (v: any) =>
    v === "" || v === undefined || v === null ? undefined : Number(v);
  const save = async () => {
    try {
      setBusy(true);
      let body: any;
      if (tab === "workout") {
        if (!w.name.trim()) throw new Error("Give the plan a name");
        body = {
          name: w.name,
          goal: w.goal,
          level: w.level,
          weeks: Number(w.weeks) || 4,
          isTemplate: w.isTemplate,
          notes: w.notes,
          memberId: w.isTemplate ? undefined : w.member?._id,
          trainerId: w.trainerId || undefined,
          days: w.days.map((x: any) => ({
            label: x.label,
            focus: x.focus,
            exercises: x.exercises
              .filter((e: any) => e.name.trim())
              .map((e: any) => ({
                name: e.name,
                muscleGroup: e.muscleGroup,
                sets: Number(e.sets) || 3,
                reps: e.reps,
                restSec: Number(e.restSec) || 60,
                weightKg: num(e.weightKg),
              })),
          })),
        };
        if (!w.isTemplate && !body.memberId)
          throw new Error("Pick a member, or tick 'Save as template'");
      } else {
        if (!d.name.trim()) throw new Error("Give the plan a name");
        body = {
          name: d.name,
          type: d.type,
          goal: d.goal,
          targetCalories: num(d.targetCalories),
          targetProteinG: num(d.targetProteinG),
          waterLitres: num(d.waterLitres),
          isTemplate: d.isTemplate,
          supplements: d.supplements,
          avoid: d.avoid,
          memberId: d.isTemplate ? undefined : d.member?._id,
          meals: d.meals
            .filter((m: any) => m.items.trim())
            .map((m: any) => ({
              slot: m.slot,
              items: m.items,
              calories: num(m.calories),
              proteinG: num(m.proteinG),
            })),
        };
        if (!d.isTemplate && !body.memberId)
          throw new Error("Pick a member, or tick 'Save as template'");
      }
      if (edit === "new") await api.create(body);
      else await api.update(edit._id, body);
      notify.success("Plan saved");
      setEdit(null);
      refresh();
    } catch (e: any) {
      notify.error("Could not save", e.message);
    } finally {
      setBusy(false);
    }
  };

  const upd = (setter: any, st: any) => (patch: any) =>
    setter({ ...st, ...patch });
  const setDayAt = (i: number, patch: any) =>
    setW({
      ...w,
      days: w.days.map((x: any, j: number) =>
        j === i ? { ...x, ...patch } : x,
      ),
    });
  const setExAt = (i: number, k: number, patch: any) =>
    setDayAt(i, {
      exercises: w.days[i].exercises.map((e: any, j: number) =>
        j === k ? { ...e, ...patch } : e,
      ),
    });
  const setMealAt = (i: number, patch: any) =>
    setD({
      ...d,
      meals: d.meals.map((m: any, j: number) =>
        j === i ? { ...m, ...patch } : m,
      ),
    });

  return (
    <AppLayout title="Workout & Diet Plans">
      <StatGrid cols={3}>
        <StatCard
          label={tab === "workout" ? "Workout plans" : "Diet plans"}
          value={data?.total ?? 0}
          icon={tab === "workout" ? Dumbbell : Apple}
          color="#024BAB"
        />
        <StatCard
          label="Templates"
          value={rows.filter((r) => r.isTemplate).length}
          icon={ClipboardList}
          color="#A855F7"
        />
        <StatCard
          label="Assigned to members"
          value={rows.filter((r) => !r.isTemplate).length}
          icon={Flame}
          color="#FA731C"
        />
      </StatGrid>

      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-3 flex-wrap">
          <Tabs
            value={tab}
            onChange={(t) => {
              setTab(t);
              setView("");
            }}
            tabs={[
              { id: "workout", label: "Workout" },
              { id: "diet", label: "Diet" },
            ]}
          />
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { id: "", label: "All" },
              { id: "templates", label: "Templates" },
              { id: "assigned", label: "Assigned" },
            ]}
          />
        </div>
        {can("WorkoutPlans", "create") && (
          <div className="mb-5">
            <Btn onClick={() => openNew()}>
              <Plus className="w-4 h-4" /> New {tab} plan
            </Btn>
          </div>
        )}
      </div>

      <DataTable
        head={[
          "Plan",
          "For",
          "Goal",
          tab === "workout" ? "Structure" : "Targets",
          "Updated",
          "Actions",
        ]}
        loading={isLoading}
        empty={rows.length === 0}
      >
        {rows.map((r, i) => (
          <Tr key={r._id} i={i}>
            <Td>
              <p className="font-black">{r.name}</p>
              {r.isTemplate && (
                <span className="nb-badge nb-tag-purple">Template</span>
              )}
            </Td>
            <Td className="font-bold">
              {r.memberId?.name || <span className="text-black/30">—</span>}
              <p className="text-xs text-black/50">{r.trainerId?.name}</p>
            </Td>
            <Td className="capitalize text-xs font-bold">
              {titleCase(r.goal) || "—"}
            </Td>
            <Td className="text-xs font-bold">
              {tab === "workout"
                ? `${r.days?.length || 0} days · ${r.weeks} weeks · ${(r.days || []).reduce((s: number, x: any) => s + x.exercises.length, 0)} exercises`
                : `${r.targetCalories ?? "—"} kcal · ${r.targetProteinG ?? "—"} g protein · ${(r.meals || []).length} meals`}
            </Td>
            <Td className="text-xs font-bold">{fmtDate(r.updatedAt)}</Td>
            <Td>
              <RowActions>
                <ActionButton
                  label="Copy to a member / new plan"
                  icon={Copy}
                  onClick={() => openNew(r, true)}
                />
                {can("WorkoutPlans", "update") && (
                  <ActionButton
                    label="Edit"
                    icon={Pencil}
                    onClick={() => openNew(r)}
                  />
                )}
                {can("WorkoutPlans", "delete") && (
                  <ActionButton
                    label="Delete"
                    icon={Trash2}
                    tone="danger"
                    onClick={async () => {
                      if (window.confirm(`Delete "${r.name}"?`)) {
                        await api.remove(r._id);
                        refresh();
                      }
                    }}
                  />
                )}
              </RowActions>
            </Td>
          </Tr>
        ))}
      </DataTable>

      <Modal
        open={!!edit}
        wide
        title={`${edit === "new" ? "New" : "Edit"} ${tab} plan`}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Btn light onClick={() => setEdit(null)}>
              Cancel
            </Btn>
            <Btn busy={busy} onClick={save}>
              Save plan
            </Btn>
          </>
        }
      >
        {tab === "workout" ? (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              <TextInput
                label="Plan name"
                required
                value={w.name}
                onChange={(e: any) => setW({ ...w, name: e.target.value })}
                placeholder="PPL 6-day hypertrophy"
              />
              <SelectInput
                label="Goal"
                placeholder="—"
                options={GOALS}
                value={w.goal}
                onChange={(v: string) => setW({ ...w, goal: v })}
              />
              <SelectInput
                label="Level"
                placeholder="—"
                options={["beginner", "intermediate", "advanced"]}
                value={w.level}
                onChange={(v: string) => setW({ ...w, level: v })}
              />
              <TextInput
                label="Duration (weeks)"
                type="number"
                min={1}
                value={w.weeks}
                onChange={(e: any) => setW({ ...w, weeks: e.target.value })}
              />
              <SelectInput
                label="Trainer"
                placeholder="—"
                options={trainers}
                value={w.trainerId}
                onChange={(v: string) => setW({ ...w, trainerId: v })}
              />
              <Field label="Template">
                <label className="flex items-center gap-2 border-2 border-black px-3 py-2 text-sm font-bold bg-white">
                  <input
                    type="checkbox"
                    checked={w.isTemplate}
                    onChange={(e) =>
                      setW({ ...w, isTemplate: e.target.checked })
                    }
                  />{" "}
                  Save as reusable template
                </label>
              </Field>
            </div>
            {!w.isTemplate && (
              <MemberPicker
                label="Assign to member"
                required
                value={w.member}
                onChange={(m) => setW({ ...w, member: m })}
              />
            )}
            {w.days.map((dy: any, i: number) => (
              <div key={i} className="border-2 border-black">
                <div className="flex flex-wrap gap-2 items-center bg-[#024BAB]/10 border-b-2 border-black p-2">
                  <input
                    className={inputCls + " sm:w-40 font-black"}
                    value={dy.label}
                    onChange={(e) => setDayAt(i, { label: e.target.value })}
                  />
                  <input
                    className={inputCls + " flex-1 min-w-[140px]"}
                    placeholder="Focus (Chest + Triceps)"
                    value={dy.focus}
                    onChange={(e) => setDayAt(i, { focus: e.target.value })}
                  />
                  <ActionButton
                    label="Remove day"
                    icon={Trash2}
                    tone="danger"
                    onClick={() =>
                      setW({
                        ...w,
                        days: w.days.filter((_: any, j: number) => j !== i),
                      })
                    }
                  />
                </div>
                <div className="p-2 space-y-2">
                  {dy.exercises.map((e: any, k: number) => (
                    <div key={k} className="grid grid-cols-12 gap-1.5">
                      <input
                        className={inputCls + " col-span-12 sm:col-span-4"}
                        placeholder="Exercise"
                        value={e.name}
                        onChange={(ev) =>
                          setExAt(i, k, { name: ev.target.value })
                        }
                      />
                      <select
                        className={inputCls + " col-span-4 sm:col-span-2"}
                        value={e.muscleGroup}
                        onChange={(ev) =>
                          setExAt(i, k, { muscleGroup: ev.target.value })
                        }
                      >
                        {MUSCLES.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        className={inputCls + " col-span-2"}
                        type="number"
                        placeholder="Sets"
                        value={e.sets}
                        onChange={(ev) =>
                          setExAt(i, k, { sets: ev.target.value })
                        }
                      />
                      <input
                        className={inputCls + " col-span-3 sm:col-span-2"}
                        placeholder="Reps"
                        value={e.reps}
                        onChange={(ev) =>
                          setExAt(i, k, { reps: ev.target.value })
                        }
                      />
                      <input
                        className={inputCls + " col-span-2 sm:col-span-1"}
                        type="number"
                        placeholder="kg"
                        value={e.weightKg}
                        onChange={(ev) =>
                          setExAt(i, k, { weightKg: ev.target.value })
                        }
                      />
                      <button
                        type="button"
                        aria-label="Remove exercise"
                        className="col-span-1 border-2 border-black hover:bg-[#EF4444] hover:text-white flex items-center justify-center"
                        onClick={() =>
                          setDayAt(i, {
                            exercises: dy.exercises.filter(
                              (_: any, j: number) => j !== k,
                            ),
                          })
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Btn
                    light
                    onClick={() =>
                      setDayAt(i, { exercises: [...dy.exercises, ex()] })
                    }
                  >
                    <Plus className="w-4 h-4" /> Exercise
                  </Btn>
                </div>
              </div>
            ))}
            <Btn
              light
              onClick={() =>
                setW({ ...w, days: [...w.days, day(w.days.length + 1)] })
              }
            >
              <Plus className="w-4 h-4" /> Add day
            </Btn>
            <TextArea
              label="Notes"
              value={w.notes}
              onChange={(e: any) => setW({ ...w, notes: e.target.value })}
            />
          </>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <TextInput
                label="Plan name"
                required
                value={d.name}
                onChange={(e: any) => setD({ ...d, name: e.target.value })}
                placeholder="1800 kcal fat-loss (veg)"
              />
              <SelectInput
                label="Diet type"
                options={["veg", "non_veg", "eggetarian", "vegan", "jain"]}
                value={d.type}
                onChange={(v: string) => setD({ ...d, type: v })}
              />
              <SelectInput
                label="Goal"
                placeholder="—"
                options={[
                  "weight_loss",
                  "muscle_gain",
                  "maintenance",
                  "general_health",
                ]}
                value={d.goal}
                onChange={(v: string) => setD({ ...d, goal: v })}
              />
              <TextInput
                label="Target calories"
                type="number"
                value={d.targetCalories}
                onChange={(e: any) =>
                  setD({ ...d, targetCalories: e.target.value })
                }
              />
              <TextInput
                label="Protein target (g)"
                type="number"
                value={d.targetProteinG}
                onChange={(e: any) =>
                  setD({ ...d, targetProteinG: e.target.value })
                }
              />
              <TextInput
                label="Water (litres)"
                type="number"
                step="0.5"
                value={d.waterLitres}
                onChange={(e: any) =>
                  setD({ ...d, waterLitres: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={d.isTemplate}
                onChange={(e) => setD({ ...d, isTemplate: e.target.checked })}
              />{" "}
              Save as reusable template
            </label>
            {!d.isTemplate && (
              <MemberPicker
                label="Assign to member"
                required
                value={d.member}
                onChange={(m) => setD({ ...d, member: m })}
              />
            )}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest">
                Meals
              </p>
              {d.meals.map((m: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-1.5">
                  <select
                    className={inputCls + " col-span-12 sm:col-span-3"}
                    value={m.slot}
                    onChange={(e) => setMealAt(i, { slot: e.target.value })}
                  >
                    {SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {titleCase(s)}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputCls + " col-span-12 sm:col-span-5"}
                    placeholder="2 roti, dal, sabzi, curd"
                    value={m.items}
                    onChange={(e) => setMealAt(i, { items: e.target.value })}
                  />
                  <input
                    className={inputCls + " col-span-5 sm:col-span-2"}
                    type="number"
                    placeholder="kcal"
                    value={m.calories}
                    onChange={(e) => setMealAt(i, { calories: e.target.value })}
                  />
                  <input
                    className={inputCls + " col-span-5 sm:col-span-1"}
                    type="number"
                    placeholder="P g"
                    value={m.proteinG}
                    onChange={(e) => setMealAt(i, { proteinG: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Remove meal"
                    className="col-span-2 sm:col-span-1 border-2 border-black hover:bg-[#EF4444] hover:text-white flex items-center justify-center"
                    onClick={() =>
                      setD({
                        ...d,
                        meals: d.meals.filter((_: any, j: number) => j !== i),
                      })
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <Btn
                light
                onClick={() => setD({ ...d, meals: [...d.meals, meal()] })}
              >
                <Plus className="w-4 h-4" /> Meal
              </Btn>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <TextArea
                label="Supplements"
                value={d.supplements}
                onChange={(e: any) =>
                  setD({ ...d, supplements: e.target.value })
                }
              />
              <TextArea
                label="Avoid"
                value={d.avoid}
                onChange={(e: any) => setD({ ...d, avoid: e.target.value })}
              />
            </div>
          </>
        )}
      </Modal>
    </AppLayout>
  );
}
