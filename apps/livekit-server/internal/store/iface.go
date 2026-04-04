package store

import (
	"context"

	"github.com/mizanly/livekit-server/internal/model"
)

// Querier defines all database operations. Handler depends on this interface,
// enabling mock implementations for testing.
type Querier interface {
	Health(ctx context.Context) error
	Close()

	// Checks
	CheckBlocked(ctx context.Context, userA, userB string) (bool, error)
	CheckBlockedAny(ctx context.Context, userIDs []string) (bool, error)
	UserExists(ctx context.Context, userID string) (bool, error)

	// Session CRUD — CreateCallSession is atomic: checks active call + inserts in one transaction (C2 fix)
	CreateCallSession(ctx context.Context, callType model.CallType, livekitRoomName, callerID string, participantIDs []string, maxParticipants int) (*model.CallSession, error)
	UpdateSessionStatus(ctx context.Context, sessionID, status string) error
	UpdateSessionDuration(ctx context.Context, sessionID string, duration int) error
	UpdateSessionLivekitSid(ctx context.Context, roomName, roomSid string) error
	UpdateSessionRecordingURL(ctx context.Context, roomName, recordingURL string) error
	WipeE2EEKey(ctx context.Context, sessionID string) error
	EndCallSession(ctx context.Context, sessionID, newStatus string) error // [B12-#8] atomic cleanup

	// Participants
	MarkParticipantLeft(ctx context.Context, sessionID, userID string) error
	MarkAllParticipantsLeft(ctx context.Context, sessionID string) error
	MarkParticipantLivekitJoined(ctx context.Context, roomName, userID string) error
	GetActiveParticipantCount(ctx context.Context, roomName string) (int, error)

	// Lookups
	GetSessionByRoomName(ctx context.Context, roomName string) (*model.CallSession, error)
	GetSessionWithParticipantsByRoomName(ctx context.Context, roomName string) (*model.CallSession, error)
	GetSessionByID(ctx context.Context, sessionID string) (*model.CallSession, error)
	GetActiveCall(ctx context.Context, userID string) (*model.CallSession, error)
	GetHistory(ctx context.Context, userID string, cursor *string, limit int) (*model.PaginatedResult, error)
	GetSessionE2EEMaterial(ctx context.Context, roomName string) (*model.E2EEMaterial, error)

	// User lookup
	GetUserDisplayName(ctx context.Context, userID string) (string, error)

	// Cleanup
	CleanupStaleRingingSessions(ctx context.Context, staleAfterSecs int) (int64, error)
}
