p='ResourcePage.tsx'
s=open(p,newline='').read()
crlf='\r\n' in s
s=s.replace('\r\n','\n')
def rep(a,b):
    global s
    assert a in s,a
    s=s.replace(a,b,1)
rep('import type { ListRes','import { ExportImport } from "./ExportImport";\nimport type { ListRes')
rep('  after?: ReactNode;\n}','  after?: ReactNode;\n  /** hide the Export/Import buttons */\n  noExportImport?: boolean;\n  /** extra export-only columns (header → value) */\n  exportExtra?: { header: string; value: (r: any) => any }[];\n}')
rep('''            {p.toolbarRight}''','''            {p.toolbarRight}
            {!p.noExportImport && (
              <ExportImport
                name={p.noun.replace(/\s+/g, "_")}
                fetchRows={async () =>
                  (await p.api.list({ ...params, page: 1, limit: 5000 })).data
                }
                cols={[
                  ...p.fields
                    .filter((f) => f.type !== "textarea")
                    .map((f) => ({
                      header: f.label,
                      value: (r: any) => {
                        const v = getPath(r, f.key);
                        if (v && typeof v === "object")
                          return v.name || v.label || "";
                        return f.type === "date" ? toInputDate(v) : v;
                      },
                    })),
                  ...(p.exportExtra || []),
                ]}
                importTemplate={{
                  headers: p.fields.map((f) => f.label),
                  example: p.fields.map((f) => f.placeholder || ""),
                }}
                onImportRow={
                  can(p.permission, "create")
                    ? (r) => {
                        const body: Record<string, any> = {};
                        for (const f of p.fields) {
                          let v: any = r[f.label];
                          if (v === "" || v === undefined) continue;
                          if (f.type === "number") v = Number(v);
                          else if (f.type === "date" || f.type === "datetime")
                            v = new Date(v).toISOString();
                          else if (f.type === "checkbox")
                            v = /^(true|yes|1|y)$/i.test(String(v));
                          else if (
                            f.type === "member" ||
                            f.type === "trainer" ||
                            f.type === "plan" ||
                            f.type === "class"
                          )
                            continue; // linked records can't be imported from text
                          setPath(body, f.key, v);
                        }
                        return p.api.create(p.toPayload ? p.toPayload(body) : body);
                      }
                    : undefined
                }
                onImported={refresh}
              />
            )}''')
open(p,'w',newline='').write(s.replace('\n','\r\n') if crlf else s)
