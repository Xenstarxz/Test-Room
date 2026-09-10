import jwt from 'jsonwebtoken';

const isProd = process.env.NODE_ENV === 'production';
export const JWT_SECRET = process.env.JWT_SECRET || (!isProd ? 'room-booking-dev-secret-change-in-production' : null);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production mode. Refusing to start server with an insecure default.');
}

const JWT_EXPIRES = '7d';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  }
  next();
}
