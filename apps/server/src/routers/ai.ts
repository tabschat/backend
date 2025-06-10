import { Hono } from "hono";
import { stream } from "hono/streaming";

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

import { db } from "@/db";


const aiRoute = new Hono()

aiRoute.get('/models', async(c)=>{
    const modelList = await db.query.llms.findMany({
        with:{
            models:true
        }
    })
    return c.json(modelList, 200)
})

aiRoute.post('/generate', async (c) => {
  const { messages } = await c.req.json();
  console.log("----- ----- ---- -message ------------", messages)

  if (!messages) {
    return c.json({ error: 'Prompt is required' }, 400);
  }
  try {

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API
    });

    const code = streamText({
      model: openai('gpt-4o-mini-2024-07-18'),
      system: `you are a ai assistant name Gass you are 10 days old and you will only answer what is asked by the user nothing more nothing less.`,
      messages: messages
    });

    c.header('X-Vercel-AI-Data-Stream', 'v1');
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Content-Encoding', 'none');

    return stream(c, stream => stream.pipe(code.toDataStream()));

  } catch (error: any) {
    console.error('Error generating component:', error);
    return c.json({ error: error.message || 'Failed to generate component' }, 500);
  }
});

export { aiRoute }