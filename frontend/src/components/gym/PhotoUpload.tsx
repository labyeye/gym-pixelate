import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { Btn } from "./kit";

/** Profile photo: picks an image, uploads it and hands back the URL (empty string = removed). */
export function PhotoUpload({
  value,
  name,
  onChange,
  hint = "JPG, PNG or WebP, up to 5 MB",
}: {
  value: string;
  name: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const notify = useNotify();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify.error("Photo must be an image");
    if (file.size > 5 * 1024 * 1024) return notify.error("Photo is too large", "Max 5 MB");
    const fd = new FormData();
    fd.append("file", file);
    try {
      setBusy(true);
      const r = await request<{ url: string }>("/upload", { method: "POST", body: fd });
      onChange(r.url);
    } catch (e: any) {
      notify.error("Upload failed", e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24 border-2 border-black bg-[#024BAB] text-white flex items-center justify-center text-3xl font-black overflow-hidden shrink-0">
        {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : (name[0] || "?").toUpperCase()}
      </div>
      <div className="space-y-2">
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Btn light onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} {value ? "Change photo" : "Upload photo"}
          </Btn>
          {value && (
            <Btn light onClick={() => onChange("")}>
              <Trash2 className="w-4 h-4" /> Remove
            </Btn>
          )}
        </div>
        <p className="text-[11px] font-medium text-black/50">{hint}</p>
      </div>
    </div>
  );
}
