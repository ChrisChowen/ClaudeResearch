let sessionStartTime = null;
let timerInterval = null;
let currentState = 'waiting'; // waiting | sync | onboarding | active

function updateTimer() {
  if (!sessionStartTime) return;
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  document.getElementById('timer').textContent =
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function showState(state) {
  currentState = state;
  document.getElementById('syncState').classList.add('hidden');
  document.getElementById('onboardingState').classList.add('hidden');
  document.getElementById('waitingState').classList.add('hidden');
  document.getElementById('activeState').classList.add('hidden');

  document.getElementById(`${state}State`).classList.remove('hidden');

  if (state === 'active') {
    document.getElementById('mainContainer').classList.add('session-active');
  }
}

function dismissOnboarding() {
  showState('active');
  if (!timerInterval) {
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  }
}

async function checkSessionStatus() {
  try {
    const res = await fetch('/api/session/status');
    const data = await res.json();

    if (data.active && data.session.launched) {
      sessionStartTime = new Date(data.session.startTime).getTime();

      // If we're still in waiting state, transition through the flow
      if (currentState === 'waiting') {
        // Show sync marker briefly for OBS capture
        if (data.session.syncMarker) {
          document.getElementById('participantSyncMarker').textContent = data.session.syncMarker;
          document.getElementById('participantSyncTime').textContent =
            new Date().toLocaleString();
          showState('sync');

          // After 4 seconds, move to next state
          setTimeout(() => {
            if (data.session.mode === 'enhanced') {
              showState('onboarding');
            } else {
              // Vanilla mode: go straight to active
              showState('active');
              if (!timerInterval) {
                timerInterval = setInterval(updateTimer, 1000);
                updateTimer();
              }
            }
          }, 4000);
        } else {
          // No sync marker, go directly
          if (data.session.mode === 'enhanced') {
            showState('onboarding');
          } else {
            showState('active');
            if (!timerInterval) {
              timerInterval = setInterval(updateTimer, 1000);
              updateTimer();
            }
          }
        }
      }
    }
  } catch {
    // Server not available, keep waiting
  }
}

// Poll for session status
setInterval(checkSessionStatus, 2000);
checkSessionStatus();
