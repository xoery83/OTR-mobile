export async function submitSettlementUpdate(
  inFlight: { current: boolean },
  reason: string,
  setConfirming: (confirming: boolean) => void,
  confirm: (reason: string) => Promise<boolean>,
  onConfirmed: () => void,
) {
  if (inFlight.current || !reason.trim()) return false;
  inFlight.current = true;
  setConfirming(true);
  let confirmed = false;
  try {
    confirmed = await confirm(reason.trim());
    if (confirmed) onConfirmed();
    return confirmed;
  } finally {
    if (!confirmed) {
      inFlight.current = false;
      setConfirming(false);
    }
  }
}
