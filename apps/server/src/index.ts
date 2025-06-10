import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { aiRoute } from "./routers/ai";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);


app.get("/", (c) => {
  return c.text("OK");
});

app.route('/ai', aiRoute)

export default app;
