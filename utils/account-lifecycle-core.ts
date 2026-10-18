type Session = { user: { id: string } };
type DeletionDependencies = {
  getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  request(path: string, init?: RequestInit): Promise<Response>;
  signOut(): Promise<void>;
  cleanups: { name: string; run(userId: string): Promise<void> }[];
};

export function createDeleteAccountAction(deps: DeletionDependencies) {
  return async (userId: string, password: string, confirmation: string) => {
    if (confirmation !== "DELETE" || !password) throw new Error("Enter your password and type DELETE to confirm.");
    const current = await deps.getSession();
    if (current.error || current.data.session?.user.id !== userId) throw new Error("Your session changed. Please sign in again.");
    const response = await deps.request("/api/account", {
      method: "DELETE", body: JSON.stringify({ password, confirmation }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) throw new Error(result?.error || "Account deletion was not confirmed. Please try again.");
    const jobs = [...deps.cleanups, { name: "sign-in", run: async () => {
      const latest = await deps.getSession();
      if (latest.error) throw new Error("Could not check the local session");
      if (latest.data.session?.user.id === userId) await deps.signOut();
    } }];
    const settled = await Promise.allSettled(jobs.map(job => job.run(userId)));
    return { localCleanupErrors: settled.flatMap((item, index) => item.status === "rejected" ? [jobs[index].name] : []) };
  };
}

export async function requestPasswordRecovery(auth: {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: unknown }>;
}, email: string, redirectTo: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Enter your account email first.");
  const { error } = await auth.resetPasswordForEmail(normalized, { redirectTo });
  if (error) throw error;
}

type Reminder = { identifier: string; content: { title?: string | null; data?: Record<string, unknown> } };
export function removableNotificationIds(items: Reminder[], userId: string): string[] {
  return items.filter(item => item.content.data?.userId === userId ||
    (!item.content.data?.userId && (item.content.data?.kind === "safespend.smart" || item.content.title === "SafeSpend")))
    .map(item => item.identifier);
}
