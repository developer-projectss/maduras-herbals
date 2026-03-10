// =====================================================================
// api/login.js — Vercel Serverless Function: POST /api/login
// =====================================================================

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(404).json({ error: 'Not found' });

  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  let users = {};
  try { users = JSON.parse(process.env.USERS_JSON || '{}'); } catch {}

  const user = users[username.toLowerCase()];
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  if (hash !== user.passwordHash)
    return res.status(401).json({ error: 'Invalid username or password' });

  // Stateless token: base64url(payload).hmac
  const payload = Buffer.from(JSON.stringify({
    username: username.toLowerCase(),
    expires:  Date.now() + 24 * 60 * 60 * 1000,
  })).toString('base64url');

  const sig   = crypto.createHmac('sha256', process.env.JWT_SECRET || 'changeme')
                      .update(payload).digest('hex');
  const token = `${payload}.${sig}`;

  return res.status(200).json({ token, name: user.name || username });
}
