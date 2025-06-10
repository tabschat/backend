import { Hono } from "hono";
import { stream } from "hono/streaming";

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { Redis } from "@upstash/redis";

import { db } from "@/db";


const aiRoute = new Hono()

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});


aiRoute.get('/models', async(c)=>{
    const modelList = await db.query.llms.findMany({
        with:{
            models:true
        }
    })
    return c.json(modelList, 200)
})

aiRoute.post('/generate', async (c) => {
  const { messages, id } = await c.req.json();

  if (!messages) {
    return c.json({ error: 'Prompt is required' }, 400);
  }
  try {

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API,
    });


    const code = streamText({
      model: openai('gpt-4.1-nano'),
      system: `you are a ai assistant name Gass you are 10 days old and you will only answer what is asked by the user nothing more nothing less.`,
      messages: messages, 
      onFinish: async({text, providerMetadata}) =>{
        const userMessage = messages[messages.length-1]
        // console.log("messageId", messages)

        const pipeline = redis.pipeline();
        console.log("PROVIDE METADATA", providerMetadata)
      
      pipeline.lpush(`chat:${id}:messages`, JSON.stringify({
        role: 'user',
        content: userMessage.content,
        timestamp: Date.now(),
      }));
      
      pipeline.lpush(`chat:${id}:messages`, JSON.stringify({
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
      }));
      
      await pipeline.exec();
      }
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

// {
//     "id": "gDeyDPkIHI1VDR8Z",
//     "createdAt": "2025-06-10T12:59:35.457Z",
//     "role": "user",
//     "content": "hey what are u doing ",
// }