// Netlify Function: 家庭 CRUD
// GET /.netlify/functions/families - 获取可访问的家庭列表

const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET || 'family-finance-secret-key-2026';

function verifyToken(token) {
  try {
    const [h, b, s] = token.split('.');
    const expected = Buffer.from(h + '.' + b + JWT_SECRET).toString('base64url');
    if (s !== expected) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function auth(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}

export default async (req, context) => {
  const user = auth(req);
  if (!user) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'GET') {
    try {
      const client = await pool.connect();
      try {
        let rows;
        if (user.role === 'admin') {
          const result = await client.query('SELECT * FROM families ORDER BY create_time');
          rows = result.rows;
        } else {
          const result = await client.query('SELECT * FROM families WHERE id = $1', [user.familyId]);
          rows = result.rows;
        }
        return new Response(JSON.stringify({ families: rows }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } finally {
        client.release();
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
};
