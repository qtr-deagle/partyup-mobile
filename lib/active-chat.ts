// The chat thread currently open on screen, so the in-app notifier can skip
// toasts (and sounds) for messages the user is already looking at.
let activeThreadId: string | null = null;

export function setActiveChatThread(threadId: string | null) {
  activeThreadId = threadId;
}

export function getActiveChatThread() {
  return activeThreadId;
}
