package handler

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/mizanly/livekit-server/internal/model"
	"github.com/mizanly/livekit-server/internal/store"
)

// Compile-time check.
var _ store.Querier = (*mockStore)(nil)

// mockStore is an in-memory implementation of store.Querier for handler tests.
type mockStore struct {
	mu           sync.Mutex
	sessions     map[string]*model.CallSession // keyed by roomName
	sessionsByID map[string]*model.CallSession // keyed by ID
	users        map[string]bool               // user existence
	blocks       map[string]bool               // "userA:userB" block pairs
	activeCalls  map[string]string             // userID → sessionID
	e2eeKeys     map[string][]byte             // roomName → key
	healthy      bool
}

func newMockStore() *mockStore {
	return &mockStore{
		sessions:     make(map[string]*model.CallSession),
		sessionsByID: make(map[string]*model.CallSession),
		users:        make(map[string]bool),
		blocks:       make(map[string]bool),
		activeCalls:  make(map[string]string),
		e2eeKeys:     make(map[string][]byte),
		healthy:      true,
	}
}

func (m *mockStore) Health(_ context.Context) error {
	if !m.healthy {
		return fmt.Errorf("unhealthy")
	}
	return nil
}
func (m *mockStore) Close() {}

func (m *mockStore) CheckBlocked(_ context.Context, userA, userB string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.blocks[userA+":"+userB] || m.blocks[userB+":"+userA], nil
}

func (m *mockStore) CheckBlockedAny(_ context.Context, userIDs []string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := 0; i < len(userIDs); i++ {
		for j := i + 1; j < len(userIDs); j++ {
			if m.blocks[userIDs[i]+":"+userIDs[j]] || m.blocks[userIDs[j]+":"+userIDs[i]] {
				return true, nil
			}
		}
	}
	return false, nil
}

func (m *mockStore) UserExists(_ context.Context, userID string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.users[userID], nil
}

func (m *mockStore) CreateCallSession(_ context.Context, callType model.CallType, livekitRoomName, callerID string, participantIDs []string, maxParticipants int) (*model.CallSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check active calls (atomic) — return structured error like real store
	for _, pid := range participantIDs {
		if _, inCall := m.activeCalls[pid]; inCall {
			return nil, &store.ErrUserInCall{UserID: pid}
		}
	}

	now := time.Now()
	roomNamePtr := livekitRoomName
	session := &model.CallSession{
		ID:              fmt.Sprintf("session_%d", len(m.sessions)+1),
		CallType:        callType,
		Status:          "RINGING",
		MaxParticipants: maxParticipants,
		LivekitRoomName: &roomNamePtr,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	for _, pid := range participantIDs {
		role := "callee"
		if pid == callerID {
			role = "caller"
		}
		session.Participants = append(session.Participants, model.CallParticipant{
			SessionID: session.ID, UserID: pid, Role: role, JoinedAt: now,
		})
		m.activeCalls[pid] = session.ID
	}

	m.sessions[livekitRoomName] = session
	m.sessionsByID[session.ID] = session
	m.e2eeKeys[livekitRoomName] = []byte("mock-e2ee-key-32-bytes-long!!!!!")
	return session, nil
}

func (m *mockStore) UpdateSessionStatus(_ context.Context, sessionID, status string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessionsByID[sessionID]; ok {
		s.Status = status
	}
	return nil
}

// [B12-#8 fix] Atomic end-call cleanup in mock store
func (m *mockStore) EndCallSession(_ context.Context, sessionID, newStatus string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessionsByID[sessionID]; ok {
		s.Status = newStatus
		// Wipe E2EE key
		if s.LivekitRoomName != nil {
			delete(m.e2eeKeys, *s.LivekitRoomName)
		}
		// Mark all participants left
		now := time.Now()
		for i := range s.Participants {
			if s.Participants[i].LeftAt == nil {
				s.Participants[i].LeftAt = &now
			}
		}
	}
	for uid, sid := range m.activeCalls {
		if sid == sessionID {
			delete(m.activeCalls, uid)
		}
	}
	return nil
}

func (m *mockStore) UpdateSessionDuration(_ context.Context, sessionID string, duration int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessionsByID[sessionID]; ok {
		s.Duration = &duration
		s.Status = "ENDED"
	}
	return nil
}

func (m *mockStore) UpdateSessionLivekitSid(_ context.Context, roomName, roomSid string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[roomName]; ok {
		s.LivekitRoomSid = &roomSid
	}
	return nil
}

func (m *mockStore) WipeE2EEKey(_ context.Context, sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessionsByID[sessionID]; ok {
		delete(m.e2eeKeys, *s.LivekitRoomName)
	}
	return nil
}

func (m *mockStore) UpdateSessionRecordingURL(_ context.Context, roomName, recordingURL string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[roomName]; ok {
		s.RecordingURL = &recordingURL
	}
	return nil
}

func (m *mockStore) MarkParticipantLeft(_ context.Context, sessionID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.activeCalls, userID)
	// [F7 fix] Set LeftAt so GetSessionWithParticipantsByRoomName filters correctly
	if s, ok := m.sessionsByID[sessionID]; ok {
		now := time.Now()
		for i := range s.Participants {
			if s.Participants[i].UserID == userID && s.Participants[i].LeftAt == nil {
				s.Participants[i].LeftAt = &now
				break
			}
		}
	}
	return nil
}

