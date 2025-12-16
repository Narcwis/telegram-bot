ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js, npm, ffmpeg, Python, yt-dlp, curl, jq, unzip, and ngrok (downloaded binary)
RUN apk add --no-cache \
    nodejs \
    npm \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    jq \
    unzip \
    yt-dlp \
    && NGROK_ARCH=$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/') \
    && curl -sSL -o /tmp/ngrok.zip "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-stable-linux-${NGROK_ARCH}.zip" \
    && unzip /tmp/ngrok.zip -d /usr/local/bin \
    && rm /tmp/ngrok.zip

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm install -D typescript @types/node ts-node && \
    npx tsc && \
    npm uninstall typescript @types/node ts-node

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
