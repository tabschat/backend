import { drizzle } from "drizzle-orm/node-postgres";
import * as modelSchema from './schema/model'
import * as authSchema from './schema/auth'
import * as messageSchema from './schema/message'

export const db = drizzle(process.env.DATABASE_URL || "", {schema: {...modelSchema, ...authSchema, ...messageSchema}});
