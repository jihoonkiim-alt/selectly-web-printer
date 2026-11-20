// Port of lib/services/print_decision_service.dart — keep behavior identical.
// K-amount detection and print-content assembly.

const K_PATTERN = /(\d+(?:\.\d+)?)\s*[kK]\b/;

// An amount already embedded in the comment text, e.g. "mine star 7k" -> "7".
export function detectAmount(message) {
  const match = K_PATTERN.exec(message);
  return match ? match[1] : null;
}

// If the comment already carries its own "Nk", it prints verbatim —
// appending would just duplicate what's already there. Otherwise an
// operator-entered amount gets appended as "(NNk)"; blank prints the
// comment as-is.
export function buildContent({ message, enteredAmount }) {
  if (detectAmount(message) !== null) return message;
  const amount = enteredAmount == null ? '' : String(enteredAmount).trim();
  if (amount.length === 0) return message;
  return `${message} (${amount}k)`;
}
