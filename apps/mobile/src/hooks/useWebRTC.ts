import { useRef, useState, useCallback, useEffect } from 'react';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
  type MediaStreamTrack,
  type RTCPeerConnectionIceEvent,
  type EventOnAddStream,
} from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRTCState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
  isMuted: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;
  isVideoEnabled: boolean;
}

interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: RTCSessionDescription;
  candidate?: RTCIceCandidate;
}

interface UseWebRTCOptions {
  socketRef: React.RefObject<Socket | null>;
  targetUserId: string;
  callType: 'voice' | 'video';
  iceServers: IceServer[];
  isInitiator: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onFailed?: () => void;
}

/**
 * useWebRTC — manages RTCPeerConnection lifecycle, media streams, and signaling.
 *
 * Takes a socketRef (not a socket value) to avoid stale closure issues — the ref
 * always points to the current socket even when it connects after hook creation.
 */
export function useWebRTC({
  socketRef,
  targetUserId,
  callType,
  iceServers,
  isInitiator,
  onConnected,
  onDisconnected,
  onFailed,
}: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<WebRTCState['connectionState']>('new');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const hasRemoteDescRef = useRef(false);

  // ── Create peer connection and get media ──
  const start = useCallback(async () => {
    if (pcRef.current) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      console.warn('[WebRTC] Cannot start — socket not connected');
      return;
    }

    // Get local media
    const constraints = {
      audio: true,
      video: callType === 'video' ? { facingMode: 'user' as const, width: 640, height: 480 } : false,
    };

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia(constraints) as MediaStream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia failed:', err);
      return;
    }
    localStreamRef.current = stream;
    setLocalStream(stream);

    // Create peer connection
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    // Add local tracks
    stream.getTracks().forEach((track: MediaStreamTrack) => {
      pc.addTrack(track, stream);
    });

    // Handle remote stream via track event
    pc.addEventListener('track', (event: { streams: MediaStream[] }) => {
      if (event.streams?.[0]) {
        setRemoteStream(event.streams[0]);
      }
    });

    // ICE candidates → relay via socket
    pc.addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate && socketRef.current?.connected) {
        socketRef.current.emit('call_signal', {
          targetUserId,
          signal: { type: 'ice-candidate', candidate: event.candidate } satisfies WebRTCSignal,
        });
      }
    });

    // Connection state tracking
    pc.addEventListener('connectionstatechange', () => {
      const state = pc.connectionState as WebRTCState['connectionState'];
      setConnectionState(state);
      if (state === 'connected') onConnected?.();
      if (state === 'disconnected') onDisconnected?.();
      if (state === 'failed') onFailed?.();
    });

    // If initiator, create and send offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('call_signal', {
          targetUserId,
          signal: { type: 'offer', sdp: offer } satisfies WebRTCSignal,
        });
      } catch (err) {
        console.error('[WebRTC] createOffer failed:', err);
      }
    }
  }, [socketRef, targetUserId, callType, iceServers, isInitiator, onConnected, onDisconnected, onFailed]);

  // ── Handle incoming signaling messages ──
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleSignal = async (data: { fromUserId: string; signal: WebRTCSignal }) => {
      const pc = pcRef.current;
      if (!pc) return;

      const { signal } = data;

      if (signal.type === 'offer' && signal.sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          hasRemoteDescRef.current = true;
          for (const candidate of iceCandidateQueue.current) {
            await pc.addIceCandidate(candidate);
          }
          iceCandidateQueue.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current?.emit('call_signal', {
            targetUserId: data.fromUserId,
            signal: { type: 'answer', sdp: answer } satisfies WebRTCSignal,
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
          iceCandidateQueue.current.push(candidate);
        }
      }
    };

    socket.on('call_signal', handleSignal);
    return () => { socket.off('call_signal', handleSignal); };
  }, [socketRef, targetUserId]);

  // ── Media controls ──
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track: MediaStreamTrack) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((track: MediaStreamTrack) => {
      track.enabled = !track.enabled;
    });
    setIsVideoEnabled((prev) => !prev);
  }, []);

  const flipCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      // react-native-webrtc exposes _switchCamera on video tracks
      const track = videoTracks[0];
      if ('_switchCamera' in track && typeof (track as { _switchCamera: () => void })._switchCamera === 'function') {
        (track as { _switchCamera: () => void })._switchCamera();
        setIsFrontCamera((prev) => !prev);
      }
    }
  }, []);

  // ── Cleanup ──
  const hangup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState('closed');
    hasRemoteDescRef.current = false;
    iceCandidateQueue.current = [];
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      localStreamRef.current = null;
    };
  }, []);

  return {
    localStream,
    remoteStream,
    connectionState,
    isMuted,
    isSpeakerOn,
    isFrontCamera,
    isVideoEnabled,
    start,
    hangup,
    toggleMute,
    toggleVideo,
    flipCamera,
  };
}
