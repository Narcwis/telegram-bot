#!/usr/bin/with-contenv bashio

# Read config from Home Assistant (only sensitive data)
export TELEGRAM_BOT_TOKEN=$(bashio::config 'telegram_bot_token')
export GEMINI_API_KEY=$(bashio::config 'gemini_api_keys')
export GEMINI_PROMPT=$(bashio::config 'gemini_prompt')
NGROK_URL=$(bashio::config 'ngrok_url')
NGROK_AUTHTOKEN=$(bashio::config 'ngrok_authtoken')

# Log configuration (without sensitive data)
bashio::log.info "Starting Telegram Video AI Bot..."
bashio::log.info "Port: 3000"

# Create data directories
mkdir -p /data/tmp
mkdir -p /data/data
mkdir -p /data/data/md

# Set Telegram webhook if ngrok URL is provided
if [ -n "$NGROK_URL" ]; then
  bashio::log.info "Setting Telegram webhook to: ${NGROK_URL}/webhook"
  
  # Set Telegram webhook
  WEBHOOK_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${NGROK_URL}/webhook")
  
  if echo "$WEBHOOK_RESPONSE" | jq -e '.ok' > /dev/null; then
    bashio::log.info "Telegram webhook set successfully"
  else
    bashio::log.warning "Failed to set Telegram webhook: $WEBHOOK_RESPONSE"
  fi
else
  bashio::log.info "ngrok URL not configured - skipping webhook setup"
fi

# Start the application
cd /app
exec node dist/server.js
