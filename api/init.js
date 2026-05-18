// Netlify Function: 数据库初始化（部署后访问一次即可）
// POST /.netlify/functions/init

const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
-- 家庭表
CREATE TABLE IF NOT EXISTS families (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE,
  note TEXT,
  create_time TIMESTAMPTZ DEFAULT NOW()
);

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  display_name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'member',
  family_id VARCHAR(50) REFERENCES families(id),
  member_id INT,
  create_time TIMESTAMPTZ DEFAULT NOW()
);

-- 家庭业务数据（JSONB 按类型分row）
CREATE TABLE IF NOT EXISTS family_data (
  id SERIAL PRIMARY KEY,
  family_id VARCHAR(50) REFERENCES families(id) ON DELETE CASCADE,
  data_type VARCHAR(30) NOT NULL,
  data JSONB NOT NULL,
  update_time TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_id, data_type)
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS logs (
  id VARCHAR(50) PRIMARY KEY,
  family_id VARCHAR(50) REFERENCES families(id) ON DELETE CASCADE,
  user_id INT,
  username VARCHAR(50),
  family_name VARCHAR(100),
  action VARCHAR(20),
  module VARCHAR(30),
  target VARCHAR(200),
  detail TEXT,
  log_time TIMESTAMPTZ DEFAULT NOW()
);
`;

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query(SQL);

      // 检查是否已有默认数据
      const exist = await client.query("SELECT id FROM families WHERE id='fam_1'");
      if (exist.rows.length === 0) {
        await client.query(
          "INSERT INTO families (id, name, code, note) VALUES ('fam_1', '默认家庭', 'default', '系统默认家庭')"
        );
        await client.query(
          "INSERT INTO users (username, password, display_name, role, family_id) VALUES ('admin', 'admin123', '管理员', 'admin', 'fam_1')"
        );

        // 插入演示数据
        const now = new Date().toISOString();
        const members = JSON.stringify([
          { id: 1, name: '李建国', role: '户主', relation: '本人', birth: 1982, jobStatus: '在职', income: 18000, note: '主借款人，公司部门经理' },
          { id: 2, name: '王丽华', role: '配偶', relation: '配偶', birth: 1985, jobStatus: '在职', income: 12000, note: '国企职员' },
          { id: 3, name: '李小明', role: '子女', relation: '子女', birth: 2010, jobStatus: '学生', income: 0, note: '小学五年级' },
        ]);
        const assets = JSON.stringify([
          { id: 1, name: '自住房产', cat: '不动产', val: 2800000, cost: 2000000, date: '2018-06-01', note: '上海' },
          { id: 2, name: '家用轿车', cat: '车辆', val: 160000, cost: 230000, date: '2021-03-15', note: '丰田凯美瑞' },
          { id: 3, name: 'A股股票', cat: '金融资产', val: 85000, cost: 70000, date: '2022-01-10', note: '沪深股市' },
          { id: 4, name: '基金定投', cat: '金融资产', val: 48000, cost: 40000, date: '2020-05-01', note: '沪深300指数基金' },
          { id: 5, name: '活期存款', cat: '存款', val: 80000, cost: 80000, date: '2024-01-01', note: '日常备用金' },
          { id: 6, name: '定期存款', cat: '存款', val: 200000, cost: 200000, date: '2023-12-01', note: '三年期 3.5%' },
          { id: 7, name: '商业保险现金价值', cat: '其他', val: 35000, cost: 30000, date: '2019-08-01', note: '人寿险' },
        ]);
        const debts = JSON.stringify([
          { id: 1, name: '招商银行房贷', cat: '房贷', origAmount: 2200000, remain: 1600000, startDate: '2018-06-01', monthly: 8800, rate: 3.45, method: '等额本息', due: '2048-06-01', status: '正常还款', note: '30年贷款' },
          { id: 2, name: '工商银行车贷', cat: '车贷', origAmount: 92000, remain: 42000, startDate: '2023-01-01', monthly: 4200, rate: 4.9, method: '等额本金', due: '2025-12-01', status: '正常还款', note: '3年分期' },
          { id: 3, name: '建行信用卡分期', cat: '信用卡', origAmount: 20000, remain: 12000, startDate: '2025-02-01', monthly: 2000, rate: 18.0, method: '分期还款', due: '2025-08-01', status: '正常还款', note: '消费分期' },
          { id: 4, name: '亲友无息借款', cat: '亲友借款', origAmount: 30000, remain: 30000, startDate: '2025-01-01', monthly: 2500, rate: 0, method: '等额还款', due: '2025-12-31', status: '正常还款', note: '朋友周转' },
        ]);
        const receivables = JSON.stringify([
          { id: 1, borrower: '李明（同事）', amount: 50000, returned: 10000, rate: 5, loanDate: '2024-08-01', dueDate: '2025-08-01', status: '正常回收中', note: '因购房临时周转，年利率5%' },
          { id: 2, borrower: '王强（亲戚）', amount: 20000, returned: 0, rate: 0, loanDate: '2025-01-15', dueDate: '2026-01-15', status: '逾期未还', note: '表弟临时急用，免息' },
        ]);
        const income = JSON.stringify([
          { id: 1, name: '配偶A工资', type: '收入', cat: '工资薪酬', amount: 18000, month: '2026-05', note: '税后', memberId: 1 },
          { id: 2, name: '配偶B工资', type: '收入', cat: '工资薪酬', amount: 12000, month: '2026-05', note: '税后', memberId: 2 },
          { id: 3, name: '年终奖（分摊）', type: '收入', cat: '奖金福利', amount: 3000, month: '2026-05', note: '年奖36000分12个月', memberId: 1 },
          { id: 4, name: '股票分红', type: '收入', cat: '投资收益', amount: 500, month: '2026-05', note: '', memberId: 1 },
          { id: 5, name: '房贷月供', type: '支出', cat: '房贷月供', amount: 8800, month: '2026-05', note: '', memberId: null },
          { id: 6, name: '车贷月供', type: '支出', cat: '车贷月供', amount: 4200, month: '2026-05', note: '', memberId: null },
          { id: 7, name: '餐饮伙食', type: '支出', cat: '餐饮伙食', amount: 4500, month: '2026-05', note: '3口之家', memberId: null },
          { id: 8, name: '子女教育', type: '支出', cat: '子女教育', amount: 3000, month: '2026-05', note: '兴趣班+学费', memberId: 3 },
          { id: 9, name: '交通出行', type: '支出', cat: '交通出行', amount: 1500, month: '2026-05', note: '油费+停车', memberId: null },
          { id: 10, name: '购物消费', type: '支出', cat: '购物消费', amount: 2000, month: '2026-05', note: '', memberId: null },
          { id: 11, name: '水电物业', type: '支出', cat: '水电物业', amount: 800, month: '2026-05', note: '', memberId: null },
          { id: 12, name: '商业保险', type: '支出', cat: '保险费用', amount: 1200, month: '2026-05', note: '全家保险', memberId: null },
          { id: 13, name: '医疗健康', type: '支出', cat: '医疗健康', amount: 500, month: '2026-05', note: '', memberId: null },
          { id: 14, name: '娱乐休闲', type: '支出', cat: '娱乐休闲', amount: 800, month: '2026-05', note: '', memberId: null },
        ]);

        const insertData = async (type, data) => {
          await client.query(
            `INSERT INTO family_data (family_id, data_type, data) VALUES ('fam_1', $1, $2)
             ON CONFLICT (family_id, data_type) DO UPDATE SET data=$2, update_time=NOW()`,
            [type, data]
          );
        };
        await insertData('members', members);
        await insertData('assets', assets);
        await insertData('debts', debts);
        await insertData('receivables', receivables);
        await insertData('income', income);

        return new Response(JSON.stringify({ ok: true, message: '数据库初始化完成！默认账号：admin / admin123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ ok: true, message: '数据库已存在，无需重复初始化' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('DB init error:', err);
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
