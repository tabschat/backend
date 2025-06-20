import { Hono } from "hono";
import { stream } from "hono/streaming";

import { createOpenAI , OpenAIProvider} from "@ai-sdk/openai";
import { createGoogleGenerativeAI , GoogleGenerativeAIProvider} from '@ai-sdk/google';
import { createOpenRouter , OpenRouterProvider} from "@openrouter/ai-sdk-provider";
import { streamText, generateText } from "ai";
import { Redis } from "@upstash/redis";

import { db } from "db";
import { auth } from "@/lib/auth";
import { message } from "db/schema/message.js";
import { eq, isNotNull } from "drizzle-orm";

import { v4 as uuidv4 } from "uuid";

const aiRoute = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

aiRoute.get("/models", async (c) => {
  const modelList = await db.query.llms.findMany({
    with: {
      models: true,
    },
  });
  return c.json(modelList, 200);
});

// id is thread id whole chat id
aiRoute.post("/completion", async (c) => {
  try {
    // Get the prompt and chat ID from request body; generate new chatId if missing or first message
    const { prompt, chatId, messages, llm, apiKey, model } = await c.req.json();
    const userId = c.get("user")?.id;
    console.log(llm, apiKey, model)

    if (!chatId || !userId)
      return c.json({ error: "Chat Id or User Id required" }, 407);
    if (!apiKey) return c.json({ message: "Invalid key" }, 400);

    let operator: OpenRouterProvider | GoogleGenerativeAIProvider | OpenAIProvider

    switch (llm) {
      case "openai":
        operator = createOpenAI({
          apiKey: apiKey
        });
        break;
      case "gemini":
        operator = createGoogleGenerativeAI({
          apiKey: apiKey
        });
        break;
      case "openrouter":
        operator = createOpenRouter({
          apiKey: apiKey,
        });
        break
        case "groq":
         operator = createOpenAI({
          apiKey: apiKey,
          baseURL:"https://api.groq.com/openai/v1",
        });
        break
      default:
        return c.json({"message": "Invalid llm"}, 400)
    }


    const generatedUserInputId = `usr-${uuidv4()}`;
    const generatedMsgId = `msg-${uuidv4()}`;
    const userInputObj = {
      role: "user",
      content: prompt,
      id: generatedUserInputId,
      timestamp: new Date(),
      type: "user_input",
    };

    const msgLen = messages ? messages.length : 0;

    // Create a chat history; using useCompletion in frontend end and it doesnot proded with chathistory/messages array with curreny user input so we have to create that
    let newMssgArray;
    if (msgLen > 0) {
      const msg = messages;
      newMssgArray = msg;
      newMssgArray.push(userInputObj);
    } else {
      newMssgArray = [userInputObj];
    }

    let wholeSentence = "";

    if (!prompt) {
      return c.json({ error: "Prompt is required" }, 400);
    }

    await redis.publish(`chat:${chatId}`, userInputObj);
    await redis.lpush(`chat:${chatId}:messages`, userInputObj);

    const result = streamText({
      model: operator.chat(model),
      messages: newMssgArray,
      system: `you are a ai assistant name Gass you are 10 days old and you will only answer what is asked by the user nothing more nothing less.`,
      onChunk: async ({ chunk }) => {
        if (chunk.type === "text-delta") {
          wholeSentence += chunk.textDelta;
        }
        await redis.publish(`chat:${chatId}`, {
          role: "assistant",
          id: generatedMsgId,
          content: wholeSentence,
          timestamp: new Date(),
          type: "chat_streaming",
        });
      },
      onFinish: async ({ text }) => {
        // save the generated content data in upstash redis

        await redis.lpush(
          `chat:${chatId}:messages`,
          JSON.stringify({
            role: "assistant",
            id: generatedMsgId,
            content: text,
            timestamp: Date.now(),
          })
        );

        // // save the generated message refference in the user mssage column if esist the just update the updateAT column
        const newMsg: typeof message.$inferInsert = {
          id: chatId,
          userId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db
          .insert(message)
          .values(newMsg)
          .onConflictDoUpdate({
            target: message.id,
            set: {
              updatedAt: new Date(),
            },
          });

        // generate title for new chat/message array/ convo
        // if msg len 0 that smen it is new msg and then we have to generate the title for it, after comolitaion generated and mutate the url in frontend to get latest title
        if (msgLen === 0) {
          const { text: generatedTitle } = await generateText({
            // model: openai("gpt-4o-mini-2024-07-18"),
            model: operator.chat(model),
            prompt: `Generate a title under 56 characters for the following content. Prioritize Content1: ${text}. If the title derived from Content1 is not descriptive or meaningful, then use Context2: ${prompt} for title generation instead. Never use both. NOTE: never use quote the tile should simply be text witoout the quote:`,
          });
          await db
            .update(message)
            .set({ title: generatedTitle })
            .where(eq(message.id, chatId));
        }
        // after the assistant message streamed end and data will save in teh db the publish one more tiem the assistant data with type:chat_complited
        await redis.publish(
          `chat:${chatId}`,
          JSON.stringify({
            role: "assistant",
            id: generatedMsgId,
            content: wholeSentence,
            timestamp: new Date().toISOString(),
            type: "chat_completed", //make sure
            chatId: chatId,
          })
        );
      },
      onError: (err) => {
        console.log("Error", err);
      }
    });

    // Set required headers for AI SDK data stream
    c.header("X-Vercel-AI-Data-Stream", "v1");
    c.header("Content-Type", "text/plain; charset=utf-8");
    c.header("Content-Encoding", "none");

    // Return the data stream
    return stream(c, (stream) => stream.pipe(result.toDataStream()));
  } catch (error) {
    console.error("Completion error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// we are assuming llm will always present
aiRoute.post("/verify-key", async (c) => {
  try {
    const { prompt: apiKey, llm } = await c.req.json();
    console.log("LLM, Key", llm, apiKey)

    if (!apiKey) {
      return c.json({ message: "Invalid Key" }, 400);
    }

    if (llm === "openrouter") {
      const openrouter = createOpenRouter({
        apiKey: apiKey,
      });
      const { text } = await generateText({
        model: openrouter.chat("gpt-3.5-turbo"),
        prompt:
          "what is 2+2, just return a answer in single number, dont add any explanation",
      });
      return c.json({ text }, 200);
    }
    if(llm=== "gemini"){
      const google = createGoogleGenerativeAI({
        apiKey:apiKey
      })
      const { text } = await generateText({
        model: google('gemini-2.5-flash-preview-04-17'),
        prompt:
          "what is 2+2, just return a answer in single number, dont add any explanation",
      });
      return c.json({ text }, 200);
    }

    if(llm==="openai"){
      const openai = createOpenAI({
        apiKey:apiKey
      });
       const { text } = await generateText({
        model: openai('gpt-4.1-nano'),
        prompt:
          "what is 2+2, just return a answer in single number, dont add any explanation",
      });
      return c.json({ text }, 200);
    }
    if(llm==="groq"){
      const groq = createOpenAI({
          apiKey: apiKey,
          baseURL: 'https://api.groq.com/openai/v1',
      });
       const { text } = await generateText({
        model: groq('gemma2-9b-it'),
        prompt:
          "what is 2+2, just return a answer in single number, dont add any explanation",
        onStepFinish: ({response}) => {
          console.log(response)
        }
      });
      return c.json({ text }, 200);
    }

  } catch (err) {
    console.error("Error verifying API key:", err);
    return c.json(
      {
        message: "Invalid API key or request failed",
      },
      400
    );
  }
});

aiRoute.get("/stream/:chatId", async (c) => {
  const chatId = c.req.param("chatId");

  const setKey = `chat:${chatId}`;
  const upstashUrl = `${process.env.UPSTASH_REDIS_REST_URL}/subscribe/${setKey}`;

  const initialMessage = "data:";

  try {
    // Fetch SSE stream from Upstash Redis REST API
    const upstashResponse = await fetch(upstashUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        Accept: "text/event-stream",
      },
    });

    if (!upstashResponse.ok) {
      return c.text("Failed to subscribe to Upstash Redis", 500);
    }

    const upstashStream = upstashResponse.body;

    // Create a combined stream: initial message followed by Upstash stream
    const combinedStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(initialMessage));
        if (!upstashStream) {
          return null;
        }
        const reader = upstashStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      },
    });

    // Return the SSE stream with appropriate headers
    return new Response(combinedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "http://localhost:5173",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  } catch (error) {
    console.error("SSE Route error:", error);
    return c.text("Internal server error", 500);
  }
});

