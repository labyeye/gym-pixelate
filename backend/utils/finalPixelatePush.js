// Pushes a gym support ticket to final-pixelate's shared inbox. Best effort: no-ops when
// FINAL_PIXELATE_URL / FINAL_PIXELATE_SECRET aren't set and never throws into the caller.
async function pushTicket(t, reply) {
  const { FINAL_PIXELATE_URL: url, FINAL_PIXELATE_SECRET: key } = process.env;
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/api/nestgym/support-tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        nestgymTicketId: t._id.toString(),
        ticketNumber: t.ticketId,
        companyName: t.companyName,
        submittedBy: t.contactEmail,
        subject: t.subject,
        priority: t.priority,
        description: t.description,
        status: t.status === "open" ? "new" : t.status,
        createdAt: t.createdAt,
        ...(reply ? { reply } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn("[support] push failed", res.status);
  } catch (e) {
    console.warn("[support] push errored", e.message);
  }
}
module.exports = { pushTicket };
