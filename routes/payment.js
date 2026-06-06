const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb, saveDb } = require("../db/database");
const { addCredits, getUserById } = require("../services/credit");
const { authMiddleware } = require("./auth");

const router = express.Router();
const PACKAGES = [
  { id: "p10", credits: 10, price: 9.9, label: "10次" },
  { id: "p30", credits: 30, price: 25, label: "30次" },
  { id: "p100", credits: 100, price: 68, label: "100次" },
  { id: "p500", credits: 500, price: 258, label: "500次" }
];

function dbGet(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}

function dbAll(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}

function dbRun(sql, params) {
  getDb().run(sql, params || []);
  saveDb();
}

router.get("/packages", (req, res) => { res.json(PACKAGES); });

router.post("/create-order", authMiddleware, (req, res) => {
  const { packageId, channel } = req.body;
  const pkg = PACKAGES.find(p => p.id === packageId);
  if (!pkg) return res.status(400).json({ error: "无效的套餐" });
  if (!channel) return res.status(400).json({ error: "请选择支付方式" });
  const orderId = uuidv4();
  dbRun("INSERT INTO payment_orders (id, user_id, amount, credits, channel) VALUES (?, ?, ?, ?, ?)",
    [orderId, req.userId, pkg.price, pkg.credits, channel]);
  const payUrl = channel === "alipay"
    ? "https://openapi.alipay.com/gateway.do?orderId=" + orderId + "&amount=" + pkg.price
    : "weixin://pay/?orderId=" + orderId + "&amount=" + pkg.price;
  res.json({ orderId, amount: pkg.price, credits: pkg.credits, payUrl, qrCode: "订单 " + orderId + " 金额 ¥" + pkg.price });
});

router.post("/notify", express.urlencoded({ extended: true }), (req, res) => {
  const { orderId, tradeNo } = req.body || {};
  if (!orderId) return res.status(400).send("fail");
  const order = dbGet("SELECT * FROM payment_orders WHERE id = ?", [orderId]);
  if (!order || order.status !== "pending") return res.send("success");
  dbRun("UPDATE payment_orders SET status = ?, trade_no = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?",
    ["paid", tradeNo || orderId, orderId]);
  addCredits(order.user_id, order.credits, "充值 " + order.credits + " 次");
  res.send("success");
});

router.get("/order/:id", authMiddleware, (req, res) => {
  const order = dbGet("SELECT * FROM payment_orders WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  res.json({ orderId: order.id, amount: order.amount, credits: order.credits, status: order.status, channel: order.channel, createdAt: order.created_at, paidAt: order.paid_at });
});

router.get("/history", authMiddleware, (req, res) => {
  const orders = dbAll("SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [req.userId]);
  res.json(orders);
});

router.post("/redeem", authMiddleware, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "请输入兑换码" });
  const record = dbGet("SELECT * FROM redemption_codes WHERE code = ?", [code]);
  if (!record) return res.status(400).json({ error: "无效的兑换码" });
  if (record.used) return res.status(400).json({ error: "兑换码已使用" });
  addCredits(req.userId, record.credits, "兑换码 " + code + " 充值 " + record.credits + " 次");
  dbRun("UPDATE redemption_codes SET used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?", [req.userId, record.id]);
  const user = getUserById(req.userId);
  res.json({ credits: user.credits, message: "兑换成功！获得 " + record.credits + " 次额度" });
});

module.exports = router;
