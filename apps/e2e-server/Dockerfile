FROM golang:1.25-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# [G06-#19 fix] Strip debug info and symbol table to reduce binary size
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /e2e-server ./cmd/server

FROM alpine:3.21@sha256:c3f8e73fdb79deaebaa2037150150191b9dcbfba68b4a46d70103204c53f4709
RUN apk add --no-cache ca-certificates
COPY --from=builder /e2e-server /e2e-server
# [G06-#3 fix] Run as non-root user
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["/e2e-server"]
