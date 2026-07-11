/** Best-effort Expo push notification sender. Requires no SDK — the Expo
 * push API accepts a plain HTTPS POST. Silently no-ops if `token` is unset,
 * since not every client has granted push permissions / has a real device
 * push token registered. */
export async function sendExpoPush(token: string, title: string, body: string): Promise<void> {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: token, title, body, sound: "default" }),
  });
}
