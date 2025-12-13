# Telegram Video AI Bot - Home Assistant Addon

Transform your Home Assistant into an intelligent Telegram video analysis bot powered by Google Gemini AI!

## Features

- 📹 Downloads videos from shared links (Instagram, YouTube, TikTok, etc.)
- 🤖 Analyzes videos with Google Gemini AI
- 💬 Responds directly in Telegram with formatted Markdown
- 🔄 Automatic API key rotation when quota limits are reached
- 🗄️ Tracks downloads and API usage in SQLite database
- 🔐 Secure configuration through Home Assistant UI

## Installation

### Add Repository

1. Navigate to **Supervisor** → **Add-on Store** in Home Assistant
2. Click the **⋮** menu (top right) → **Repositories**
3. Add this repository URL: `https://github.com/Narcwis/telegram-bot`
4. Click **Add**

### Install Addon

1. Find **Telegram Video AI Bot** in the add-on store
2. Click **Install**
3. Wait for installation to complete

## Configuration

### Required Settings

Navigate to the addon **Configuration** tab and fill in:

#### Telegram Bot Token

```yaml
telegram_bot_token: "YOUR_BOT_TOKEN_HERE"
```

Get your token from [@BotFather](https://t.me/BotFather) on Telegram.

#### Target Chat ID

```yaml
target_chat_id: "-1003322384328"
```

The Telegram chat/group ID where the bot should listen. Use [@userinfobot](https://t.me/userinfobot) to find your chat ID.

#### Gemini API Keys

```yaml
gemini_api_keys: "key1,key2,key3"
```

Comma-separated list of Google Gemini API keys. Get keys from [Google AI Studio](https://aistudio.google.com/app/apikey).

**Multiple keys recommended** - The bot automatically rotates through keys when quota limits are reached.

#### Gemini Prompt (Optional)

```yaml
gemini_prompt: "Analyze this video and provide a detailed recipe with ingredients and steps in Markdown format."
```

Customize the AI analysis prompt. Default: "Analyze this video and provide a summary."

#### ngrok URL (Optional)

```yaml
ngrok_url: "https://your-static-domain.ngrok-free.app"
```

If your Home Assistant instance is not publicly accessible, you can use ngrok to create a secure tunnel:

- Set up ngrok on your machine with your static domain (free tier provides a static URL)
- Run `ngrok http 3000` to create the tunnel to your addon
- Copy your ngrok URL (e.g., `https://unwrecked-alivia-extemporarily.ngrok-free.app`)
- Paste it in the `ngrok_url` field
- The addon will automatically set the Telegram webhook to this URL
- If not provided, you'll need to manually configure your Telegram webhook to point to your public Home Assistant URL

#### yt-dlp Path (Optional)

```yaml
ytdlp_path: ""
```

Leave empty to use the built-in yt-dlp installation.

### Example Configuration

```yaml
telegram_bot_token: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
target_chat_id: "-1003322384328"
gemini_api_keys: "AIzaSyAbc123...,AIzaSyDef456...,AIzaSyGhi789..."
gemini_prompt: "Analyze this cooking video and extract the recipe in Markdown format."
ytdlp_path: ""
```

## Usage

1. **Start the addon** from the Info tab
2. **Send a video link** to your configured Telegram chat
3. The bot will:
   - ⏳ Download the video
   - 🤖 Analyze it with Gemini AI
   - 💬 Reply with the formatted analysis

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
- Check `target_chat_id` matches your chat
- Ensure bot is added to the group (if using a group chat)

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

## License

MIT License - See repository for details
