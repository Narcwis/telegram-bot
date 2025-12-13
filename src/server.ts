import "dotenv/config";
import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import ytdlp from "youtube-dl-exec";
import { GoogleGenerativeAI } from "@google/generative-ai";
import routes from "./routes";

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
};

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const TARGET_CHAT_ID = Number(process.env.TARGET_CHAT_ID ?? "-1003322384328");
const TMP_DIR = path.join(process.cwd(), "tmp");
const DATA_DIR = path.join(process.cwd(), "data");
const MD_DIR = path.join(DATA_DIR, "md");
const DB_PATH = path.join(DATA_DIR, "bot.db");
const YTDLP_BIN = process.env.YTDLP_PATH; // optional override for yt-dlp binary
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_PROMPT =
  process.env.GEMINI_PROMPT || "Analyze this video and provide a summary.";

// Initialize Gemini client once at startup
const geminiClient = (() => {
  if (!GEMINI_API_KEY) {
    console.warn("Warning: GEMINI_API_KEY not set. Gemini analysis will fail.");
    return null;
  }
  return new GoogleGenerativeAI(GEMINI_API_KEY);
})();

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

const sendTelegramMessage = async (
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<void> => {
  await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
    }),
  });
};

const analyzeVideoWithGemini = async (
  videoPath: string,
  messageId: number
): Promise<string> => {
  if (!geminiClient) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Read video file and convert to base64
  const videoBuffer = await fs.promises.readFile(videoPath);
  const videoBase64 = videoBuffer.toString("base64");

  // Get model and send request
  const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent([
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

  return markdownResponse;
};

app.use(express.json());

app.use("/", routes);

app.post("/webhook", async (req: Request, res: Response) => {
  const { message } = req.body as TelegramUpdate;
  console.log("Webhook triggered:", message?.text);

  if (message?.chat?.id !== TARGET_CHAT_ID || !message?.message_id) {
    res.sendStatus(200);
    return;
  }

  const url = extractFirstUrl(message.text);
  if (!url) {
    await sendTelegramMessage(
      message.chat.id,
      "No video link detected in your message.",
      message.message_id
    );
    res.sendStatus(200);
    return;
  }

  const existing = db
    .prepare("SELECT status FROM downloads WHERE message_id = ?")
    .get(message.message_id) as { status?: string } | undefined;

  if (existing?.status === "done") {
    await sendTelegramMessage(
      message.chat.id,
      "Already downloaded this message.",
      message.message_id
    );
    res.sendStatus(200);
    return;
  }

  const urlObj = new URL(url);
  const ext = path.extname(urlObj.pathname) || ".bin";
  const filename = `${message.message_id}${ext}`;

  try {
    db.prepare(
      "INSERT OR REPLACE INTO downloads (message_id, file_path, status) VALUES (?, ?, ?)"
    ).run(message.message_id, filename, "downloading");

    const savedPath = await downloadToTmp(url, filename);

    db.prepare(
      "INSERT OR REPLACE INTO downloads (message_id, file_path, status) VALUES (?, ?, ?)"
    ).run(message.message_id, filename, "done");

    await sendTelegramMessage(
      message.chat.id,
      "done downloading the video",
      message.message_id
    );

    // Analyze video with Gemini
    try {
      const geminiResponse = await analyzeVideoWithGemini(
        savedPath,
        message.message_id
      );
      await sendTelegramMessage(
        message.chat.id,
        geminiResponse,
        message.message_id
      );
    } catch (geminiError) {
      console.error("Gemini analysis failed", geminiError);
      await sendTelegramMessage(
        message.chat.id,
        "Failed to analyze video with Gemini.",
        message.message_id
      );
    }
  } catch (error) {
    console.error("Download failed", error);
    db.prepare(
      "INSERT OR REPLACE INTO downloads (message_id, file_path, status) VALUES (?, ?, ?)"
    ).run(message.message_id, filename, "failed");
    await sendTelegramMessage(
      message.chat.id,
      "Failed to download the video link.",
      message.message_id
    );
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
