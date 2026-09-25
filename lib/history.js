const RECENT_MESSAGE_LIMIT = 20;

export function recentHistory(messages, limit = RECENT_MESSAGE_LIMIT) {
  return (messages || []).slice(-limit);
}

export function toModelHistory(messages) {
  return recentHistory(messages)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export function applyUserTurn(history, userContent) {
  return [...toModelHistory(history), { role: "user", content: userContent }];
}

export { RECENT_MESSAGE_LIMIT };
