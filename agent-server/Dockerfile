FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy application code
COPY . .

# Expose port
EXPOSE 3001

# Set default environment variables
ENV PORT=3001
ENV STRATEGY=ev-maximizer

# Run the application
CMD ["bun", "run", "index.ts"]
