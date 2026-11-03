import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AuthMeResponse,
  AuthSuccess,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  LoginInput,
  LoginResponse,
  MfaChallengeInput,
  MfaRecoveryInput,
  RegisterInput,
  RegisterResponse,
  ResendVerificationResponse,
  ResetPasswordInput,
  ResetPasswordResponse,
  VerifyEmailResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Authentication hooks. Identity state is NOT cached forever - /auth/me is
 * the single source of truth consumed by the AuthProvider; every other hook
 * is a mutation that the provider (or the auth pages) fold into state.
 */

/** Boot-time identity restore. No retries: 401 → unauthenticated, cleanly. */
export function useAuthMeQuery() {
  return useQuery<AuthMeResponse>({
    queryKey: queryKeys.authMe,
    queryFn: () => apiRequest<AuthMeResponse>(apiPaths.authMe),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest<LoginResponse>(apiPaths.authLogin, { method: "POST", body: input }),
  });
}

export function useMfaChallengeMutation() {
  return useMutation({
    mutationFn: (input: MfaChallengeInput) =>
      apiRequest<LoginResponse>(apiPaths.authMfaChallenge, {
        method: "POST",
        body: input,
      }),
  });
}

export function useMfaRecoveryMutation() {
  return useMutation({
    mutationFn: (input: MfaRecoveryInput) =>
      apiRequest<LoginResponse>(apiPaths.authMfaRecover, {
        method: "POST",
        body: input,
      }),
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiRequest<RegisterResponse>(apiPaths.authRegister, {
        method: "POST",
        body: input,
      }),
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () =>
      apiRequest<{ loggedOut: boolean }>(apiPaths.authLogout, {
        method: "POST",
      }),
  });
}

export function useVerifyEmailMutation() {
  return useMutation({
    mutationFn: (token: string) =>
      apiRequest<VerifyEmailResponse>(apiPaths.authEmailVerify, {
        method: "POST",
        body: { token },
      }),
  });
}

export function useResendVerificationMutation() {
  return useMutation({
    mutationFn: (email: string) =>
      apiRequest<ResendVerificationResponse>(apiPaths.authEmailResend, {
        method: "POST",
        body: { email },
      }),
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      apiRequest<ForgotPasswordResponse>(apiPaths.authPasswordForgot, {
        method: "POST",
        body: input,
      }),
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      apiRequest<ResetPasswordResponse>(apiPaths.authPasswordReset, {
        method: "POST",
        body: input,
      }),
  });
}

/** Internal helper for the AuthProvider - folds an AuthSuccess into state. */
export function authSuccessToMe(success: AuthSuccess): AuthMeResponse {
  return { user: success.user, session: success.session };
}
