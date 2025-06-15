import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";

import * as schema from "../db/schema/auth"

console.log("FRONTEND_URL at auth init:", process.env.FRONTEND_URL);

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema
  }),
  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:3000"
  ],
   callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      console.log('FRONTEND_URL from env:', process.env.FRONTEND_URL);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173"
      
      // If the URL is relative, prepend frontend URL
      if (url?.startsWith("/")) {
        return `${frontendUrl}${url}`
      }
      
      // If no specific URL, default to dashboard
      return `${frontendUrl}/`
    }
  },
  socialProviders:{
    google: { 
      clientId: process.env.GOOGLE_CLIENT_ID as string, 
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string, 
      redirectUri: "http://localhost:3000/api/auth/callback/google"
    },
  },
  onAPIError: {
    onError: (error, ctx) => {
      console.error("Better Auth API Error:", error);
      // You can also inspect ctx.req and ctx.res here
    },
    throw: false // Set to true if you want to re-throw the error after logging
  }
});


