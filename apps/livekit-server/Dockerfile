# [G06-#2 fix] Use actual Go version from go.mod (1.25), not nonexistent 1.26
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# [G06-#19 fix] Strip debug info and symbol table to reduce binary size
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server/

FROM alpine:3.21
RUN apk --no-cache add ca-certificates
COPY --from=builder /server /server
# [G06-#3 fix] Run as non-root user
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8081/health || exit 1
CMD ["/server"]
