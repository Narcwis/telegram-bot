# Telegram Video AI Bot - Home Assistant Addon

Transform your Home Assistant into an intelligent Telegram video analysis bot powered by Google Gemini AI!

## Features

- 📹 Downloads videos from shared links (Instagram, YouTube, TikTok, etc.)
- 🤖 Analyzes videos with Google Gemini AI
- 💬 Responds directly in Telegram with properly formatted MarkdownV2
- 🔄 Automatic API key rotation when quota limits are reached
- 🗄️ Tracks downloads and API usage in SQLite database
- 🔐 Secure configuration through Home Assistant UI
- 🌐 Built-in ngrok tunnel support for easy webhook setup

## Configuration

### Required Settings

Navigate to the addon **Configuration** tab and fill in:

#### Telegram Bot Token

```yaml
telegram_bot_token: "YOUR_BOT_TOKEN_HERE"
```

Get your token from [@BotFather](https://t.me/BotFather) on Telegram.

#### Gemini API Keys

```yaml
gemini_api_keys: "key1,key2,key3"
```

Comma-separated list of Google Gemini API keys. Get keys from [Google AI Studio](https://aistudio.google.com/app/apikey).

**Multiple keys recommended** - The bot automatically rotates through keys when quota limits are reached.

### Optional Settings

#### Gemini Prompt

```yaml
gemini_prompt: "Analyze this video and provide a detailed recipe with ingredients and steps in Markdown format."
```

Customize the AI analysis prompt. Default: "Analyze this video and provide a summary."

#### ngrok Configuration (Optional)

If your Home Assistant instance is not publicly accessible, the addon can automatically start an ngrok tunnel:

**ngrok Auth Token:**

```yaml
ngrok_authtoken: "your_ngrok_authtoken_here"
```

Get your authtoken from [ngrok Dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).

**ngrok URL (Optional - for static domains):**

```yaml
ngrok_url: "https://your-static-domain.ngrok-free.app"
```

- If you have a static ngrok domain (paid plan), provide it here
- If not provided, ngrok will generate a random domain
- The addon automatically configures the Telegram webhook
- The tunnel runs alongside the addon (no external setup needed)

### Example Configuration

**With ngrok (for non-public Home Assistant):**

```yaml
telegram_bot_token: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
gemini_api_keys: "AIzaSyAbc123...,AIzaSyDef456...,AIzaSyGhi789..."
gemini_prompt: "Analyze this cooking video and extract the recipe in Markdown format."
ngrok_authtoken: "2abc123def456_xyz789..."
ngrok_url: "https://your-static-domain.ngrok-free.app" # Optional, only if you have a static domain
```

**Without ngrok (for publicly accessible Home Assistant):**

```yaml
telegram_bot_token: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
gemini_api_keys: "AIzaSyAbc123...,AIzaSyDef456...,AIzaSyGhi789..."
gemini_prompt: "Analyze this cooking video and extract the recipe in Markdown format."
```

_Note: When not using ngrok, you'll need to manually configure your Telegram webhook to point to your public Home Assistant URL._

## Usage

1. **Start the addon** from the Info tab
2. **Send a video link** to your bot on Telegram
3. The bot will:
   - ⏳ Download the video
   - 🤖 Analyze it with Gemini AI
   - 💬 Reply with the analysis formatted in Telegram MarkdownV2

### Message Formatting

The bot automatically converts responses to Telegram's MarkdownV2 format, supporting:

- **Bold text** and _italic text_
- Bullet points and numbered lists
- Links and inline code
- Proper escaping of special characters
- Emoji preservation

### Supported Platforms

Thanks to yt-dlp, the bot supports hundreds of video platforms including:

- Instagram (reels & posts)
- YouTube
- TikTok
- Facebook
- Twitter/X
- Reddit
- And many more!

## Security Notes

✅ **All sensitive data (tokens, API keys) are stored securely in Home Assistant**
✅ **No credentials are exposed in code or logs**
✅ **Data stored in `/data` directory (persists across restarts)**

## Troubleshooting

### Check Logs

View real-time logs in **Supervisor** → **Telegram Video AI Bot** → **Log** tab

### Common Issues

**Bot not responding:**

- Verify `telegram_bot_token` is correct
- Ensure bot is added to the group/chat
- Check logs for errors

**Gemini quota errors:**

- Add more API keys (comma-separated)
- Check usage at [Google AI Studio](https://aistudio.google.com/)

**Video download fails:**

- Some platforms may require cookies or authentication
- Check if the platform is supported by yt-dlp

## Support

For issues, feature requests, or contributions:

- GitHub: https://github.com/Narcwis/telegram-bot
- Issues: https://github.com/Narcwis/telegram-bot/issues
