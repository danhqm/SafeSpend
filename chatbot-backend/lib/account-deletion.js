import { z } from "zod";
import { receiptObjectPath } from "./receipt-deletion.js";

const PAGE_SIZE = 100;
const MAX_RECORDS = 10_000;
const MAX_LIST_PAGES = 1_000;
const requestSchema = z.object({
  password: z.string().min(1).max(1_024),
  confirmation: z.literal("DELETE"),
}).strict();

async function receiptPaths(db, userId) {
  const paths = new Set();
  let offset = 0;
  for (;;) {
    const { data, error } = await db.from("receipts").select("image_url")
      .eq("user_id", userId).order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) throw new Error("Could not load receipt paths");
    if (data.length === 0) return paths;
    offset += data.length;
    if (offset > MAX_RECORDS) throw new Error("Receipt cleanup exceeds the request limit");
    for (const receipt of data) {
      const path = receiptObjectPath(receipt.image_url, userId);
      if (path) paths.add(path);
    }
  }
}

async function ownBucketPaths(db, bucket, userId) {
  const paths = new Set();
  const folders = [{ path: userId, depth: 0 }];
  let pages = 0;
  for (let folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
    const folder = folders[folderIndex];
    let offset = 0;
    for (;;) {
      if (++pages > MAX_LIST_PAGES) throw new Error("Storage cleanup exceeds the request limit");
      const { data, error } = await db.storage.from(bucket).list(folder.path, {
        limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" },
      });
      if (error || !Array.isArray(data)) throw new Error("Could not list account files");
      if (data.length === 0) break;
      offset += data.length;
      for (const entry of data) {
        if (typeof entry.name !== "string" || !entry.name || entry.name === "." || entry.name === ".."
            || /[\\/\x00-\x1f\x7f]/.test(entry.name)) throw new Error("Invalid storage object name");
        const path = `${folder.path}/${entry.name}`;
        if (entry.id === null && entry.metadata === null) {
          if (folder.depth >= 8 || folders.length >= MAX_RECORDS) throw new Error("Storage folder limit exceeded");
          folders.push({ path, depth: folder.depth + 1 });
        } else {
          if (!entry.id) throw new Error("Invalid storage object");
          paths.add(path);
          if (paths.size > MAX_RECORDS) throw new Error("Storage object limit exceeded");
        }
      }
    }
  }
  return paths;
}

export function createAccountDeletionHandler({
  db, prepareResponse, requireUser, enforceRateLimit, reauthenticate, serverError,
}) {
  return async function handler(req, res) {
    if (!prepareResponse(req, res)) return;
    if (req.method !== "DELETE") {
      res.setHeader("Allow", "DELETE");
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }
    const user = await requireUser(req, res);
    if (!user) return;
    if (!z.string().uuid().safeParse(user.id).success || !user.email) {
      return res.status(403).json({ success: false, error: "Sign in with your account email before deleting it" });
    }
    const length = Number(req.headers?.["content-length"] ?? 0);
    if (!Number.isFinite(length) || length < 0) return res.status(400).json({ success: false, error: "Invalid request length" });
    if (length > 2_048) return res.status(413).json({ success: false, error: "Request too large" });
    if (!/^application\/json(?:;|$)/i.test(req.headers?.["content-type"] ?? "")) {
      return res.status(415).json({ success: false, error: "Use a JSON request" });
    }
    try {
      if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 2_048) {
        return res.status(413).json({ success: false, error: "Request too large" });
      }
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Enter your password and type DELETE to confirm" });
      if (!(await enforceRateLimit(res, user.id, "account-delete"))) return;
      const checked = await reauthenticate(user.email, parsed.data.password);
      if (checked.error || !checked.user) return res.status(401).json({ success: false, error: "Password not verified. Try again or reset your password." });
      if (checked.user.id !== user.id) return res.status(403).json({ success: false, error: "Account verification did not match your session" });

      // Plan all user-scoped paths before modifying anything. Listing every page
      // first avoids skipping objects when deletion would shift later offsets.
      const receipts = await receiptPaths(db, user.id);
      for (const path of await ownBucketPaths(db, "receipts", user.id)) receipts.add(path);
      const avatars = await ownBucketPaths(db, "avatars", user.id);
      for (const [bucket, paths] of [["receipts", receipts], ["avatars", avatars]]) {
        const items = [...paths];
        for (let offset = 0; offset < items.length; offset += PAGE_SIZE) {
          const { error } = await db.storage.from(bucket).remove(items.slice(offset, offset + PAGE_SIZE));
          if (error) throw new Error("Account file cleanup failed");
        }
      }
      // Retain auth and cascading database rows until all storage cleanup succeeds.
      // Missing objects are safe on retries after a partial cleanup or auth error.
      const { error } = await db.auth.admin.deleteUser(user.id, false);
      if (error) throw new Error("Account database cleanup failed");
      return res.status(200).json({ success: true });
    } catch {
      // Never pass a provider/request error containing credentials to a logger.
      return serverError(res, "Account deletion failed", new Error("Account cleanup did not finish"));
    }
  };
}
