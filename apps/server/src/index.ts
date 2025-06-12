import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {auth} from "./lib/auth"

import { aiRoute } from "./routers/ai";

const app = new Hono<
{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null
	}
}
>();
app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use("/*", async (c, next) => {
  // Skip auth for /api/auth/* and root
  const path = c.req.path;
  if (path.startsWith("/api/auth/") || path === "/") {
    return next();
  }
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session || !session.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});
 
app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});


app.get("/", (c) => {
  return c.text("OK");
});

app.route('/ai', aiRoute)

if (typeof Bun !== 'undefined') {
  Bun.serve({
    fetch: app.fetch,
    port: 3000,
    idleTimeout: 255 // 1 hour
  });
}

export default app;
