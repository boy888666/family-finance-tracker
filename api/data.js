// Netlify Function: 家庭业务数据同步
// GET  /.netlify/functions/data/:familyId      获取某家庭全部业务数据
// POST /.netlify/functions/data/:familyId/sync 同步数据

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

  // 从路径提取 familyId: /.../functions/data/fam_1/sync -> familyId = fam_1
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts: ['.netlify', 'functions', 'data', 'fam_1', 'sync']
  // 找到 'data' 的位置，其后是 familyId
  const dataIdx = pathParts.indexOf('data');
  const familyId = dataIdx !== -1 ? pathParts[dataIdx + 1] : null;

  if (!familyId) {
    return new Response(JSON.stringify({ error: '缺少 familyId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 权限检查
  if (user.role !== 'admin' && familyId !== user.familyId) {
    return new Response(JSON.stringify({ error: '无权限访问该家庭数据' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const client = await pool.connect();
  try {
    if (req.method === 'GET') {
      const result = await client.query(
        'SELECT data_type, data FROM family_data WHERE family_id = $1',
        [familyId]
      );
      const data = {};
      for (const row of result.rows) {
        data[row.data_type] = row.data;
      }
      for (const type of ['members', 'assets', 'debts', 'receivables', 'income', 'logs']) {
        if (!data[type]) data[type] = [];
      }
      return new Response(JSON.stringify({ data, familyId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } else if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const { data: clientData, type } = body;

      if (type === 'log' && clientData) {
        const { action, module, target, detail } = clientData;
        const id = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        await client.query(
          `INSERT INTO logs (id, family_id, user_id, username, family_name, action, module, target, detail, log_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
          [id, familyId, user.userId, user.username, user.familyName, action, module, target, detail || '']
        );
        return new Response(JSON.stringify({ ok: true, id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (type && clientData !== undefined) {
        await client.query(
          `INSERT INTO family_data (family_id, data_type, data, update_time)
           VALUES ($1,$2,$3,NOW())
           ON CONFLICT (family_id, data_type) DO UPDATE SET data=$3, update_time=NOW()`,
          [familyId, type, JSON.stringify(clientData)]
        );
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: '缺少 type 或 data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Data API error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } finally {
    client.release();
  }
};
