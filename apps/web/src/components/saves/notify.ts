/** Shows a toast; sonner loads on first use, so it stays out of first-load JS. */
export async function notify(message: string) {
  const { toast } = await import('sonner');
  toast(message);
}
