// check.js

// WebRTC configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' } // Public STUN server
  ]
};

// Global variables
let localStream = null;
let peerConnections = {};
let roomId = null;
let userId = null;
let pusher = null;
let channel = null;

// Initialize Pusher
Pusher.logToConsole = true;
pusher = new Pusher('0746c442e7028eaa0ee8', {
  cluster: 'ap3',
  authEndpoint: 'https://auth-server-nwiv.onrender.com/pusher/auth',
  authTransport: 'ajax',
  auth: {
    headers: {
      'Content-Type': 'application/json'
    }
  },
  wsHost: 'ws-ap3.pusher.com',
  wsPort: 443,
  forceTLS: true,
  enableStats: false // disableStats 대신 사용
});

// DOM elements
const userSelectionDiv = document.getElementById('user-selection');
const videoCallDiv = document.getElementById('video-call');
const roomNumberInput = document.getElementById('room-number');
const userIdInput = document.getElementById('user-id');
const leaveButton = document.getElementById('leave-button');

// Proceed function
async function proceed() {
  roomId = roomNumberInput.value.trim().toLowerCase();
  userId = userIdInput.value.trim() || '테스트사용자';

  if (!roomId || !/^(교사|[1-8])$/.test(roomId)) {
    alert('방 번호는 1-8 또는 "교사"를 입력하세요.');
    return;
  }

  try {
    // Get user media
    localStream = await navigator.mediaDevices.getUserMedia({
      video: roomId === '교사' ? false : true,
      audio: true
    });

    // Show video call section
    userSelectionDiv.style.display = 'none';
    videoCallDiv.style.display = 'block';

    // Add local stream to corresponding slot
    const slotId = roomId === '교사' ? 'slot-teacher' : `slot-room${roomId}`;
    addVideoStream(userId, localStream, slotId);

    // Wait for Pusher connection
    await new Promise((resolve, reject) => {
      pusher.connection.bind('connected', () => {
        console.log('Pusher connected, socket_id:', pusher.connection.socket_id);
        resolve();
      });
      pusher.connection.bind('error', (err) => {
        console.error('Pusher connection error:', err);
        reject(err);
      });
    });

    // Subscribe to Pusher private channel with delay
    console.log('Subscribing to private-point-system with socket_id:', pusher.connection.socket_id);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
    channel = pusher.subscribe('private-point-system');
    channel.bind('pusher:subscription_succeeded', () => {
      console.log('Subscription succeeded');
      // Send join event
      console.log('Sending client-join:', { roomId: slotId, userId });
      channel.trigger('client-join', {
        roomId: slotId,
        userId
      });
      // Request current users with delay
      setTimeout(() => {
        console.log('Sending client-request-users:', { userId });
        channel.trigger('client-request-users', {
          userId
        });
      }, 3000);
    });
    channel.bind('pusher:subscription_error', (error) => {
      console.error('Subscription error:', error);
      alert('Pusher 채널 구독에 실패했습니다. 인증 서버를 확인하세요.');
    });
    channel.bind('client-join', (data) => {
      console.log('Received client-join:', data);
      if (data.userId !== userId) {
        initiateConnection(data.userId, data.roomId);
      }
    });
    channel.bind('client-request-users', (data) => {
      console.log('Received client-request-users:', data);
      if (data.userId !== userId) {
        console.log('Responding with client-join:', { roomId: slotId, userId });
        channel.trigger('client-join', {
          roomId: slotId,
          userId
        });
      }
    });
    channel.bind('client-offer', handleOffer);
    channel.bind('client-answer', handleAnswer);
    channel.bind('client-candidate', handleCandidate);
    channel.bind('client-leave', (data) => {
      console.log('Received client-leave:', data);
      removeVideoStream(data.userId, data.roomId);
    });
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('마이크 접근에 실패했습니다. 휴대폰에서 마이크 권한을 허용해 주세요.');
  }
}

// Initiate WebRTC connection
async function initiateConnection(targetUserId, targetRoomId) {
  if (peerConnections[`${targetUserId}-${targetRoomId}`]) {
    console.log('Connection already exists for:', targetUserId, targetRoomId);
    return;
  }

  console.log('Initiating connection to:', targetUserId, targetRoomId);
  const pc = new RTCPeerConnection(configuration);
  peerConnections[`${targetUserId}-${targetRoomId}`] = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending client-candidate:', event.candidate);
      channel.trigger('client-candidate', {
        candidate: event.candidate,
        roomId: targetRoomId,
        userId,
        target: targetUserId
      });
    }
  };

  pc.ontrack = (event) => {
    console.log('Received track for:', targetUserId);
    addVideoStream(targetUserId, event.streams[0], targetRoomId);
  };

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
    console.log('Added track:', track);
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log('Sending client-offer:', offer);
  channel.trigger('client-offer', {
    offer,
    roomId: targetRoomId,
    userId,
    target: targetUserId
  });
}

