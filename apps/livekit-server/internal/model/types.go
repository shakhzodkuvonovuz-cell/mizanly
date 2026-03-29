// Package model defines shared types for the LiveKit call server.
package model

import "time"

// CallSession represents a call session in the database.
type CallSession struct {
	ID                string            `json:"id"`
	CallType          string            `json:"callType"`
	Status            string            `json:"status"`
	StartedAt         *time.Time        `json:"startedAt"`
	EndedAt           *time.Time        `json:"endedAt"`
	Duration          *int              `json:"duration"`
	MaxParticipants   int               `json:"maxParticipants"`
	IsScreenSharing   bool              `json:"isScreenSharing"`
	ScreenShareUserID *string           `json:"screenShareUserId"`
	LivekitRoomName   *string           `json:"livekitRoomName"`
	LivekitRoomSid    *string           `json:"livekitRoomSid"`
	RecordingURL      *string           `json:"recordingUrl"`
	BroadcastType     *string           `json:"broadcastType"`
	IngressID         *string           `json:"ingressId"`
	CreatedAt         time.Time         `json:"createdAt"`
	UpdatedAt         time.Time         `json:"updatedAt"`
	Participants      []CallParticipant `json:"participants"`
}

// E2EEMaterial holds the per-session encryption key and salt.
// [F1 fix] Salt is unique per session — prevents cross-session key derivation overlap.
type E2EEMaterial struct {
	Key  []byte
	Salt []byte
}

// CallParticipant represents a participant in a call session.
type CallParticipant struct {
	SessionID       string     `json:"sessionId"`
	UserID          string     `json:"userId"`
	Role            string     `json:"role"`
	JoinedAt        time.Time  `json:"joinedAt"`
	LeftAt          *time.Time `json:"leftAt"`
	LivekitJoinedAt *time.Time `json:"livekitJoinedAt"` // Set when participant actually connects to LiveKit room
	User            *UserBrief `json:"user,omitempty"`
}

// UserBrief is a minimal user projection for call responses.
type UserBrief struct {
	ID          string  `json:"id"`
	Username    *string `json:"username"`
	DisplayName *string `json:"displayName"`
	AvatarURL   *string `json:"avatarUrl"`
}

// CreateRoomRequest is the request body for room creation.
type CreateRoomRequest struct {
	TargetUserID   string   `json:"targetUserId"`
	ParticipantIDs []string `json:"participantIds"`
	CallType       string   `json:"callType"`
	ConversationID string   `json:"conversationId"`
}

// TokenRequest is the request body for token generation.
type TokenRequest struct {
	RoomName  string `json:"roomName"`
	SessionID string `json:"sessionId"`
}

// EgressRequest is the request body for starting/stopping recording.
type EgressRequest struct {
	SessionID string `json:"sessionId"`
	RoomName  string `json:"roomName"`
}

// IngressRequest is the request body for creating a broadcast ingress.
type IngressRequest struct {
	SessionID     string `json:"sessionId"`
	RoomName      string `json:"roomName"`
	InputType     string `json:"inputType"` // "rtmp" or "whip"
	BroadcasterID string `json:"broadcasterId"`
}

// PaginatedResult wraps a paginated response.
type PaginatedResult struct {
	Data []CallSession  `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

// PaginationMeta contains cursor-based pagination info.
type PaginationMeta struct {
	Cursor  *string `json:"cursor"`
	HasMore bool    `json:"hasMore"`
}
