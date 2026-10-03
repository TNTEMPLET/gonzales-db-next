/** SMS is not delivered. Email selection is unchanged. */
export function planTournamentAlertDelivery(channels: readonly string[]): {
  email: boolean;
  sms: false;
} {
  return {
    email: channels.includes("EMAIL"),
    sms: false,
  };
}