func (m *mockStore) MarkParticipantLivekitJoined(_ context.Context, roomName, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[roomName]; ok {
		now := time.Now()
		for i := range s.Participants {
			if s.Participants[i].UserID == userID {
				s.Participants[i].LivekitJoinedAt = &now
				break
			}
		}
	}
	return nil
}

func (m *mockStore) MarkAllParticipantsLeft(_ context.Context, sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for uid, sid := range m.activeCalls {
		if sid == sessionID {
			delete(m.activeCalls, uid)
		}
	}
	return nil
}

func (m *mockStore) GetActiveParticipantCount(_ context.Context, roomName string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[roomName]; ok {
		count := 0
		for _, p := range s.Participants {
			// Only count participants who have ACTUALLY joined the LiveKit room
			if p.LeftAt == nil && p.LivekitJoinedAt != nil {
				count++
			}
		}
		return count, nil
	}
	return 0, nil
}

func (m *mockStore) GetSessionByRoomName(_ context.Context, roomName string) (*model.CallSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[roomName]
	if !ok {
		return nil, nil
	}
	return s, nil
}

func (m *mockStore) GetSessionWithParticipantsByRoomName(_ context.Context, roomName string) (*model.CallSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[roomName]
	if !ok {
		return nil, nil
	}
	// Filter to active participants only
	filtered := &model.CallSession{
		ID: s.ID, CallType: s.CallType, Status: s.Status,
		LivekitRoomName: s.LivekitRoomName, CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt,
	}
	for _, p := range s.Participants {
		if p.LeftAt == nil {
			filtered.Participants = append(filtered.Participants, p)
		}
	}
	return filtered, nil
}

func (m *mockStore) GetSessionByID(_ context.Context, sessionID string) (*model.CallSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessionsByID[sessionID], nil
}

func (m *mockStore) GetActiveCall(_ context.Context, userID string) (*model.CallSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if sid, ok := m.activeCalls[userID]; ok {
		return m.sessionsByID[sid], nil
	}
	return nil, nil
}

func (m *mockStore) GetHistory(_ context.Context, _ string, _ *string, _ int) (*model.PaginatedResult, error) {
	return &model.PaginatedResult{Data: []model.CallSession{}, Meta: model.PaginationMeta{}}, nil
}

func (m *mockStore) GetSessionE2EEMaterial(_ context.Context, roomName string) (*model.E2EEMaterial, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// [Audit #11] Mirror real store behavior: only return material for RINGING/ACTIVE sessions
	if s, ok := m.sessions[roomName]; ok {
		if s.Status != "RINGING" && s.Status != "ACTIVE" {
			return nil, nil
		}
	}
	key := m.e2eeKeys[roomName]
	if len(key) == 0 {
		return nil, nil
	}
	// [F1 fix] Mock salt uses deterministic value derived from room name for test reproducibility
	salt := []byte("mock-salt-16byte")
	return &model.E2EEMaterial{Key: key, Salt: salt}, nil
}

func (m *mockStore) GetUserDisplayName(_ context.Context, userID string) (string, error) {
	if m.users[userID] {
		return "User " + userID, nil
	}
	return "", fmt.Errorf("user not found")
}

func (m *mockStore) CleanupStaleRingingSessions(_ context.Context, _ int) (int64, error) {
	return 0, nil
}

// Test helpers

func (m *mockStore) addUser(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.users[id] = true
}

func (m *mockStore) addBlock(blockerID, blockedID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.blocks[blockerID+":"+blockedID] = true
}
