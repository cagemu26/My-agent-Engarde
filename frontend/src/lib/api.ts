const AUTH_EXPIRED_TOAST_COOLDOWN_MS = 2500;

let lastAuthExpiredNoticeAt = 0;
export const AUTH_EXPIRED_EVENT = "engarde:auth-expired";

const normalizedBaseUrl = (process.env.NEXT_PUBLIC_API_URL?.trim() || "").replace(/\/+$/, "");

export const API_BASE_URL = normalizedBaseUrl;

export function buildApiUrl(path: string): string {
  if (!path) {
    return API_BASE_URL;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) {
    return normalizedPath;
  }
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("auth_token");
}

export function buildAuthedApiUrl(path: string): string {
  const rawUrl = buildApiUrl(path);
  if (typeof window === "undefined") {
    return rawUrl;
  }
  const url = /^https?:\/\//i.test(rawUrl)
    ? new URL(rawUrl)
    : new URL(rawUrl, window.location.origin);
  const token = getAuthToken();
  if (token) {
    url.searchParams.set("access_token", token);
  }
  return url.toString();
}

export function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? undefined);
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(buildApiUrl(path), {
    ...init,
    headers,
  }).then((response) => {
    if (typeof window === "undefined") return response;

    const isAuthFailure = response.status === 401 || response.status === 403;
    const isAuthPageRequest = path.startsWith("/api/auth/");
    if (!isAuthFailure || isAuthPageRequest) return response;

    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("auth_user");

    const now = Date.now();
    if (now - lastAuthExpiredNoticeAt > AUTH_EXPIRED_TOAST_COOLDOWN_MS) {
      lastAuthExpiredNoticeAt = now;
      window.dispatchEvent(
        new CustomEvent(AUTH_EXPIRED_EVENT, {
          detail: {
            status: response.status,
            path,
          },
        }),
      );
    }

    return response;
  });
}
