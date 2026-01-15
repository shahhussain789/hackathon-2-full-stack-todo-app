/**
 * Typed fetch wrapper with JWT header attachment and error handling.
 */

import type { ApiResponse, ErrorResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Token storage key
const TOKEN_KEY = "auth_token";

/**
 * Get stored JWT token from localStorage.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Store JWT token in localStorage.
 */
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove JWT token from localStorage.
 */
export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Check if user is authenticated (has token).
 */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/**
 * Typed API client for making requests to the backend.
 * Includes retry logic to handle cold starts on free hosting tiers.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 2
): Promise<ApiResponse<T>> {
  const token = getToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Attach JWT token if available
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // Handle 401 Unauthorized - redirect to login
      if (response.status === 401) {
        clearToken();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return {
          error: { detail: "Unauthorized - please log in again", status_code: 401 },
        };
      }

      // Handle 403 Forbidden
      if (response.status === 403) {
        return {
          error: { detail: "Access forbidden", status_code: 403 },
        };
      }

      // Handle 204 No Content (e.g., delete success)
      if (response.status === 204) {
        return { data: undefined as T };
      }

      // Parse JSON response
      const data = await response.json();

      // Handle error responses
      if (!response.ok) {
        return {
          error: {
            detail: data.detail || "An error occurred",
            status_code: response.status,
          },
        };
      }

      return { data };
    } catch (error) {
      // On last attempt, return the error
      if (attempt === retries) {
        return {
          error: {
            detail: error instanceof Error ? error.message : "Network error - server may be waking up, please try again",
            status_code: 0,
          },
        };
      }
      // Wait before retrying (1 second, then 2 seconds)
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }

  // Fallback (should not reach here)
  return {
    error: {
      detail: "Network error",
      status_code: 0,
    },
  };
}

// Convenience methods for common HTTP methods
export const api = {
  get: <T>(endpoint: string) => apiClient<T>(endpoint, { method: "GET" }),

  post: <T>(endpoint: string, body: unknown) =>
    apiClient<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body: unknown) =>
    apiClient<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  patch: <T>(endpoint: string, body?: unknown) =>
    apiClient<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string) => apiClient<T>(endpoint, { method: "DELETE" }),
};
