const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  userId: mongoose.Schema.Types.ObjectId,
  userEmail: String,
  userRole: String,
  entityType: String,
  entityId: mongoose.Schema.Types.ObjectId,
  changes: Object,
  ipAddress: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now }
});

auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);