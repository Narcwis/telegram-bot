import "dotenv/config";
import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import ytdlp from "youtube-dl-exec";
import { GoogleGenerativeAI } from "@google/generative-ai";
import telegramifyMarkdown from "telegramify-markdown";
import routes from "./routes";

const mdv2 = (s: string) => {
  console.log("Original message:", s);
  // Remove markdown code block wrapper if present
  s = s.replace(/^```markdown/, "").replace(/```/g, "");
  console.log("Message after removing triple backticks:", s);
  return telegramifyMarkdown(s, "escape");
};

type TelegramChat = {
  id: number;
  type?: string;
};

type TelegramMessage = {
  message_id?: number;
  chat?: TelegramChat;
  text?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number };
    message?: TelegramMessage;
    data?: string;
  };
};

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const TARGET_CHAT_ID = Number(process.env.TARGET_CHAT_ID ?? "-1003322384328");

// Use /data directory when running in Home Assistant addon, otherwise use local directories
const IS_ADDON = fs.existsSync("/data/options.json");
const BASE_DIR = IS_ADDON ? "/data" : process.cwd();
const TMP_DIR = path.join(BASE_DIR, "tmp");
const DATA_DIR = path.join(BASE_DIR, "data");
const MD_DIR = path.join(DATA_DIR, "md");
const DB_PATH = path.join(DATA_DIR, "bot.db");

// Serve markdown files from data/md directory
app.use("/md", express.static(MD_DIR));
const YTDLP_BIN = process.env.YTDLP_PATH; // optional override for yt-dlp binary
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const GEMINI_PROMPT =
  process.env.GEMINI_PROMPT || "Analyze this video and provide a summary.";

console.log(`Using Telegram API URL: ${TELEGRAM_API_URL}`);

const ensureTmpDir = async (): Promise<void> => {
  await fs.promises.mkdir(TMP_DIR, { recursive: true });
};

const ensureDataDir = async (): Promise<void> => {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
};

const ensureMdDir = async (): Promise<void> => {
  await fs.promises.mkdir(MD_DIR, { recursive: true });
};

const db = (() => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const instance = new Database(DB_PATH);
  instance
    .prepare(
      "CREATE TABLE IF NOT EXISTS downloads (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "message_id INTEGER UNIQUE NOT NULL, " +
        "file_path TEXT, " +
        "status TEXT NOT NULL, " +
        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP" +
        ")"
    )
    .run();
  // Add url column if missing and create unique index for url
  try {
    instance.prepare("ALTER TABLE downloads ADD COLUMN url TEXT").run();
  } catch (e) {
    // ignore if already exists
  }
  try {
    instance
      .prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_downloads_url ON downloads(url)"
      )
      .run();
  } catch (e) {
    // ignore
  }
  instance
    .prepare(
      "CREATE TABLE IF NOT EXISTS api_keys (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "api_key TEXT UNIQUE NOT NULL, " +
        "usage_count INTEGER DEFAULT 0, " +
        "last_used DATETIME" +
        ")"
    )
    .run();

  // Initialize API keys in database
  if (GEMINI_API_KEYS.length === 0) {
    console.warn("Warning: No GEMINI_API_KEY set. Gemini analysis will fail.");
  } else {
    for (const key of GEMINI_API_KEYS) {
      instance
        .prepare(
          "INSERT OR IGNORE INTO api_keys (api_key, usage_count, last_used) VALUES (?, 0, NULL)"
        )
        .run(key);
    }
    console.log(`Initialized ${GEMINI_API_KEYS.length} Gemini API key(s)`);
  }

  return instance;
})();

const extractFirstUrl = (text?: string): string | null => {
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[)>\]]+$/, "") : null;
};

