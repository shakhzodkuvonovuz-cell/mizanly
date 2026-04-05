# Lane 29: Chat Gateway Room/Auth

## High

- Any authenticated socket can create, join, and then tear down arbitrary Quran rooms because `join_quran_room` never verifies the room exists in the database or that the caller is allowed to participate. The first joiner becomes `hostId` in Redis automatically, and when the last participant leaves or disconnects the gateway blindly runs `prisma.audioRoom.update({ where: { id: roomId }, data: { status: 'ended', endedAt: ... } })`. If an attacker guesses or learns a valid `audioRoom.id`, they can force that real room into `ended` state without any host/member authorization. References: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:802`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:878`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:363`, `C:\dev\mizanly\apps\api\src\gateways\dto\quran-room-events.dto.ts:6`.

- `message_delivered` is only authorized at the conversation-membership level, then updates any `messageId` in that conversation and emits a receipt naming the caller as the recipient. In group conversations, any member can forge delivery for messages they never received, and the single `deliveredAt` field lets one participant mark delivery globally for the whole message. References: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:750`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:769`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:785`, `C:\dev\mizanly\apps\api\src\gateways\dto\chat-events.dto.ts:16`.

- The gateway forwards `sealed_message` to the recipient room before durable persistence. If `messagesService.sendMessage(...)` fails, the recipient can still decrypt and render the payload while the sender receives `Failed to persist sealed message` and will likely retry, creating non-durable delivery and duplicate/conflicting history. References: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:653`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:670`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:692`.

## Medium

- WebSocket connection throttling trusts `x-forwarded-for` directly from the handshake headers. Without a trusted-proxy boundary in front of Socket.IO, unauthenticated clients can rotate arbitrary header values and evade the per-IP connection flood limit. References: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:248`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:252`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:931`.

- The Quran room participant cap is enforced with a non-atomic `SCARD` check followed by `SADD`. Concurrent joins can observe the same pre-cap count and all succeed, so the configured `MAX_QURAN_ROOM_PARTICIPANTS` is bypassable under burst joins. References: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:824`, `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:831`.

## Residual Risk

- I did not inspect the downstream `audioRoom` service/controller layer, only what the gateway itself authorizes and mutates.
- The findings above are static-code issues in the gateway path and do not depend on external infrastructure behavior.
