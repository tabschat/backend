import { pgTable, varchar, uuid} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const llms = pgTable("llm", {
    id: uuid('id').defaultRandom().primaryKey().notNull().unique(),
    title: varchar({length: 225}).notNull(), //public facing llm name
    name: varchar({length: 225}).notNull(), //for internal use
})

export const models = pgTable("model", {
    id: uuid('id').defaultRandom().primaryKey().notNull().unique(),
    title: varchar({length: 225}).notNull(), //public facing llm name
    name: varchar({length: 225}).notNull(), //for internal use 
    llmId: uuid("llm_id").references(()=>llms.id, {onDelete:'cascade'}).notNull()
})

export const llmRelations  = relations(llms, ({many})=>({
    models: many(models)
}))

export const modelRelations = relations(models, ({one}) => ({
    llm: one(llms, {
        fields: [models.llmId],
        references: [llms.id]
    })
}))