// Add video stream to grid
function addVideoStream(id, stream, slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) {
    console.error('Slot not found:', slotId);
    return;
  }

  // Remove existing video if any
  const existingVideo = slot.querySelector('video');
  if (existingVideo) existingVideo.remove();

  const video = document.createElement('video');
  video.id = `video-${id}-${slotId}`;
  video.srcObject = stream;
  video.autoplay = true;
  video.playsinline = true;

  // Add user label
  const label = slot.querySelector('span');
  if (label) label.textContent = `${id} (${slotId.replace('slot-', '') === 'teacher' ? '교사' : slotId.replace('slot-room', '') + '번 방'})`;

  slot.appendChild(video);
  console.log('Video stream added for:', id, slotId);
}

// Remove video stream
function removeVideoStream(id, slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) {
    console.error('Slot not found:', slotId);
    return;
  }

  const video = document.getElementById(`video-${id}-${slotId}`);
  if (video) video.remove();

  const label = slot.querySelector('span');
  if (label) label.textContent = slotId === 'slot-teacher' ? '교사' : slotId.replace('slot-room', '') + '번 방';

  delete peerConnections[`${id}-${slotId}`];
  console.log('Video stream removed for:', id, slotId);
}

// Handle WebRTC offer
async function handleOffer(data) {
  if (data.target !== userId) {
    console.log('Offer ignored, not for this user:', data);
    return;
  }

  if (peerConnections[`${data.userId}-${data.roomId}`]) {
    console.log('Connection already exists for:', data.userId, data.roomId);
    return;
  }

  console.log('Handling offer from:', data.userId, data.roomId);
  const pc = new RTCPeerConnection(configuration);
  peerConnections[`${data.userId}-${data.roomId}`] = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending client-candidate:', event.candidate);
      channel.trigger('client-candidate', {
        candidate: event.candidate,
        roomId: data.roomId,
        userId,
        target: data.userId
      });
    }
  };

  pc.ontrack = (event) => {
    console.log('Received track for:', data.userId);
    addVideoStream(data.userId, event.streams[0], data.roomId);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  console.log('Sending client-answer:', answer);
  channel.trigger('client-answer', {
    answer,
    roomId: data.roomId,
    userId,
    target: data.userId
  });

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
    console.log('Added track:', track);
  });
}

// Handle WebRTC answer
async function handleAnswer(data) {
  if (data.target !== userId) {
    console.log('Answer ignored, not for this user:', data);
    return;
  }
  const pc = peerConnections[`${data.userId}-${data.roomId}`];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    console.log('Received client-answer:', data);
  } else {
    console.error('No peer connection found for:', data.userId, data.roomId);
  }
}

// Handle ICE candidate
async function handleCandidate(data) {
  if (data.target !== userId) {
    console.log('Candidate ignored, not for this user:', data);
    return;
  }
  const pc = peerConnections[`${data.userId}-${data.roomId}`];
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    console.log('Received client-candidate:', data);
  } else {
    console.error('No peer connection found for:', data.userId, data.roomId);
  }
}

// Toggle mute
function toggleMute() {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
      console.log('Audio track enabled:', track.enabled);
    });
  }
}

// Toggle video
function toggleVideo() {
  if (localStream) {
    localStream.getVideoTracks().forEach(track => {
      track.enabled = !track.enabled;
      console.log('Video track enabled:', track.enabled);
    });
  }
}

// Leave room
async function leaveRoom() {
  console.log('Leaving room, sending client-leave:', { roomId, userId });
  if (channel) {
    channel.trigger('client-leave', {
      roomId,
      userId
    });
  } else {
    console.error('Channel not available for client-leave');
  }

  // Stop tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    console.log('Stopped media tracks');
  }

  // Close peer connections
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  console.log('Closed peer connections');

  // Reset UI
  document.querySelectorAll('.video-slot video').forEach(video => video.remove());
  document.querySelectorAll('.video-slot span').forEach(span => {
    const slotId = span.parentElement.id;
    span.textContent = slotId === 'slot-teacher' ? '교사' : slotId.replace('slot-room', '') + '번 방';
  });
  videoCallDiv.style.display = 'none';
  userSelectionDiv.style.display = 'block';
  console.log('Room left, UI reset');
}

// Bind leave button event
if (leaveButton) {
  leaveButton.addEventListener('click', () => {
    console.log('Leave button clicked');
    leaveRoom();
  });
} else {
  console.error('Leave button not found');
}