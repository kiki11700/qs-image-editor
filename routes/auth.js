const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getUserByUsername, getUserByEmail, createUser, getUserById } = require("../services/credit");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-change-me";

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "请先登录" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch(e) {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "请填写完整信息" });
    if (password.length < 6) return res.status(400).json({ error: "密码至少6位" });
    if (getUserByUsername(username)) return res.status(400).json({ error: "用户名已存在" });
    if (getUserByEmail(email)) return res.status(400).json({ error: "邮箱已注册" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = createUser(username, email, hashedPassword);
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, userId, username, credits: 8, message: "注册成功！赠送 8 次免费额度" });
  } catch(e) {
    res.status(500).json({ error: "注册失败: " + e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "请填写用户名和密码" });
    const user = getUserByUsername(username);
    if (!user) return res.status(400).json({ error: "用户名或密码错误" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "用户名或密码错误" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, userId: user.id, username: user.username, credits: user.credits });
  } catch(e) {
    res.status(500).json({ error: "登录失败" });
  }
});

router.get("/me", authMiddleware, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json({ userId: user.id, username: user.username, email: user.email, credits: user.credits });
});

module.exports = { router, authMiddleware };
