import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { ROOMS, ADMIN_USERNAME, ADMIN_DEFAULT_PASSWORD } from '../data/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'room-booking.db');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://shopb69x_db_user:Uh6H4TzhIAVWdiF1@cluster0.fxkw8ys.mongodb.net/room_booking?retryWrites=true&w=majority&appName=Cluster0';

let db;
let mongoClient = null;
let mongoDb = null;
let isMongoSyncing = false;

export async function initMongo() {
  if (!MONGODB_URI) return null;
  if (mongoDb) return mongoDb;
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    mongoDb = mongoClient.db('room_booking');
    console.log('[Database] Connected to MongoDB Atlas successfully.');
    return mongoDb;
  } catch (err) {
    console.warn('[Database] MongoDB Atlas connection failed, operating with SQLite:', err.message);
    return null;
  }
}

// โหลดข้อมูลล่าสุดจาก MongoDB Atlas เข้า SQLite (ตอนเซิร์ฟเวอร์เริ่มทำงาน)
export async function loadDataFromMongo(sqliteDb) {
  const mdb = await initMongo();
  if (!mdb) return;

  // users และ rooms ต้องมาก่อน bookings/notifications
  const collections = ['settings', 'users', 'rooms', 'bookings', 'notifications', 'audit_logs', 'user_logs'];
  try {
    isMongoSyncing = true;
    sqliteDb.pragma('foreign_keys = OFF');
    for (const table of collections) {
      const docs = await mdb.collection(table).find().toArray();
      if (docs && docs.length > 0) {
        sqliteDb.prepare(`DELETE FROM ${table}`).run();
        const firstDoc = docs[0];
        const keys = Object.keys(firstDoc).filter((k) => k !== '_id');
        const placeholders = keys.map(() => '?').join(', ');
        const insertStmt = sqliteDb.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);

        const insertMany = sqliteDb.transaction((items) => {
          for (const item of items) {
            const values = keys.map((k) => item[k]);
            insertStmt.run(...values);
          }
        });
        insertMany(docs);
      }
    }
    sqliteDb.pragma('foreign_keys = ON');
    isMongoSyncing = false;
    console.log('[Database] Synced all data from MongoDB Atlas into SQLite cache.');
  } catch (err) {
    sqliteDb.pragma('foreign_keys = ON');
    isMongoSyncing = false;
    console.error('[Database] Failed to load data from MongoDB:', err.message);
  }
}

// ซิงค์ตารางทั้งหมดจาก SQLite ขึ้น MongoDB Atlas แบบ Safe Upsert
const syncTimeouts = new Map();

export async function syncToMongo(tableName) {
  if (!mongoDb || isMongoSyncing) return;
  try {
    const sqliteDb = getDb();
    const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
    const docs = rows.map((r) => ({ ...r, _id: r.id || r.key }));

    const collection = mongoDb.collection(tableName);
    if (docs.length === 0) {
      await collection.deleteMany({});
      return;
    }

    const currentIds = docs.map((d) => d._id);
    const ops = [
      { deleteMany: { filter: { _id: { $nin: currentIds } } } },
      ...docs.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      })),
    ];

    await collection.bulkWrite(ops, { ordered: false });
  } catch (err) {
    console.error(`[Database] Failed to sync ${tableName} to MongoDB Atlas:`, err.message);
  }
}

// Helper ซิงค์เมื่อมีการเปลี่ยนแปลง (Debounce 500ms ป้องกันการยิงชนกันซ้ำๆ)
export function scheduleSync(tableName) {
  if (syncTimeouts.has(tableName)) {
    clearTimeout(syncTimeouts.get(tableName));
  }
  syncTimeouts.set(
    tableName,
    setTimeout(() => {
      syncTimeouts.delete(tableName);
      syncToMongo(tableName);
    }, 500)
  );
}


export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    migrateSchema(db);
    seedData(db);

    // Sync trigger on changes via table hooks
    hookSqliteWrites(db);
  }
  return db;
}

