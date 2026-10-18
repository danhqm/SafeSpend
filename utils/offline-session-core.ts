type SessionDependencies = {
  getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>;
  getOfflineUserId(): Promise<string | null>;
  getHome(userId: string): Promise<unknown>;
};

function isNetworkFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const issue = error as { name?: string; status?: number };
  return issue.name === "AuthRetryableFetchError" && issue.status === 0;
}

export function createSavedUserIdReader(dependencies: SessionDependencies) {
  return async (): Promise<{ userId: string | null; offline: boolean }> => {
    let networkError: unknown;
    try {
      const { data, error } = await dependencies.getSession();
      if (error) throw error;
      if (data.session?.user.id) return { userId: data.session.user.id, offline: false };
      return { userId: null, offline: false };
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      networkError = error;
    }
    const userId = await dependencies.getOfflineUserId();
    if (!userId || !await dependencies.getHome(userId)) throw networkError;
    return { userId, offline: true };
  };
}

export async function checkBiometricAccess(dependencies: {
  getSavedUserId(): Promise<{ userId: string | null }>;
  isEnabledFor(userId: string): Promise<boolean>;
}): Promise<"open" | "locked" | "unavailable"> {
  try {
    const { userId } = await dependencies.getSavedUserId();
    return userId && await dependencies.isEnabledFor(userId) ? "locked" : "open";
  } catch {
    return "unavailable";
  }
}
