import { createContext, useContext } from "react";

export interface AuthSession {
  isLoaded: boolean;
  isSignedIn: boolean;
  isConfigured: boolean;
  userName?: string;
  userEmail?: string;
  getAuthToken?: () => Promise<string | null>;
  signOut?: () => Promise<void> | void;
}

export const defaultAuthSession: AuthSession = {
  isLoaded: true,
  isSignedIn: false,
  isConfigured: false
};

const AuthSessionContext = createContext<AuthSession>(defaultAuthSession);

export const AuthSessionProvider = AuthSessionContext.Provider;

export function useAuthSession(): AuthSession {
  return useContext(AuthSessionContext);
}
