import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  PhoneField,
  ActionButton,
  Btn,
  DataTable,
  Modal,
  Pager,
  RowActions,
  SearchBox,
  SelectInput,
  TextArea,
  TextInput,
  Toolbar,
  Td,
  Tr,
  Field,
  inputCls,
  toInputDate,
  idOf,
} from "./kit";
import { MemberPicker, useClasses, usePlans, useTrainers } from "./pickers";
import type { ListRes, OneRes } from "@/services/gymApi";

export interface FieldDef {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "datetime"
    | "email"
    | "tel"
    | "select"
    | "textarea"
    | "checkbox"
    | "member"
    | "trainer"
    | "plan"
    | "class";
  options?: (string | { value: string; label: string })[];
  required?: boolean;
  hint?: string;
  span?: 1 | 2;
  default?: any;
  placeholder?: string;
  min?: number;
  step?: string;
  /** hide while editing (e.g. immutable on create-only fields) */
  createOnly?: boolean;
}
export interface Col<T = any> {
  label: string;
  render: (row: T, i: number) => ReactNode;
  className?: string;
}

interface Api {
  list: (p?: Record<string, any>) => Promise<ListRes>;
  create: (b: any) => Promise<OneRes>;
  update: (id: string, b: any) => Promise<OneRes>;
  remove: (id: string) => Promise<any>;
}

interface Props<T = any> {
  title: string;
  noun: string; // "enquiry"
  permission: string; // permission resource name (UI hint; the server enforces)
  api: Api;
  queryKey: string;
  columns: Col<T>[];
  fields: FieldDef[];
  filters?: { key: string; label: string; options: string[] }[];
  stats?: (rows: T[], total: number) => ReactNode;
  rowActions?: (row: T, refresh: () => void) => ReactNode;
  toolbarRight?: ReactNode;
  listParams?: Record<string, any>;
  searchable?: boolean;
  /** convert the edited row back into the form's initial values */
  toForm?: (row: any) => Record<string, any>;
  toPayload?: (form: Record<string, any>) => Record<string, any>;
  canDelete?: boolean;
  wide?: boolean;
  after?: ReactNode;
}

const getPath = (o: any, path: string) =>
  path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o: any, path: string, v: any) => {
  const ks = path.split(".");
  let cur = o;
  ks.slice(0, -1).forEach((k) => {
    cur[k] = cur[k] || {};
    cur = cur[k];
  });
  cur[ks[ks.length - 1]] = v;
};

const blank = (fields: FieldDef[]) =>
  Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.default ?? (f.type === "checkbox" ? false : ""),
    ]),
  );

