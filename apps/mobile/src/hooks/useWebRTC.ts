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

interface UseWebRTCOptions {
  socket: Socket | null;
  sessionId: string;
  targetUserId: string;
  callType: 'voice' | 'video';
  iceServers: IceServer[];
  isInitiator: boolean; // true = caller, false = callee
  onConnected?: () => void;
  onDisconnected?: () => void;
  onFailed?: () => void;
}

/**
 * useWebRTC — manages RTCPeerConnection, media streams, and signaling.
 *
 * Flow:
 * 1. getUserMedia for local audio (+video if video call)
 * 2. Create RTCPeerConnection with TURN/STUN servers
 * 3. If initiator: createOffer → send via socket
 * 4. If callee: wait for offer → createAnswer → send via socket
 * 5. Exchange ICE candidates via socket
 * 6. Track connection state changes
 */
export function useWebRTC({
  socket,
  sessionId,
  targetUserId,
  callType,
  iceServers,
  isInitiator,
  onConnected,
  onDisconnected,
  onFailed,
}: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
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

    // Get local media
    const constraints: Record<string, unknown> = {
      audio: true,
      video: callType === 'video' ? { facingMode: 'user', width: 640, height: 480 } : false,
    };

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia(constraints) as MediaStream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia failed:', err);
      return;
    }
    setLocalStream(stream);

    // Create peer connection
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    // Add local tracks to peer connection
    stream.getTracks().forEach((track: MediaStreamTrack) => {
      pc.addTrack(track, stream);
    });

    // Handle remote stream
    const remote = new MediaStream(undefined);
    setRemoteStream(remote);

    pc.addEventListener('track', (event: any) => {
      if (event.streams?.[0]) {
        event.streams[0].getTracks().forEach((track: MediaStreamTrack) => {
          remote.addTrack(track);
        });
        setRemoteStream(new MediaStream(remote.toURL ? undefined : undefined));
        // Force re-render with new reference
        setRemoteStream(event.streams[0]);
      }
    });

    // ICE candidates → send to remote peer via socket
    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate && socket) {
        socket.emit('call_signal', {
          targetUserId,
          signal: { type: 'ice-candidate', candidate: event.candidate },
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
        socket?.emit('call_signal', {
          targetUserId,
          signal: { type: 'offer', sdp: offer },
        });
      } catch (err) {
        console.error('[WebRTC] createOffer failed:', err);
      }
    }
  }, [socket, sessionId, targetUserId, callType, iceServers, isInitiator, onConnected, onDisconnected, onFailed]);

  // ── Handle incoming signaling messages ──
  useEffect(() => {
    if (!socket) return;

    const handleSignal = async (data: { fromUserId: string; signal: any }) => {
      const pc = pcRef.current;
      if (!pc) return;

      const { signal } = data;

      if (signal.type === 'offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          hasRemoteDescRef.current = true;

          // Flush queued ICE candidates
          for (const candidate of iceCandidateQueue.current) {
            await pc.addIceCandidate(candidate);
          }
          iceCandidateQueue.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call_signal', {
            targetUserId: data.fromUserId,
            signal: { type: 'answer', sdp: answer },
          });
        } catch (err) {
          console.error('[WebRTC] handleOffer failed:', err);
        }
      }

      if (signal.type === 'answer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          hasRemoteDescRef.current = true;

          // Flush queued ICE candidates
          for (const candidate of iceCandidateQueue.current) {
            await pc.addIceCandidate(candidate);
          }
          iceCandidateQueue.current = [];
        } catch (err) {
          console.error('[WebRTC] handleAnswer failed:', err);
        }
      }

      if (signal.type === 'ice-candidate') {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (hasRemoteDescRef.current) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.error('[WebRTC] addIceCandidate failed:', err);
          }
        } else {
          // Queue until remote description is set
          iceCandidateQueue.current.push(candidate);
        }
      }
    };

    socket.on('call_signal', handleSignal);
    return () => { socket.off('call_signal', handleSignal); };
  }, [socket, targetUserId]);

  // ── Media controls ──
  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach((track: MediaStreamTrack) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach((track: MediaStreamTrack) => {
      track.enabled = !track.enabled;
    });
    setIsVideoEnabled((prev) => !prev);
  }, [localStream]);

  const flipCamera = useCallback(async () => {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
      const track = videoTracks[0] as any;
      if (track._switchCamera) {
        track._switchCamera();
        setIsFrontCamera((prev) => !prev);
      }
    }
  }, [localStream]);

  // ── Cleanup ──
  const hangup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState('closed');
    hasRemoteDescRef.current = false;
    iceCandidateQueue.current = [];
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      localStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
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
