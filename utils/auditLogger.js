// utils/auditLogger.js
const AuditLog = require('../models/AuditLog');

const log = async (action, user, entityType, entityId, changes, req) => {
  try {
    await AuditLog.create({
      action,
      userId: user?._id,
      userEmail: user?.email,
      userRole: user?.role,
      entityType,
      entityId,
      changes,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = {
  log,
  logLogin: (user, req) => log('LOGIN', user, 'User', user._id, null, req),
  logLogout: (user, req) => log('LOGOUT', user, 'User', user._id, null, req),
  logTransaction: (user, txId, changes, req) =>
    log('TRANSACTION_CREATE', user, 'Transaction', txId, changes, req)
};