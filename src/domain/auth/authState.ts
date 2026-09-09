export type AuthState =
  | "AUTHENTICATED_ONLINE"
  | "AUTHENTICATED_OFFLINE"
  | "REFRESHING"
  | "REAUTH_REQUIRED"
  | "SIGNED_OUT";

export function canUseLocalData(state: AuthState) {
  return (
    state === "AUTHENTICATED_ONLINE" ||
    state === "AUTHENTICATED_OFFLINE" ||
    state === "REFRESHING"
  );
}

export function canUseCloud(state: AuthState) {
  return state === "AUTHENTICATED_ONLINE";
}
