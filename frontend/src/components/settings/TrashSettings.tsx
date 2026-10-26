import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";

const LABEL: Record<string, string> = { members: "Members", plans: "Plans", products: "Products" };

// Deleted members, plans and products can be brought back from here.
export default function TrashSettings() {
  const notify = useNotify();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["trash"], queryFn: async () => (await request<any>("/trash")).data as Record<string, any[]> });
  const restore = async (kind: string, id: string) => {
    try {
      await request(`/trash/${kind}/${id}/restore`, { method: "POST" });
      notify.success("Restored");
      qc.invalidateQueries();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };
  const all = Object.entries(q.data || {}).flatMap(([kind, rows]) => rows.map((r) => ({ kind, ...r })));
  return (
    <section className="border-2 border-black bg-white p-5 space-y-2">
      <h3 className="font-display font-bold text-lg">Recycle bin</h3>
      {!all.length && <p className="text-sm text-gray-600">Nothing deleted.</p>}
      {all.map((r) => (
        <div key={r._id} className="flex items-center justify-between border-t border-black/10 pt-2 text-sm">
          <span>
            <b>{r.name}</b> <span className="text-xs text-gray-600">{LABEL[r.kind]} · deleted {new Date(r.deletedAt).toLocaleDateString("en-IN")}</span>
          </span>
          <button className="border-2 border-black px-3 py-1 text-xs font-bold uppercase" onClick={() => restore(r.kind, r._id)}>
            Restore
          </button>
        </div>
      ))}
    </section>
  );
}
