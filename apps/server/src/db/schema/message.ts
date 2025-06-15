import { pgTable, text, timestamp, uuid, boolean} from "drizzle-orm/pg-core";
import {user} from "./auth"

export const message = pgTable("message", {
    id: uuid("id").primaryKey(),
    title: text("title"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    // isPublic for sharing to the public
    isPublic: boolean("is_public").default(false),
    userId: text('user_id').notNull().references(()=>user.id, {onDelete: "cascade"})
})