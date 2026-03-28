package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mizanly/e2e-server/internal/model"
)

// ============================================================
// validatePathParam
// ============================================================

func TestValidatePathParam_Empty(t *testing.T) {
	err := validatePathParam("")
	if err == nil {
		t.Fatal("expected error for empty param")
	}
}

func TestValidatePathParam_TooLong(t *testing.T) {
	long := strings.Repeat("a", 65)
	err := validatePathParam(long)
	if err == nil {
		t.Fatal("expected error for param > 64 chars")
	}
}

func TestValidatePathParam_MaxLength(t *testing.T) {
	maxLen := strings.Repeat("a", 64)
	err := validatePathParam(maxLen)
	if err != nil {
		t.Fatalf("unexpected error for 64-char param: %v", err)
	}
}

func TestValidatePathParam_ControlChars(t *testing.T) {
	cases := []string{
		"user\x00id",   // NULL byte
		"user\nid",     // newline (log injection)
		"user\x1bid",   // ESC
		"user\x7fid",   // DEL
	}
	for _, tc := range cases {
		err := validatePathParam(tc)
		if err == nil {
			t.Errorf("expected error for param with control char %q", tc)
		}
	}
}

func TestValidatePathParam_Valid(t *testing.T) {
	cases := []string{
		"user_abc123",
		"cuid_clxyz",
		"usr-with-dashes",
		"simple",
	}
	for _, tc := range cases {
		err := validatePathParam(tc)
		if err != nil {
			t.Errorf("unexpected error for valid param %q: %v", tc, err)
		}
	}
}

// ============================================================
// extractPathParam
// ============================================================

func TestExtractPathParam_CorrectPrefix(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/bundle/user123", nil)
	result := extractPathParam(r, "/api/v1/e2e/keys/bundle/")
	if result != "user123" {
		t.Errorf("expected 'user123', got %q", result)
	}
}

func TestExtractPathParam_TrailingSlash(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/bundle/user123/", nil)
	result := extractPathParam(r, "/api/v1/e2e/keys/bundle/")
	if result != "user123" {
		t.Errorf("expected 'user123', got %q", result)
	}
}

func TestExtractPathParam_MissingPrefix(t *testing.T) {
	r := httptest.NewRequest("GET", "/other/path/user123", nil)
	result := extractPathParam(r, "/api/v1/e2e/keys/bundle/")
	if result != "" {
		t.Errorf("expected empty string, got %q", result)
	}
}

func TestExtractPathParam_Empty(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/bundle/", nil)
	result := extractPathParam(r, "/api/v1/e2e/keys/bundle/")
	if result != "" {
		t.Errorf("expected empty string for prefix-only path, got %q", result)
	}
}

// ============================================================
// ExtractBundleTargetID (exported wrapper)
// ============================================================

func TestExtractBundleTargetID(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/bundle/target_user", nil)
	result := ExtractBundleTargetID(r)
	if result != "target_user" {
		t.Errorf("expected 'target_user', got %q", result)
	}
}

// ============================================================
// readJSON
// ============================================================

func TestReadJSON_ValidJSON(t *testing.T) {
	body := `{"keyId": 42, "publicKey": "AAAA"}`
	r := httptest.NewRequest("POST", "/", bytes.NewBufferString(body))
	var result struct {
		KeyID     int    `json:"keyId"`
		PublicKey string `json:"publicKey"`
	}
	err := readJSON(r, &result)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.KeyID != 42 || result.PublicKey != "AAAA" {
		t.Errorf("wrong values: %+v", result)
	}
}

func TestReadJSON_InvalidJSON(t *testing.T) {
	r := httptest.NewRequest("POST", "/", bytes.NewBufferString("{invalid"))
	var result map[string]interface{}
	err := readJSON(r, &result)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestReadJSON_OversizedBody(t *testing.T) {
	// 1MB + 1 byte — readJSON uses io.LimitReader at 1<<20
	oversized := strings.Repeat("x", (1<<20)+1)
	r := httptest.NewRequest("POST", "/", strings.NewReader(oversized))
	var result map[string]interface{}
	err := readJSON(r, &result)
	// Should either error or truncate — the point is it doesn't OOM
	if err == nil {
		t.Fatal("expected error for oversized body")
	}
}

func TestReadJSON_EmptyBody(t *testing.T) {
	r := httptest.NewRequest("POST", "/", bytes.NewBufferString(""))
	var result map[string]interface{}
	err := readJSON(r, &result)
	if err == nil {
		t.Fatal("expected error for empty body")
	}
}

// ============================================================
// writeJSON
// ============================================================

func TestWriteJSON_ContentType(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json, got %q", ct)
	}
}

func TestWriteJSON_StatusCode(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusCreated, map[string]bool{"created": true})
	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", w.Code)
	}
}

func TestWriteJSON_Body(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusOK, map[string]int{"count": 42})
	var result map[string]int
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["count"] != 42 {
		t.Errorf("expected count=42, got %d", result["count"])
	}
}

// ============================================================
// writeError
// ============================================================

func TestWriteError_Format(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, http.StatusBadRequest, "invalid input")
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	var errResp model.ErrorResponse
	body, _ := io.ReadAll(w.Body)
	if err := json.Unmarshal(body, &errResp); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if errResp.Error != "Bad Request" {
		t.Errorf("expected 'Bad Request', got %q", errResp.Error)
	}
	if errResp.Message != "invalid input" {
		t.Errorf("expected 'invalid input', got %q", errResp.Message)
	}
}

// ============================================================
// concat
// ============================================================

func TestConcat_MultipleSlices(t *testing.T) {
	result := concat([]byte{1, 2}, []byte{3, 4}, []byte{5})
	expected := []byte{1, 2, 3, 4, 5}
	if !bytes.Equal(result, expected) {
		t.Errorf("expected %v, got %v", expected, result)
	}
}

func TestConcat_EmptySlices(t *testing.T) {
	result := concat([]byte{}, []byte{1}, []byte{})
	expected := []byte{1}
	if !bytes.Equal(result, expected) {
		t.Errorf("expected %v, got %v", expected, result)
	}
}

func TestConcat_SingleSlice(t *testing.T) {
	input := []byte{1, 2, 3}
	result := concat(input)
	if !bytes.Equal(result, input) {
		t.Errorf("expected %v, got %v", input, result)
	}
}

func TestConcat_NoSlices(t *testing.T) {
	result := concat()
	if len(result) != 0 {
		t.Errorf("expected empty slice, got %v", result)
	}
}

// ============================================================
// hashUserID
// ============================================================

func TestHashUserID_Deterministic(t *testing.T) {
	h1 := hashUserID("user_123abc")
	h2 := hashUserID("user_123abc")
	if h1 != h2 {
		t.Errorf("hash is not deterministic: %q vs %q", h1, h2)
	}
}

func TestHashUserID_Length(t *testing.T) {
	h := hashUserID("user_123abc")
	if len(h) != 16 {
		t.Errorf("expected 16-char hex output, got %d chars: %q", len(h), h)
	}
}

func TestHashUserID_DifferentInputs(t *testing.T) {
	h1 := hashUserID("user_alice")
	h2 := hashUserID("user_bob")
	if h1 == h2 {
		t.Errorf("different users produced same hash: %q", h1)
	}
}

func TestHashUserID_MatchesSHA256(t *testing.T) {
	userID := "user_test123"
	h := sha256.Sum256([]byte(userID))
	expected := fmt.Sprintf("%x", h[:8])
	got := hashUserID(userID)
	if got != expected {
		t.Errorf("hashUserID doesn't match SHA-256 first 8 bytes: expected %q, got %q", expected, got)
	}
}
