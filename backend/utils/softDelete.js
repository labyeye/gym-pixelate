// Soft delete: "deleting" sets deletedAt, every normal query then skips the row, the owner can restore it from /api/trash.
// Pass { withDeleted: true } as a query option to see deleted rows. Aggregations bypass query hooks (filter by hand).
const OPS = ["find", "findOne", "findOneAndUpdate", "countDocuments", "updateOne", "updateMany"];

module.exports = function softDelete(schema) {
  if (!schema.path("deletedAt")) schema.add({ deletedAt: { type: Date, default: null } });
  schema.pre(OPS, function () {
    const f = this.getFilter();
    if (this.getOptions().withDeleted || f.deletedAt !== undefined) return;
    this.where({ deletedAt: null });
  });
};
