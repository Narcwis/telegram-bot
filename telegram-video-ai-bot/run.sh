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

# Start ngrok if authtoken is provided
if [ -n "$NGROK_AUTHTOKEN" ]; then
  bashio::log.info "Configuring ngrok tunnel..."
  ngrok config add-authtoken "$NGROK_AUTHTOKEN"

  # Derive hostname from NGROK_URL if provided (strip protocol/path)
  NGROK_HOSTNAME=""
  if [ -n "$NGROK_URL" ]; then
    NGROK_HOSTNAME=$(echo "$NGROK_URL" | sed -E 's~https?://~~' | cut -d/ -f1)
  fi

  if [ -n "$NGROK_HOSTNAME" ]; then
    bashio::log.info "Starting ngrok with hostname: $NGROK_HOSTNAME"
    ngrok http --hostname="$NGROK_HOSTNAME" 3000 --log=stdout > /data/ngrok.log 2>&1 &
  else
    bashio::log.info "Starting ngrok with random domain"
    ngrok http 3000 --log=stdout > /data/ngrok.log 2>&1 &
  fi

  bashio::log.info "ngrok tunnel started"
fi

# Use configured NGROK_URL for webhook
WEBHOOK_BASE="$NGROK_URL"

if [ -n "$WEBHOOK_BASE" ]; then
  bashio::log.info "Setting Telegram webhook to: ${WEBHOOK_BASE}/webhook"
  WEBHOOK_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_BASE}/webhook")
  if echo "$WEBHOOK_RESPONSE" | jq -e '.ok' > /dev/null; then
    bashio::log.info "Telegram webhook set successfully"
  else
    bashio::log.warning "Failed to set Telegram webhook: $WEBHOOK_RESPONSE"
  fi
else
  bashio::log.info "No ngrok URL available - skipping webhook setup"
fi

# Start the application
cd /app
exec node dist/server.js