function hookSqliteWrites(sqliteDb) {
  const originalRun = sqliteDb.prepare('SELECT 1').run.constructor.prototype.run;
  // Hook standard prepare().run to detect mutations
  const originalPrepare = sqliteDb.prepare.bind(sqliteDb);
  sqliteDb.prepare = function (sql) {
    const stmt = originalPrepare(sql);
    const sqlUpper = sql.trim().toUpperCase();
    const isMutation = sqlUpper.startsWith('INSERT') || sqlUpper.startsWith('UPDATE') || sqlUpper.startsWith('DELETE');

    if (isMutation) {
      const origRun = stmt.run.bind(stmt);
      stmt.run = function (...args) {
        const result = origRun(...args);
        // Identify table name
        const match = sqlUpper.match(/(?:INTO|UPDATE|FROM)\s+([A-Z0-9_]+)/i);
        if (match && match[1]) {
          const table = match[1].toLowerCase();
          scheduleSync(table);
        }
        return result;
      };
    }
    return stmt;
  };
}

// Migration แบบ additive
export function createAuditLog(database, { adminId, adminName, action, details, target = null }) {
  database.prepare(`
    INSERT INTO audit_logs (id, admin_id, admin_name, action, details, target, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), adminId, adminName, action, details, target || null, Date.now());
}

export function createUserLog(database, { userId, userName, action, details, meta = null }) {
  database.prepare(`
    INSERT INTO user_logs (id, user_id, user_name, action, details, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, userName, action, details, meta ? JSON.stringify(meta) : null, Date.now());
}

function migrateSchema(database) {
  const bookingCols = database.prepare('PRAGMA table_info(bookings)').all().map((c) => c.name);
  if (!bookingCols.includes('cancel_reason')) {
    database.exec('ALTER TABLE bookings ADD COLUMN cancel_reason TEXT');
  }
  if (!bookingCols.includes('series_id')) {
    database.exec('ALTER TABLE bookings ADD COLUMN series_id TEXT');
  }

  const roomCols = database.prepare('PRAGMA table_info(rooms)').all().map((c) => c.name);
  if (!roomCols.includes('status')) {
    database.exec("ALTER TABLE rooms ADD COLUMN status TEXT DEFAULT 'active'");
  }

  const auditCols = database.prepare('PRAGMA table_info(audit_logs)').all().map((c) => c.name);
  if (auditCols.length > 0 && !auditCols.includes('target')) {
    database.exec('ALTER TABLE audit_logs ADD COLUMN target TEXT');
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      booking_id TEXT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      target TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_logs_created ON user_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_logs_user ON user_logs(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const existingDays = database.prepare("SELECT value FROM settings WHERE key = 'advance_booking_days'").get();
  if (!existingDays) {
    database.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('advance_booking_days', '90', ?)").run(Date.now());
  }
  const existingBlackout = database.prepare("SELECT value FROM settings WHERE key = 'blackout_dates'").get();
  if (!existingBlackout) {
    database.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('blackout_dates', '[]', ?)").run(Date.now());
  }
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      approved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity TEXT NOT NULL,
      building TEXT,
      type TEXT DEFAULT 'classroom'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      period TEXT NOT NULL,
      user_id TEXT NOT NULL,
      booker_name TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT '[]',
      years TEXT NOT NULL DEFAULT '[]',
      subjects TEXT NOT NULL DEFAULT '[]',
      equipment TEXT NOT NULL DEFAULT '[]',
      other_purpose TEXT,
      other_equipment TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
    CREATE INDEX IF NOT EXISTS idx_bookings_room_date ON bookings(room_id, date);
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  `);
}

function seedData(database) {
  const roomCount = database.prepare('SELECT COUNT(*) as c FROM rooms').get().c;
  if (roomCount === 0) {
    const insertRoom = database.prepare(
      'INSERT INTO rooms (id, name, capacity, building, type) VALUES (?, ?, ?, ?, ?)'
    );
    const insertMany = database.transaction((rooms) => {
      for (const room of rooms) {
        insertRoom.run(room.id, room.name, room.capacity, room.building, room.type);
      }
    });
    insertMany(ROOMS);
  }

  const admin = database.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (!admin) {
    const hash = bcrypt.hashSync(ADMIN_DEFAULT_PASSWORD, 10);
    database.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(randomUUID(), ADMIN_USERNAME, hash, 'ผู้ดูแลระบบ', 'admin', 1, Date.now());
  }
}

export function parseBookingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name,
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    period: row.period,
    userId: row.user_id,
    bookerName: row.booker_name,
    purpose: JSON.parse(row.purpose || '[]'),
    years: JSON.parse(row.years || '[]'),
    subjects: JSON.parse(row.subjects || '[]'),
    equipment: JSON.parse(row.equipment || '[]'),
    otherPurpose: row.other_purpose || '',
    otherEquipment: row.other_equipment || '',
    status: row.status,
    cancelReason: row.cancel_reason || '',
    seriesId: row.series_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
