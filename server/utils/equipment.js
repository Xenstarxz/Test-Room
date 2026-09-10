/**
 * Utility functions for equipment inventory & overlapping stock calculation
 */

/**
 * Parses equipment entries like:
 * - "ไมค์ (2 ตัว)" -> { name: "ไมค์", count: 2 }
 * - "สาย HDMI" -> { name: "สาย HDMI", count: 1 }
 * - "ไมค์ (3)" -> { name: "ไมค์", count: 3 }
 */
export function parseEquipmentEntry(entry) {
  if (!entry || typeof entry !== 'string') return null;
  const match = entry.match(/^(.+?)(?:\s*\(([0-9]+).*?\))?$/);
  if (!match) return { name: entry.trim(), count: 1 };
  const name = match[1].trim();
  const count = match[2] ? parseInt(match[2], 10) : 1;
  return { name, count: Number.isFinite(count) && count > 0 ? count : 1 };
}

/**
 * Parses an array of equipment entries into a map { [name]: totalCount }
 */
export function parseEquipmentList(list) {
  const result = {};
  if (!list) return result;
  let items = list;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [items];
    }
  }
  if (!Array.isArray(items)) return result;
  for (const item of items) {
    const parsed = parseEquipmentEntry(item);
    if (parsed && parsed.name) {
      result[parsed.name] = (result[parsed.name] || 0) + parsed.count;
    }
  }
  return result;
}

/**
 * Calculates used equipment across active bookings that overlap with given (date, start, end).
 * Overlap condition: b.date === date && b.status !== 'cancelled' && b.id !== ignoreBookingId && start < b.end && end > b.start
 *
 * @param {Array} bookings - array of parsed booking objects (with date, start, end, status, equipment, id)
 * @param {Object} options - { date, start, end, ignoreBookingId }
 * @returns {Object} { [equipmentName]: totalUsedCount }
 */
export function getOverlappingEquipmentUsage(bookings, { date, start, end, ignoreBookingId = null }) {
  const usage = {};
  const s = Number(start);
  const e = Number(end);

  for (const b of bookings) {
    if (b.id === ignoreBookingId) continue;
    if (b.status === 'cancelled') continue;
    if (b.date !== date) continue;
    if (s < b.end && e > b.start) {
      const bEquipment = parseEquipmentList(b.equipment);
      for (const [name, qty] of Object.entries(bEquipment)) {
        usage[name] = (usage[name] || 0) + qty;
      }
    }
  }

  return usage;
}

/**
 * Calculates stock availability for all configured equipment items during a given interval.
 *
 * @param {Array} bookings - active bookings from db
 * @param {Object} interval - { date, start, end, ignoreBookingId }
 * @param {Object} settings - from getAllSettings(db)
 * @returns {Object} {
 *   [itemName]: {
 *     totalStock: number,
 *     used: number,
 *     available: number,
 *     maxPerBooking: number,
 *     unit: string,
 *     icon: string
 *   }
 * }
 */
export function getEquipmentAvailability(bookings, { date, start, end, ignoreBookingId = null }, settings = {}) {
  const items = settings.equipment || [];
  const limits = settings.equipment_limits || {};
  const stockConfig = settings.equipment_stock || {};
  const usage = getOverlappingEquipmentUsage(bookings, { date, start, end, ignoreBookingId });

  const result = {};
  for (const item of items) {
    const lim = limits[item] || { min: 0, max: 5, unit: 'ชิ้น', icon: '📦' };
    const maxPerBooking = Number(lim.max) || 5;
    const totalStock = stockConfig[item] !== undefined ? Number(stockConfig[item]) : maxPerBooking;
    const used = usage[item] || 0;
    const available = Math.max(0, totalStock - used);

    result[item] = {
      totalStock,
      used,
      available,
      maxPerBooking,
      unit: lim.unit || 'ชิ้น',
      icon: lim.icon || '📦',
    };
  }

  return result;
}

/**
 * Validates requested equipment against total available stock for the target interval.
 *
 * @param {Array} requestedEquipment - array of strings e.g. ["ไมค์ (3 ตัว)", "สาย HDMI"]
 * @param {Array} bookings - all active bookings
 * @param {Object} interval - { date, start, end, ignoreBookingId }
 * @param {Object} settings - from getAllSettings(db)
 * @returns {Object|null} null if valid, or { error: string, details: Object }
 */
export function validateEquipmentStock(requestedEquipment, bookings, { date, start, end, ignoreBookingId = null }, settings = {}) {
  const requested = parseEquipmentList(requestedEquipment);
  const availMap = getEquipmentAvailability(bookings, { date, start, end, ignoreBookingId }, settings);

  for (const [name, qty] of Object.entries(requested)) {
    if (qty <= 0) continue;
    const info = availMap[name];
    if (!info) continue; // Unlisted item or custom, handled elsewhere

    if (qty > info.available) {
      const unit = info.unit || 'ชิ้น';
      return {
        error: `${name} เหลือ ${info.available} ${unit} ในช่วงเวลานี้ (ขอ ${qty} ${unit})`,
        item: name,
        requested: qty,
        available: info.available,
        totalStock: info.totalStock,
      };
    }
  }

  return null;
}
