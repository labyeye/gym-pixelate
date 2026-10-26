const Subscription = require("../models/Subscription");
const CreditTopup = require("../models/CreditTopup");

// What is specific to this product: which orders are ours, and how a paid order becomes a subscription.
module.exports = {
  ownsOrder: async (orderId) => !!((await Subscription.exists({ "pendingOrder.razorpayOrderId": orderId })) || (await CreditTopup.exists({ orderId }))),
  alreadyProvisioned: async (paymentId) => !!((await Subscription.exists({ "invoices.razorpayPaymentId": paymentId })) || (await CreditTopup.exists({ paymentId }))),
  provision: async (ev) => {
    if (await CreditTopup.exists({ orderId: ev.orderId })) return require("./credits").completeTopup(ev);
    return require("../routes/billingRoutes").provisionRazorpay(ev);
  },
};
