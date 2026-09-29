import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApiKeyCreated,
  RecoveryRegenerateResponse,
  ReauthResponse,
  SecurityOverviewResponse,
  SessionRevokeInput,
  SessionRevokeResponse,
  TwoFactorConfirmInput,
  TwoFactorState,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";
import type { ApiKeyCreateInput, PasswordChangeInput } from "@cosmoz/shared";

/**
 * Security center hooks. The overview is the single aggregate — every
 * mutation (including FAILED ones) invalidates it onSettled, because the
 * append-only event log records failures too (rate limits, wrong password).
 */

export function useSecurityOverview() {
  return useQuery({
    queryKey: queryKeys.security,
    queryFn: () =>
      apiRequest<SecurityOverviewResponse>(apiPaths.securityOverview),
  });
}

export function useReauth() {
  return useMutation({
    mutationFn: (input: { password: string }) =>
      apiRequest<ReauthResponse>(apiPaths.securityReauth, {
        method: "POST",
        body: input,
      }),
  });
}

function invalidateSecurity(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.security });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PasswordChangeInput) =>
      apiRequest<{ changedAt: string }>(apiPaths.securityPassword, {
        method: "POST",
        body: input,
      }),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}

export function useEnableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reauthToken: string) =>
      apiRequest<{ secret: string; demoCode: string; recoveryCodes: string[] }>(
        apiPaths.securityTwoFactorEnable,
        { method: "POST", body: { reauthToken } },
      ),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}

export function useConfirmTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TwoFactorConfirmInput) =>
      apiRequest<TwoFactorState>(apiPaths.securityTwoFactorConfirm, {
        method: "POST",
        body: input,
      }),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}

export function useDisableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reauthToken: string) =>
      apiRequest<TwoFactorState>(apiPaths.securityTwoFactorDisable, {
        method: "POST",
        body: { reauthToken },
      }),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}

export function useRegenerateRecoveryCodes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reauthToken: string) =>
      apiRequest<RecoveryRegenerateResponse>(apiPaths.securityTwoFactorRecovery, {
        method: "POST",
        body: { reauthToken },
      }),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApiKeyCreateInput) =>
      apiRequest<ApiKeyCreated>(apiPaths.securityApiKeys, {
        method: "POST",
        body: input,
      }),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keyId, reauthToken }: { keyId: string; reauthToken: string }) =>
      apiRequest<{ id: string }>(apiPaths.securityApiKeyRevoke(keyId), {
        method: "POST",
        body: { reauthToken },
      }),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}

export function useRevokeSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionRevokeInput) =>
      apiRequest<SessionRevokeResponse>(apiPaths.securitySessionRevoke, {
        method: "POST",
        body: input,
      }),
    onSettled: async () => {
      await invalidateSecurity(queryClient);
    },
  });
}
