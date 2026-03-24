import { useRef, useState, useCallback, useEffect } from 'react';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
  type MediaStreamTrack,
} from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';

// ── Types ──

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: RTCSessionDescription;
  candidate?: RTCIceCandidate | null;
}

interface UseWebRTCOptions {
  socketRef: React.RefObject<Socket | null>;
  socketReady: boolean;
  targetUserId: string;
  callType: 'voice' | 'video';
  iceServers: IceServer[];
  isInitiator: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onFailed?: () => void;
}

/**
 * useWebRTC — complete RTCPeerConnection lifecycle for 1-on-1 calls.
 *
 * Architecture decisions based on react-native-webrtc v124 docs:
 * - Uses pc.ontrack (not addEventListener) to avoid event-target-shim TS issue
 * - Pattern B for remote streams (manual addTrack to MediaStream) — more robust
 * - Callbacks stored in refs to prevent stale closures in PC event handlers
 * - startingRef mutex prevents double-start during async getUserMedia
 * - socketReady boolean bridges async socket connect to React effect system
 * - ICE trickle with queue for candidates arriving before remote description
 * - stream.release() on cleanup to free native resources
 */
export function useWebRTC({
  socketRef,
  socketReady,
  targetUserId,
  callType,
  iceServers,
  isInitiator,
  onConnected,
  onDisconnected,
  onFailed,
}: UseWebRTCOptions) {
  // ── Refs ──
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const hasRemoteDescRef = useRef(false);
  const mountedRef = useRef(true);

  // Callback refs — always current, never stale in PC event listeners
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onFailedRef = useRef(onFailed);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => { onDisconnectedRef.current = onDisconnected; }, [onDisconnected]);
  useEffect(() => { onFailedRef.current = onFailed; }, [onFailed]);

  // ── State ──
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [isMuted, setIsMuted] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');

  // ── Start: create PC + get media + send offer (if initiator) ──
  const start = useCallback(async () => {
    if (pcRef.current || startingRef.current) return;
    startingRef.current = true;

    const socket = socketRef.current;
    if (!socket?.connected) {
      console.warn('[WebRTC] Cannot start — socket not connected');
      startingRef.current = false;
      return;
    }

    // Get local media
    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? { facingMode: 'user' as const, width: 640, height: 480 } : false,
      }) as MediaStream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia failed:', err);
      startingRef.current = false;
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      (stream as MediaStream & { release?: () => void }).release?.();
      startingRef.current = false;
      return;
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    // Create peer connection
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    startingRef.current = false;

    // Add local tracks to connection
    stream.getTracks().forEach((track: MediaStreamTrack) => {
      pc.addTrack(track, stream);
    });

    // Remote stream: Pattern B (manual assembly — more robust than event.streams[0])
    const remote = new MediaStream();
    remoteStreamRef.current = remote;

    // Use pc.ontrack (avoids event-target-shim TS compatibility issue with addEventListener)
    pc.ontrack = (event) => {
      if (!mountedRef.current) return;
      const incomingTrack = (event as { track?: MediaStreamTrack }).track;
      const incomingStreams = (event as { streams?: MediaStream[] }).streams;

      if (incomingTrack) {
        // Pattern B: manually add track to our controlled MediaStream
        remote.addTrack(incomingTrack);
      } else if (incomingStreams?.[0]) {
        // Fallback Pattern A: use the first stream directly
        remoteStreamRef.current = incomingStreams[0];
      }

      // Set state to trigger re-render (same object ref is fine — React batches)
      setRemoteStream(remoteStreamRef.current);
    };

    // ICE candidate trickle — send each immediately
    pc.onicecandidate = (event) => {
      const candidate = (event as { candidate: RTCIceCandidate | null }).candidate;
      if (candidate && socketRef.current?.connected) {
        socketRef.current.emit('call_signal', {
          targetUserId,
          signal: { type: 'ice-candidate', candidate } as WebRTCSignal,
        });
      }
      // candidate === null means gathering complete (we don't need to signal this)
    };

    // Connection state — use callback refs to avoid stale closures
    pc.onconnectionstatechange = () => {
      if (!mountedRef.current) return;
      const state = pc.connectionState as ConnectionState;
      setConnectionState(state);
      if (state === 'connected') onConnectedRef.current?.();
      if (state === 'disconnected') onDisconnectedRef.current?.();
      if (state === 'failed') onFailedRef.current?.();
    };

    // ICE connection state (useful for debugging)
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.warn('[WebRTC] ICE connection failed — may need TURN server');
      }
    };

    // If initiator, create and send offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video',
        });
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('call_signal', {
          targetUserId,
          signal: { type: 'offer', sdp: offer } as WebRTCSignal,
        });
      } catch (err) {
        console.error('[WebRTC] createOffer failed:', err);
      }
    }
  }, [socketRef, targetUserId, callType, iceServers, isInitiator]);

  // ── Handle incoming signaling messages ──
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socketReady) return;

    const handleSignal = async (data: { fromUserId: string; signal: WebRTCSignal }) => {
      const pc = pcRef.current;
      if (!pc) return;

      // Only accept signals from our target peer
      if (data.fromUserId !== targetUserId && targetUserId !== '') return;

      const { signal } = data;

      if (signal.type === 'offer' && signal.sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          hasRemoteDescRef.current = true;

          // Drain queued ICE candidates
          for (const candidate of iceCandidateQueue.current) {
            await pc.addIceCandidate(candidate);
          }
          iceCandidateQueue.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current?.emit('call_signal', {
            targetUserId: data.fromUserId,
            signal: { type: 'answer', sdp: answer } as WebRTCSignal,
          });
        } catch (err) {
          console.error('[WebRTC] handleOffer failed:', err);
        }
      }

      if (signal.type === 'answer' && signal.sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          hasRemoteDescRef.current = true;

          for (const candidate of iceCandidateQueue.current) {
            await pc.addIceCandidate(candidate);
          }
          iceCandidateQueue.current = [];
        } catch (err) {
          console.error('[WebRTC] handleAnswer failed:', err);
        }
      }

      if (signal.type === 'ice-candidate' && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (hasRemoteDescRef.current) {
          try { await pc.addIceCandidate(candidate); }
          catch (err) { console.error('[WebRTC] addIceCandidate failed:', err); }
        } else {
          // Queue until remote description is set (max 200 to prevent unbounded growth)
          if (iceCandidateQueue.current.length < 200) {
            iceCandidateQueue.current.push(candidate);
          }
        }
      }
    };

    socket.on('call_signal', handleSignal);
    return () => { socket.off('call_signal', handleSignal); };
  }, [socketRef, socketReady, targetUserId]);

  // ── Media controls ──
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const newEnabled = !audioTracks[0].enabled;
    audioTracks.forEach((track: MediaStreamTrack) => { track.enabled = newEnabled; });
    setIsMuted(!newEnabled);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;
    const newEnabled = !videoTracks[0].enabled;
    videoTracks.forEach((track: MediaStreamTrack) => { track.enabled = newEnabled; });
    setIsVideoEnabled(newEnabled);
  }, []);

  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    // Modern API: applyConstraints (v124+)
    // Fallback: _switchCamera (deprecated but works)
    try {
      await videoTrack.applyConstraints({
        facingMode: isFrontCamera ? 'environment' : 'user',
      });
      setIsFrontCamera((prev) => !prev);
    } catch {
      // Fallback for older react-native-webrtc versions
      if ('_switchCamera' in videoTrack) {
        (videoTrack as unknown as { _switchCamera: () => void })._switchCamera();
        setIsFrontCamera((prev) => !prev);
      }
    }
  }, [isFrontCamera]);

  // ── Cleanup ──
  const releaseStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    // release() frees native resources (iOS AVCaptureSession, Android Camera)
    (stream as MediaStream & { release?: () => void }).release?.();
  }, []);

  const hangup = useCallback(() => {
    // Remove event handlers before closing to prevent setState after close
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    releaseStream(localStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState('closed');
    hasRemoteDescRef.current = false;
    iceCandidateQueue.current = [];
    startingRef.current = false;
  }, [releaseStream]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pcRef.current) {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      releaseStream(localStreamRef.current);
      localStreamRef.current = null;
    };
  }, [releaseStream]);

  return {
    localStream,
    remoteStream,
    connectionState,
    isMuted,
    isFrontCamera,
    isVideoEnabled,
    start,
    hangup,
    toggleMute,
    toggleVideo,
    flipCamera,
  };
}
