import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {auth} from "./backend/lib/auth"

import { aiRoute } from "./backend/routers/ai";


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
  const path = c.req.path;
  if (path.startsWith("/api/auth/") || path === "/" || path.startsWith("/ai/shared/")) {
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
    console.log('Incoming request to /api/auth/*:', c.req.url);
	return auth.handler(c.req.raw);
});

app.get("/", async (c)=>{
  return c.json({"message": "ok"}, 200);
})

app.route('/ai', aiRoute)


Bun.serve({
  fetch: app.fetch,
  port: process.env.PORT || 3000,
});


export default app;