const downloadToTmp = async (
  url: string,
  filename: string
): Promise<string> => {
  await ensureTmpDir();
  await ensureDataDir();
  const destination = path.join(TMP_DIR, filename);

  // Use yt-dlp to fetch best video+audio and merge to mp4 (requires ffmpeg installed)
  const ytdlpOpts: Record<string, unknown> = {
    output: destination,
    format: "bv*+ba/b",
    mergeOutputFormat: "mp4",
    quiet: true,
  };
  // youtube-dl-exec uses PATH by default; allow override via env by adjusting PATH
  const envPath = YTDLP_BIN
    ? `${path.dirname(YTDLP_BIN)}${path.delimiter}${process.env.PATH ?? ""}`
    : process.env.PATH;

  await ytdlp(url, ytdlpOpts as any, {
    env: { ...process.env, PATH: envPath },
  });

  return destination;
};

type VideoTextMetadata = {
  title?: string | null;
  description?: string | null;
};

const getVideoTextMetadata = async (
  url: string
): Promise<VideoTextMetadata> => {
  // Try to fetch title and description using yt-dlp without downloading
  const envPath = YTDLP_BIN
    ? `${path.dirname(YTDLP_BIN)}${path.delimiter}${process.env.PATH ?? ""}`
    : process.env.PATH;

  let title: string | null = null;
  let description: string | null = null;
  try {
    const t = (await ytdlp(
      url,
      {
        getTitle: true, // --get-title
        skipDownload: true,
        quiet: true,
      } as any,
      { env: { ...process.env, PATH: envPath } }
    )) as any;
    // youtube-dl-exec returns stdout string for --get-title
    title = typeof t === "string" ? t.trim() : String(t ?? "").trim();
  } catch (e) {
    console.warn("Failed to get title via yt-dlp", e);
  }

  try {
    const d = (await ytdlp(
      url,
      {
        getDescription: true, // --get-description
        skipDownload: true,
        quiet: true,
      } as any,
      { env: { ...process.env, PATH: envPath } }
    )) as any;
    description = typeof d === "string" ? d.trim() : String(d ?? "").trim();
  } catch (e) {
    console.warn("Failed to get description via yt-dlp", e);
  }

  return { title: title || null, description: description || null };
};

// Using Telegram Markdown parse mode; ensure your prompt outputs Telegram-supported Markdown.