aiRoute.get("/threads", async (c) => {
  const currentUserId = c.get("user")?.id;
  if (!currentUserId) {
    return c.json({ error: "Unauthorized User" }, 401);
  }
  try {
    const threads = await db.query.message.findMany({
      where: (message, { eq, and }) =>
        and(eq(message.userId, currentUserId), isNotNull(message.title)),
      orderBy: (message, { desc }) => [desc(message.updatedAt)],
      columns: {
        id: true,
        title: true,
        updatedAt: true,
      },
      limit: 20,
    });
    return c.json({ threads }, 200);
  } catch (error: any) {
    console.log("rrr in thred--", error);
    return c.json({
      error: error.message || "Error while getting the generated threads",
    });
  }
});

aiRoute.delete("delete-thread/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  const currentUserId = c.get("user")?.id;
  console.log(threadId, currentUserId);
  if (!currentUserId) {
    return c.json({ error: "Unauthorized User" }, 401);
  }

  try {
    const msg = await db.query.message.findFirst({
      where: (message, { eq }) => eq(message.id, threadId),
    });
    if (!msg) {
      return c.json({ error: "Thread not found" }, 404);
    }

    if (msg.userId !== currentUserId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    await db.delete(message).where(eq(message.id, threadId));
    return c.json({ message: "Thread deleted successfuly" }, 200);
  } catch (error: any) {
    console.log(error);
    return c.json(
      { error: error.message || "Error while deleting the thread" },
      500
    );
  }
});
// get/threadId "" varify uuid4 f not return 404

