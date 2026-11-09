import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

export const config = { path: "/api/site" };

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export default async (req) => {
  const store = getStore("site");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("img");
    if (id) {
      if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
      const file = await store.getWithMetadata("img-" + id, { type: "arrayBuffer" });
      if (!file) return new Response("Not found", { status: 404 });
      return new Response(file.data, { headers: { "content-type": file.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
    }
    const cfg = await store.get("config", { type: "json" });
    return Response.json(cfg || {}, { headers: { "cache-control": "no-store" } });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !same(req.headers.get("x-admin-password") || "", pw)) return new Response("Unauthorized", { status: 401 });

  let body;
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  if (body.check) return Response.json({ ok: true });

  if (body.image) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
    if (!m) return new Response("Bad image", { status: 400 });
    const data = Buffer.from(m[2], "base64");
    if (data.length > 2_000_000) return new Response("Image too large", { status: 413 });
    const id = crypto.randomUUID();
    await store.set("img-" + id, data, { metadata: { type: m[1] } });
    return Response.json({ url: "/api/site?img=" + id });
  }

  if (body.config && typeof body.config === "object") {
    const c = body.config;
    if (typeof c.name !== "string" || !Array.isArray(c.banners) || !Array.isArray(c.menu)) return new Response("Bad config", { status: 400 });
    const json = JSON.stringify({ name: c.name, logo: typeof c.logo === "string" ? c.logo : "", showName: c.showName !== false, banners: c.banners, menu: c.menu });
    if (json.length > 900_000) return new Response("Config too large", { status: 413 });
    await store.set("config", json);
    return Response.json({ ok: true });
  }
  return new Response("Bad request", { status: 400 });
};