export function ResourcePage<T extends { _id: string }>(p: Props<T>) {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<any | null>(null); // row | "new"
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const trainers = useTrainers();
  const plans = usePlans(false);
  const classes = useClasses();

  const params = useMemo(
    () => ({ page, limit: 25, q, ...filter, ...(p.listParams || {}) }),
    [page, q, filter, p.listParams],
  );
  const { data, isLoading } = useQuery({
    queryKey: [p.queryKey, params],
    queryFn: () => p.api.list(params),
  });
  const rows = (data?.data || []) as T[];
  const refresh = () => qc.invalidateQueries({ queryKey: [p.queryKey] });

  const openNew = () => {
    setForm(blank(p.fields));
    setEditing("new");
  };
  const openEdit = (row: any) => {
    const base = blank(p.fields);
    const src = p.toForm ? p.toForm(row) : row;
    for (const f of p.fields) {
      const v = getPath(src, f.key);
      if (v === undefined || v === null) continue;
      base[f.key] =
        f.type === "date"
          ? toInputDate(v)
          : f.type === "datetime"
            ? new Date(v).toISOString().slice(0, 16)
            : v;
    }
    setForm(base);
    setEditing(row);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, any> = {};
    for (const f of p.fields) {
      let v = form[f.key];
      if (f.type === "member") {
        setPath(body, f.key, idOf(v) || undefined);
        continue;
      }
      if (f.type === "number")
        v = v === "" || v === undefined ? undefined : Number(v);
      if (f.type === "date" || f.type === "datetime")
        v = v ? new Date(v).toISOString() : undefined;
      if (v === "" && f.type !== "checkbox") v = undefined;
      setPath(body, f.key, v);
    }
    try {
      setSaving(true);
      const payload = p.toPayload ? p.toPayload(body) : body;
      if (editing === "new") await p.api.create(payload);
      else await p.api.update(editing._id, payload);
      notify.success(
        editing === "new" ? `${p.noun} added` : `${p.noun} updated`,
      );
      setEditing(null);
      refresh();
    } catch (err: any) {
      notify.error("Save failed", err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    if (!window.confirm(`Delete this ${p.noun}? This cannot be undone.`))
      return;
    try {
      await p.api.remove(row._id);
      notify.success(`${p.noun} deleted`);
      refresh();
    } catch (err: any) {
      notify.error("Delete failed", err.message);
    }
  };

  const set = (k: string) => (v: any) => setForm((f) => ({ ...f, [k]: v }));
  const head = [...p.columns.map((c) => c.label), "Actions"];

  const renderField = (f: FieldDef) => {
    const span = f.span === 2 ? "sm:col-span-2" : "";
    const v = form[f.key];
    switch (f.type) {
      case "select":
        return (
          <SelectInput
            key={f.key}
            className={span}
            label={f.label}
            required={f.required}
            hint={f.hint}
            options={f.options}
            value={v}
            onChange={set(f.key)}
            placeholder={f.required ? undefined : "—"}
          />
        );
      case "trainer":
        return (
          <SelectInput
            key={f.key}
            className={span}
            label={f.label}
            required={f.required}
            options={trainers}
            value={idOf(v)}
            onChange={set(f.key)}
            placeholder="Select trainer"
          />
        );
      case "plan":
        return (
          <SelectInput
            key={f.key}
            className={span}
            label={f.label}
            required={f.required}
            options={plans.map((x: any) => ({ value: x._id, label: x.name }))}
            value={idOf(v)}
            onChange={set(f.key)}
            placeholder="Select plan"
          />
        );
      case "class":
        return (
          <SelectInput
            key={f.key}
            className={span}
            label={f.label}
            required={f.required}
            options={classes}
            value={idOf(v)}
            onChange={set(f.key)}
            placeholder="Select class"
          />
        );
      case "member":
        return (
          <MemberPicker
            key={f.key}
            className={span}
            label={f.label}
            required={f.required}
            value={typeof v === "object" ? v : null}
            onChange={set(f.key)}
          />
        );
      case "tel":
        return (
          <PhoneField
            key={f.key}
            className={span}
            label={f.label}
            required={f.required}
            hint={f.hint}
            value={v ?? ""}
            onChange={set(f.key)}
          />
        );
      case "textarea":
        return (
          <TextArea
            key={f.key}
            className={span}
            label={f.label}
            hint={f.hint}
            value={v ?? ""}
            onChange={(e: any) => set(f.key)(e.target.value)}
            placeholder={f.placeholder}
          />
        );
      case "checkbox":
        return (
          <Field key={f.key} label={f.label} className={span}>
            <label className="flex items-center gap-2 border-2 border-black px-3 py-2 text-sm font-bold bg-white cursor-pointer">
              <input
                type="checkbox"
                checked={!!v}
                onChange={(e) => set(f.key)(e.target.checked)}
                className="w-4 h-4 accent-[#024BAB]"
              />{" "}
              {f.hint || "Yes"}
            </label>
          </Field>
        );
      default:
        return (
          <TextInput
            key={f.key}
            className={span}
            label={f.label}
            required={f.required}
            hint={f.hint}
            type={f.type === "datetime" ? "datetime-local" : f.type || "text"}
            min={f.min}
            step={f.step}
            value={v ?? ""}
            onChange={(e: any) => set(f.key)(e.target.value)}
            placeholder={f.placeholder}
          />
        );
    }
  };

  return (
    <AppLayout title={p.title}>
      {p.stats?.(rows, data?.total ?? rows.length)}
      <Toolbar
        right={
          <>
            {p.toolbarRight}
            {can(p.permission, "create") && (
              <Btn onClick={openNew}>
                <Plus className="w-4 h-4" /> Add {p.noun}
              </Btn>
            )}
          </>
        }
      >
        {p.searchable !== false && (
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder={`Search ${p.noun}s…`}
          />
        )}
        {p.filters?.map((f) => (
          <select
            key={f.key}
            className={inputCls + " sm:w-44 font-bold"}
            value={filter[f.key] || ""}
            onChange={(e) => {
              setFilter((s) => ({ ...s, [f.key]: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">All {f.label}</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        ))}
      </Toolbar>

      <DataTable head={head} loading={isLoading} empty={rows.length === 0}>
        {rows.map((r, i) => (
          <Tr key={r._id} i={i}>
            {p.columns.map((c) => (
              <Td key={c.label} className={c.className}>
                {c.render(r, i)}
              </Td>
            ))}
            <Td>
              <RowActions>
                {p.rowActions?.(r, refresh)}
                {can(p.permission, "update") && (
                  <ActionButton
                    label="Edit"
                    icon={Pencil}
                    onClick={() => openEdit(r)}
                  />
                )}
                {p.canDelete !== false && can(p.permission, "delete") && (
                  <ActionButton
                    label="Delete"
                    icon={Trash2}
                    tone="danger"
                    onClick={() => remove(r)}
                  />
                )}
              </RowActions>
            </Td>
          </Tr>
        ))}
      </DataTable>
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />
      {p.after}

      <Modal
        open={!!editing}
        wide={p.wide}
        title={editing === "new" ? `Add ${p.noun}` : `Edit ${p.noun}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Btn light onClick={() => setEditing(null)}>
              Cancel
            </Btn>
            <Btn
              type="submit"
              busy={saving}
              onClick={() =>
                (
                  document.getElementById("rp-form") as HTMLFormElement
                )?.requestSubmit()
              }
            >
              Save
            </Btn>
          </>
        }
      >
        <form
          id="rp-form"
          onSubmit={submit}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          {p.fields
            .filter((f) => !(f.createOnly && editing !== "new"))
            .map(renderField)}
        </form>
      </Modal>
    </AppLayout>
  );
}
