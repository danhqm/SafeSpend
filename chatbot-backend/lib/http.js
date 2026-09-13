import { supabaseAdmin } from "./supabase.js";

export function prepareResponse(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = req.headers.origin;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }
  return true;
}

export async function requireUser(req, res) {
  const authorization = req.headers.authorization ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(match[1]);
  if (error || !data.user) {
    res.status(401).json({ success: false, error: "Invalid or expired session" });
    return null;
  }

  const ownerUserId = process.env.OWNER_USER_ID;
  if (ownerUserId && data.user.id !== ownerUserId) {
    res.status(403).json({ success: false, error: "Access denied" });
    return null;
  }
  return data.user;
}

export function serverError(res, context, error) {
  console.error(context, error);
  return res.status(500).json({ success: false, error: "Unexpected server error" });
}
