import io


def edit(p, fn):
    s = io.open(p, newline="", encoding="utf-8").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    s = fn(s)
    io.open(p, "w", newline="", encoding="utf-8").write(s.replace("\n", "\r\n") if crlf else s)


def need(s, a, b):
    assert a in s, a
    return s.replace(a, b, 1)


def model(s):
    return need(s, "      {\n        hdfcPaymentId: String,", "      {\n        invoiceNumber: String, // KHT/GYM/001, assigned when the payment is recorded\n        hdfcPaymentId: String,")


edit(r"D:\projects\Pixelate Nest\NestGym\backend\models\Subscription.js", model)


def routes(s):
    # shared numbering helper
    s = need(
        s,
        "router.get(\n  \"/invoices\",",
        '''/** next global bill number, KHT/GYM/001 (counts every paid subscription invoice) */
async function nextBillNumber() {
  const r = await Subscription.aggregate([
    { $unwind: "$invoices" },
    { $match: { "invoices.status": "paid" } },
    { $count: "total" },
  ]);
  return `KHT/GYM/${String((r[0]?.total || 0) + 1).padStart(3, "0")}`;
}

router.get(
  "/invoices",''',
    )
    # listing: stored number or chronological fallback; amount stored in paise -> rupees
    s = need(
        s,
        '''    const invoices = (subscription.invoices || [])
      .filter((inv) => inv.status === "paid")
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
      .slice(0, 24)
      .map((inv, i, arr) => ({
        _id: inv._id,
        invoiceNumber: `INV-${String(arr.length - i).padStart(4, "0")}`,
        plan: inv.plan,
        billingCycle: inv.billingCycle,
        amount: inv.amount,''',
        '''    const invoices = (subscription.invoices || [])
      .filter((inv) => inv.status === "paid")
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
      .slice(0, 24)
      .map((inv, i, arr) => ({
        _id: inv._id,
        // older invoices (before numbers were stored) get a number by paid order within this gym
        invoiceNumber:
          inv.invoiceNumber ||
          `KHT/GYM/${String(arr.length - i).padStart(3, "0")}`,
        plan: inv.plan,
        billingCycle: inv.billingCycle,
        amount: Math.round(inv.amount) / 100, // stored in paise''',
    )
    # hdfc
    s = need(
        s,
        "      await Subscription.findOneAndUpdate(\n        { tenant: tenant._id },",
        "      const billNo = await nextBillNumber();\n      await Subscription.findOneAndUpdate(\n        { tenant: tenant._id },",
    )
    s = need(s, "            invoices: {\n              hdfcPaymentId: orderId,", "            invoices: {\n              invoiceNumber: billNo,\n              hdfcPaymentId: orderId,")
    # razorpay: replace the count block with helper
    i = s.index("        const countResult = await Subscription.aggregate([")
    j = s.index("const invoiceNumber = `KHT/${String(invoiceSeq).padStart(4, \"0\")}`;")
    j2 = j + len("const invoiceNumber = `KHT/${String(invoiceSeq).padStart(4, \"0\")}`;")
    s = s[:i] + "        const invoiceNumber = await nextBillNumber();" + s[j2:]
    s = need(s, "              invoices: {\n                razorpayPaymentId,", "              invoices: {\n                invoiceNumber,\n                razorpayPaymentId,")
    return s


edit(r"D:\projects\Pixelate Nest\NestGym\backend\routes\billingRoutes.js", routes)
print("ok")
