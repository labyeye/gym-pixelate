const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    from: { type: String, enum: ["gym", "platform"], required: true },
    senderName: { type: String, default: "" },
  },
  { timestamps: true },
);

// Raised by a gym from inside NestGym; pushed to final-pixelate's shared support inbox.
const supportTicketSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    ticketId: { type: String, unique: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 4000 },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    companyName: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    replies: [replySchema],
  },
  { timestamps: true },
);
supportTicketSchema.index({ tenantId: 1, createdAt: -1 });

supportTicketSchema.pre("save", async function (next) {
  if (!this.ticketId) {
    // ponytail: count-based number; a Counter model (exists) if concurrent creates ever collide
    const n = await mongoose.model("SupportTicket").countDocuments({});
    this.ticketId = `GYM-${String(n + 1).padStart(4, "0")}`;
  }
  next();
});

module.exports =
  mongoose.models.SupportTicket ||
  mongoose.model("SupportTicket", supportTicketSchema);
