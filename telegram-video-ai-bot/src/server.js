require("dotenv").config(); // Load environment variables from .env file
const express = require("express");
const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Log the API URL for debugging
console.log(`Using Telegram API URL: ${TELEGRAM_API_URL}`);

// Middleware
app.use(express.json());

// Routes
app.use("/", routes);

// Telegram webhook route
app.post("/webhook", async (req, res) => {
  console.log("Webhook triggered:", req?.body?.message?.text); // Log incoming requests for debugging

  const { message } = req.body;
  if (message && message.chat && message.chat.id === -1003322384328) {
    const chatId = message.chat.id;
    const responseText = `You said: ${message.text}`;

    // Send a response back to the user
    await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: responseText }),
    });
  }

  res.sendStatus(200);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
