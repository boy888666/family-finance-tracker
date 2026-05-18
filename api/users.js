// Netlify Function: 用户 CRUD
// GET    /.netlify/functions/users?familyId=   获取家庭用户列表
// POST   /.netlify/functions/users              创建用户
// PUT    /.netlify/functions/users/me/password 修改当前用户密码

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

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  const client = await pool.connect();
  try {
    if (req.method === 'GET') {
      const familyId = url.searchParams.get('familyId') || user.familyId;
      if (user.role !== 'admin' && familyId !== user.familyId) {
        return new Response(JSON.stringify({ error: '无权限' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const result = await client.query(
        'SELECT id, username, display_name, role, family_id, member_id, create_time FROM users WHERE family_id = $1 ORDER BY id',
        [familyId]
      );
      return new Response(JSON.stringify({ users: result.rows }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } else if (req.method === 'POST') {
      if (user.role !== 'admin') {
        return new Response(JSON.stringify({ error: '只有管理员可创建用户' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      let body;
      try { body = await req.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const { username, password, displayName, role, familyId, memberId } = body;
      if (!username || !password || !displayName) {
        return new Response(JSON.stringify({ error: '缺少必填字段' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const exist = await client.query('SELECT id FROM users WHERE username = $1', [username]);
      if (exist.rows.length > 0) {
        return new Response(JSON.stringify({ error: '用户名已存在' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const targetFamilyId = familyId || user.familyId;
      const result = await client.query(
        `INSERT INTO users (username, password, display_name, role, family_id, member_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, username, display_name, role, family_id, member_id, create_time`,
        [username, password, displayName, role || 'member', targetFamilyId, memberId || null]
      );
      return new Response(JSON.stringify({ user: result.rows[0] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } else if (req.method === 'PUT') {
      // PUT /users/me/password
      const isPasswordChange = pathParts[pathParts.length - 2] === 'me' && pathParts[pathParts.length - 1] === 'password';
      if (isPasswordChange) {
        let body;
        try { body = await req.json(); } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const { newPassword } = body;
        if (!newPassword || newPassword.length < 4) {
          return new Response(JSON.stringify({ error: '密码至少4位' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        await client.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, user.userId]);
        return new Response(JSON.stringify({ ok: true, message: '密码修改成功' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Users API error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } finally {
    client.release();
  }
};