// get thread msgs
aiRoute.get("thread/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  const isPublic = c.req.query("is_public");
  const currentUserId = c.get("user")?.id;
  console.log(threadId, currentUserId);
  if (!currentUserId) {
    return c.json({ error: "Unauthorized User" }, 401);
  }

  const msg = await db.query.message.findFirst({
    where: (message, { eq }) => eq(message.id, threadId),
  });
  if (!msg) {
    return c.json({ error: "Thread not found" }, 404);
  }

  if (msg.userId !== currentUserId) {
    return c.json({ error: "Unauthorized" }, 403);
  }
  const threads = await redis.lrange(`chat:${threadId}:messages`, 0, -1);
  const chats = (
    Array.isArray(threads) ? threads : Object.values(threads as string)
  )
    .map((thd) => thd!)
    .reverse(); // Reverse since lpush adds to beginning

  return c.json({ chats });
});

aiRoute.get("shared/:threadId", async (c) => {
  const threadId = c.req.param("threadId");

  const msg = await db.query.message.findFirst({
    where: (message, { eq }) => eq(message.id, threadId),
  });
  if (!msg || !msg.isPublic) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const threads = await redis.lrange(`chat:${threadId}:messages`, 0, -1);
  const chats = (
    Array.isArray(threads) ? threads : Object.values(threads as string)
  )
    .map((thd) => thd!)
    .reverse();

  return c.json({ chats });
});

// share the chat
aiRoute.get("publish-thread/:threadId", async (c) => {
  const currentUserId = c.get("user")?.id;
  const threadId = c.req.param("threadId");
  const isPublicQuery = c.req.query("isp");

  let isPublic: boolean = false;
  if (isPublicQuery === "true") {
    isPublic = true;
  }
  if (isPublicQuery === "false") {
    isPublic = false;
  }

  if (!currentUserId) {
    return c.json({ error: "Unauthorized User" }, 401);
  }

  try {
    const msg = await db.query.message.findFirst({
      where: (message, { eq }) => eq(message.id, threadId),
    });
    if (!msg) {
      return c.json({ error: "Thread not found" }, 404);
    }

    if (msg.userId !== currentUserId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    if (isPublicQuery) {
      await db
        .update(message)
        .set({ isPublic: isPublic, updatedAt: new Date() })
        .where(eq(message.id, threadId));
      return c.json(
        { id: msg.id, title: msg.title, isPublic: msg.isPublic },
        200
      );
    }
    // remove the userID from here asap
    return c.json(
      { id: msg.id, title: msg.title, isPublic: msg.isPublic },
      200
    );
  } catch (error: any) {
    console.log(error);
    return c.json(
      { error: error.message || "Error while updating the thread" },
      500
    );
  }
});

aiRoute.get("fork/:threadId", async (c) => {
  try {
    const threadId = c.req.param("threadId");
    const userId = c.get("user")?.id;
    const generatedMsgId = uuidv4();

    if (!userId) {
      return c.json({ error: "User not found" }, 404);
    }

    // Find the original message/thread
    const msg = await db.query.message.findFirst({
      where: (message, { eq }) => eq(message.id, threadId),
    });

    if (!msg || !msg.isPublic) {
      return c.json({ error: "Chat not found" }, 404);
    }

    // Get all messages from the original thread
    const savedThreads = await redis.lrange(`chat:${threadId}:messages`, 0, -1);

    if (!savedThreads || savedThreads.length === 0) {
      return c.json({ error: "Fork failed. No messages found." }, 404);
    }

    // Create a new thread in the database
    await db.insert(message).values({
      id: generatedMsgId,
      title: msg.title,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: userId,
      isPublic: false,
    });

    // Copy messages as a new msg/thread with new message id thats it
    const pipeline = redis.pipeline();
    savedThreads.forEach((msg) => {
      pipeline.rpush(`chat:${generatedMsgId}:messages`, msg);
    });
    await pipeline.exec();

    return c.json(
      { message: "Forked successfully", newThreadId: generatedMsgId },
      200
    );
  } catch (error) {
    console.error("Forking error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export { aiRoute };
