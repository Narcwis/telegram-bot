ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js, npm, ffmpeg, Python, yt-dlp, curl, jq, and ngrok from apk (avoids pip PEP668)
RUN apk add --no-cache \
    nodejs \
    npm \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    jq \
    yt-dlp \
    && curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apk/keys/ngrok.asc >/dev/null \
    && echo "https://ngrok-agent.s3.amazonaws.com" >> /etc/apk/repositories \
    && apk add --no-cache ngrok

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
