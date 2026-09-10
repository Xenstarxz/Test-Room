import { getDb } from '../db/database.js';

export function runRetention() {
  try {
    const db = getDb();
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const res = db.prepare('DELETE FROM notifications WHERE is_read = 1 AND created_at < ?').run(ninetyDaysAgo);
    if (res.changes > 0) {
      console.log(`[Retention] Cleaned up ${res.changes} old read notifications (>90 days).`);
    }
  } catch (err) {
    console.error('[Retention Error]', err.message);
  }
}
