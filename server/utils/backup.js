import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, '../data');
const BACKUP_DIR = path.resolve(DB_DIR, 'backups');

export async function runBackup() {
  try {
    const db = getDb();
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const destFile = path.join(BACKUP_DIR, `room-booking-backup-${timestamp}.db`);

    await db.backup(destFile);
    console.log(`[Backup] SQLite Database backed up successfully via WAL-safe db.backup() to: ${destFile}`);

    // Clean backups older than 30 days
    const files = fs.readdirSync(BACKUP_DIR);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    files.forEach((f) => {
      const fp = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(fp);
      if (stat.ctimeMs < thirtyDaysAgo) {
        fs.unlinkSync(fp);
        console.log(`[Backup] Pruned old backup file: ${f}`);
      }
    });
  } catch (err) {
    console.error('[Backup Error]', err.message);
  }
}