const escapeMarkdownV2 = (s: string): string => {
  // Escape all Telegram MarkdownV2 special characters
  return s.replace(/[\\_\*\[\]\(\)~`>#+\-=|{}\.\!]/g, (m) => `\\${m}`);
};

const sendTelegramMessage = async (
  chatId: number,
  text: string,
  replyToMessageId?: number,
  replyMarkup?: any
): Promise<number | null> => {
  const payload: any = {
    chat_id: chatId,
    text: mdv2(text),
    parse_mode: "MarkdownV2",
  };
  if (replyToMessageId !== undefined) {
    payload.reply_to_message_id = replyToMessageId;
  }
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    if (!data.ok || !data.result?.message_id) {
      console.error("Failed to send Telegram message", data);
      return null;
    }
    return data.result.message_id as number;
  } catch (err) {
    console.error("Error sending Telegram message", err);
    return null;
  }
};
const answerCallbackQuery = async (
  callbackQueryId: string,
  text?: string
): Promise<void> => {
  await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  });
};

const editTelegramMessage = async (
  chatId: number,
  messageId: number,
  text: string
): Promise<void> => {
  const res = await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: mdv2(text),
      parse_mode: "MarkdownV2",
    }),
  });
  console.log(
    `Edited message ${messageId} in chat ${chatId}, status: ${res.status}`
  );
};

// Removed updateStatusMessage wrapper; use editTelegramMessage directly

const isQuotaError = (err: unknown): boolean => {
  const msg = (err as any)?.message?.toLowerCase?.() ?? "";
  return (
    msg.includes("quota") ||
    msg.includes("exceed") ||
    msg.includes("429") ||
    msg.includes("rate")
  );
};

const getNextApiKey = (): string | null => {
  if (GEMINI_API_KEYS.length === 0) return null;

  // Get least recently used key
  const row = db
    .prepare(
      "SELECT api_key FROM api_keys ORDER BY last_used IS NULL DESC, last_used ASC, usage_count ASC LIMIT 1"
    )
    .get() as { api_key: string } | undefined;

  if (!row) return GEMINI_API_KEYS[0];

  // Update usage
  db.prepare(
    "UPDATE api_keys SET usage_count = usage_count + 1, last_used = datetime('now') WHERE api_key = ?"
  ).run(row.api_key);

  console.log(`Using API key: ${row.api_key.substring(0, 10)}...`);
  return row.api_key;
};

const analyzeVideoWithGemini = async (
  videoPath: string,
  messageId: number,
  metadata?: VideoTextMetadata & { url?: string | null }
): Promise<string> => {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Read video file and convert to base64
  const videoBuffer = await fs.promises.readFile(videoPath);
  const videoBase64 = videoBuffer.toString("base64");

  const modelsToTry = ["gemini-2.5-flash"];

  let lastError: unknown;
  const maxKeyRetries = GEMINI_API_KEYS.length;

  for (let keyAttempt = 0; keyAttempt < maxKeyRetries; keyAttempt++) {
    const apiKey = getNextApiKey();
    if (!apiKey) {
      throw new Error("No API key available");
    }

    const client = new GoogleGenerativeAI(apiKey);

    for (const modelName of modelsToTry) {
      try {
        const model = client.getGenerativeModel({ model: modelName });
        const contextParts: any[] = [];
        if (metadata) {
          const contextLines: string[] = [];
          if (metadata.url) contextLines.push(`Source URL: ${metadata.url}`);
          if (metadata.title) contextLines.push(`Title: ${metadata.title}`);
          if (metadata.description) {
            // Truncate overly long descriptions to keep request reasonable
            const MAX_DESC = 4000;
            const desc =
              metadata.description.length > MAX_DESC
                ? metadata.description.slice(0, MAX_DESC) + "\n..."
                : metadata.description;
            contextLines.push(`Description:\n${desc}`);
          }
          if (contextLines.length) {
            contextParts.push(
              "Additional context from the page metadata (may be incomplete):\n" +
                contextLines.join("\n")
            );
          }
        }

        const result = await model.generateContent([
          ...contextParts,
          {
            inlineData: {
              data: videoBase64,
              mimeType: "video/mp4",
            },
          },
          GEMINI_PROMPT,
        ]);

        const markdownResponse = result.response.text();

        // Save markdown response
        await ensureMdDir();
        const mdPath = path.join(MD_DIR, `${messageId}.md`);
        await fs.promises.writeFile(mdPath, markdownResponse, "utf-8");

        // Save metadata JSON next to markdown if available
        if (
          metadata &&
          (metadata.url || metadata.title || metadata.description)
        ) {
          const metaPath = path.join(MD_DIR, `${messageId}.json`);
          const metaOut = {
            url: metadata.url ?? null,
            title: metadata.title ?? null,
            description: metadata.description ?? null,
            analyzed_at: new Date().toISOString(),
            model: modelName,
          };
          await fs.promises.writeFile(
            metaPath,
            JSON.stringify(metaOut, null, 2),
            "utf-8"
          );
        }

        console.log(`Successfully analyzed with model ${modelName}`);
        return markdownResponse;
      } catch (err) {
        lastError = err;
        console.error(
          `Gemini model ${modelName} with key attempt ${keyAttempt + 1} failed`,
          err
        );
        if (!isQuotaError(err)) {
          throw err;
        }
        // If quota error on this model, try next model
      }
    }
    // If all models failed with quota error for this key, try next key
    console.log(
      `All models failed for key attempt ${keyAttempt + 1}, trying next key...`
    );
  }

  throw (
    lastError || new Error("Gemini analysis failed: all API keys exhausted")
  );
};

app.use(express.json());

app.use("/", routes);

app.post("/webhook", async (req: Request, res: Response) => {
  const { message, callback_query } = req.body as TelegramUpdate;
  if (callback_query?.data) {
    // Handle inline button callbacks
    const data = callback_query.data;
    if (data.startsWith("rerun:")) {
      // Format: rerun:prevMessageId:newMessageId
      const parts = data.split(":");
      if (parts.length >= 3) {
        const prevId = Number(parts[1]);
        const newId = Number(parts[2]);
        // Retrieve URL from previous download entry to keep callback_data short
        const row = db
          .prepare("SELECT url FROM downloads WHERE message_id = ?")
          .get(prevId) as { url?: string } | undefined;
        const url = row?.url ?? null;
        if (!url) {
          await answerCallbackQuery(
            callback_query.id,
            "No URL found for previous analysis."
          );
          res.sendStatus(200);
          return;
        }
        const chatId = callback_query.message?.chat?.id ?? TARGET_CHAT_ID;
        const statusMsgId = callback_query.message?.message_id!;
        await answerCallbackQuery(callback_query.id, "Re-running analysis...");
        try {
          await editTelegramMessage(
            chatId,
            statusMsgId,
            "⏳ **Re-running analysis...**"
          );

          const filename = `${newId}.mp4`;
          db.prepare(
            "INSERT OR REPLACE INTO downloads (message_id, file_path, status, url) VALUES (?, ?, ?, ?)"
          ).run(newId, filename, "downloading", url);

          const savedPath = await downloadToTmp(url, filename);
          db.prepare(
            "INSERT OR REPLACE INTO downloads (message_id, file_path, status, url) VALUES (?, ?, ?, ?)"
          ).run(newId, filename, "done", url);

          // Fetch metadata and analyze
          let meta: VideoTextMetadata | null = null;
          try {
            meta = await getVideoTextMetadata(url);
          } catch (e) {
            console.warn("Failed to retrieve video metadata", e);
          }

          const geminiResponse = await analyzeVideoWithGemini(
            savedPath,
            newId,
            {
              ...(meta || {}),
              url,
            }
          );

          // Rename new md to include both IDs, keeping old md
          try {
            const oldMd = path.join(MD_DIR, `${prevId}.md`);
            const newMd = path.join(MD_DIR, `${newId}.md`);
            const combinedMd = path.join(MD_DIR, `${prevId}-${newId}.md`);
            // If new md exists, rename to combined; if not, skip
            if (fs.existsSync(newMd)) {
              await fs.promises.rename(newMd, combinedMd);
            }
          } catch (renameErr) {
            console.warn("Failed to rename md to combined name", renameErr);
          }

          // Clean up video file
          try {
            await fs.promises.unlink(savedPath);
          } catch (e) {}

          await editTelegramMessage(chatId, statusMsgId, geminiResponse);
        } catch (e) {
          console.error("Re-run failed", e);
          await editTelegramMessage(
            chatId,
            statusMsgId,
            "❌ **Re-run failed. Please try again later.**"
          );
        }
      } else {
        await answerCallbackQuery(callback_query.id);
      }
    } else {
      await answerCallbackQuery(callback_query.id);
    }
    res.sendStatus(200);
    return;
  }

  console.log("Webhook triggered:", message?.text);

  if (message?.chat?.id !== TARGET_CHAT_ID || !message?.message_id) {
    res.sendStatus(200);
    return;
  }
  const chatId = message.chat!.id;

  const url = extractFirstUrl(message.text);
  if (!url) {
    if (message.message_id !== undefined) {
      await sendTelegramMessage(
        chatId,
        "No video link detected in your message.",
        message.message_id
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "No video link detected in your message."
      );
    }
    res.sendStatus(200);
    return;
  }

  // Check if URL has been processed before
  const existingByUrl = db
    .prepare("SELECT message_id, status FROM downloads WHERE url = ?")
    .get(url) as { message_id?: number; status?: string } | undefined;
  if (existingByUrl?.status === "done" && existingByUrl.message_id) {
    const prevId = existingByUrl.message_id;
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: "Re-run analysis",
            callback_data: `rerun:${prevId}:${message.message_id}`,
          },
        ],
      ],
    };
    await sendTelegramMessage(
      chatId,
      `This link was already processed. Press to re-run.`,
      message.message_id,
      replyMarkup
    );
    res.sendStatus(200);
    return;
  }

  // Always use .mp4 since yt-dlp merges to mp4 format
  const filename = `${message.message_id}.mp4`;

  try {
    // Send initial status message
    const statusMessageId = await sendTelegramMessage(
      chatId,
      "⏳ **Downloading video...**",
      message.message_id !== undefined ? message.message_id : undefined
    );

    const canEditStatus = Boolean(statusMessageId);

    db.prepare(
      "INSERT OR REPLACE INTO downloads (message_id, file_path, status, url) VALUES (?, ?, ?, ?)"
    ).run(message.message_id, filename, "downloading", url);

    const savedPath = await downloadToTmp(url, filename);

    db.prepare(
      "INSERT OR REPLACE INTO downloads (message_id, file_path, status, url) VALUES (?, ?, ?, ?)"
    ).run(message.message_id, filename, "done", url);

    // Analyze video with Gemini
    try {
      // Update status: awaiting Gemini response
      if (canEditStatus && statusMessageId) {
        await editTelegramMessage(
          chatId,
          statusMessageId,
          "⏳ **Waiting for AI analysis...**  "
        );
      }

      // Start status update interval
      const statusInterval = canEditStatus
        ? setInterval(async () => {
            const timestamp = new Date().toLocaleTimeString();
            try {
              await editTelegramMessage(
                chatId,
                statusMessageId!,
                `⏳ **Waiting for AI analysis...**  \n__Updated: ${timestamp}__`
              );
            } catch (e) {
              console.warn("Failed to edit status message", e);
            }
          }, 10000)
        : null;

      // Fetch textual metadata (title/description) to provide context to Gemini
      let meta: VideoTextMetadata | null = null;
      try {
        meta = await getVideoTextMetadata(url);
      } catch (e) {
        console.warn("Failed to retrieve video metadata", e);
      }

      const geminiResponse = await analyzeVideoWithGemini(
        savedPath,
        message.message_id,
        {
          ...(meta || {}),
          url,
        }
      );

      // Clear the interval and replace with final response
      if (statusInterval) clearInterval(statusInterval);
      let finalText = geminiResponse;
      if ((meta && (meta.title || meta.description)) || url) {
        const MAX_META_DESC = 600;
        const rawDesc = meta?.description ?? null;
        const descShort = rawDesc
          ? rawDesc.length > MAX_META_DESC
            ? rawDesc.slice(0, MAX_META_DESC) + "\n..."
            : rawDesc
          : null;
        const metaLines: string[] = ["", "**Source Context**"]; // leading blank line separation
        if (meta?.title) metaLines.push(`**Title:** ${meta.title}`);
        if (url) metaLines.push(`**URL:** ${url}`);
        if (descShort) metaLines.push(`**Description:**\n${descShort}`);
        finalText += "\n\n" + metaLines.join("\n");
      }
      if (canEditStatus && statusMessageId) {
        await editTelegramMessage(chatId, statusMessageId, finalText);
      } else {
        await sendTelegramMessage(chatId, finalText);
      }
    } catch (geminiError) {
      console.error("Gemini analysis failed", geminiError);
      if (canEditStatus && statusMessageId) {
        await editTelegramMessage(
          chatId,
          statusMessageId,
          "❌ **Failed to analyze video with AI.**"
        );
      } else {
        await sendTelegramMessage(
          chatId,
          "❌ **Failed to analyze video with AI.**"
        );
      }
    } finally {
      // Delete the video file after analysis
      try {
        await fs.promises.unlink(savedPath);
        console.log(`Deleted video file: ${savedPath}`);
      } catch (deleteError) {
        console.error(`Failed to delete video file ${savedPath}:`, deleteError);
      }
    }
  } catch (error) {
    console.error("Download failed", error);
    db.prepare(
      "INSERT OR REPLACE INTO downloads (message_id, file_path, status) VALUES (?, ?, ?)"
    ).run(message.message_id, filename, "failed");
    if (message.message_id !== undefined) {
      await sendTelegramMessage(
        chatId,
        "❌ **Failed to download the video link.**",
        message.message_id
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "❌ **Failed to download the video link.**"
      );
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
