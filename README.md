# Telegram Video AI Bot - Home Assistant Add-on Repository

Home Assistant add-on repository for the Telegram Video AI Bot.

## Installation

1. Add this repository to your Home Assistant:

   - Go to **Settings** → **Add-ons** → **Add-on Store**
   - Click the three dots menu (⋮) in the top right
   - Select **Repositories**
   - Add: `https://github.com/Narcwis/telegram-bot`
   - Click **Add** then **Close**

2. Find "Telegram Video AI Bot" in the add-on store and click **Install**

3. Configure the add-on and start it

## Add-ons in this repository

### Telegram Video AI Bot

Transform your Home Assistant into an intelligent Telegram video analysis bot powered by Google Gemini AI!

**Features:**

- 📹 Downloads videos from shared links (Instagram, YouTube, TikTok, etc.)
- 🤖 Analyzes videos with Google Gemini AI
- 💬 Responds directly in Telegram with properly formatted MarkdownV2
- 🔄 Automatic API key rotation when quota limits are reached
- 🗄️ Tracks downloads and API usage in SQLite database
- 🔐 Secure configuration through Home Assistant UI
- 🌐 Built-in ngrok tunnel support for easy webhook setup

[View full documentation](telegram-video-ai-bot/DOCS.md)

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/Narcwis/telegram-bot/issues).

## License

MIT License
