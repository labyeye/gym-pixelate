// Everything interpolated into an HTML string that is later document.write()n (print windows) must go through this:
// employee names, designations, notes and company data are user-controlled.
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
