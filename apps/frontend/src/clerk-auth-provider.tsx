import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from "@clerk/clerk-react";
import type { PropsWithChildren } from "react";
import { AuthSessionProvider } from "./auth-session";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function ClerkSessionBridge({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  if (!isLoaded) {
    return (
      <AuthSessionProvider value={{ isLoaded: false, isSignedIn: false, isConfigured: true }}>
        {children}
      </AuthSessionProvider>
    );
  }

  if (isSignedIn !== true) {
    return (
      <AuthSessionProvider value={{ isLoaded: true, isSignedIn: false, isConfigured: true }}>
        {children}
      </AuthSessionProvider>
    );
  }

  return (
    <AuthSessionProvider
      value={{
        isLoaded: true,
        isSignedIn: true,
        isConfigured: true,
        userEmail: user.primaryEmailAddress?.emailAddress,
        userName: user.fullName ?? user.username ?? user.primaryEmailAddress?.emailAddress,
        getAuthToken: getToken,
        signOut
      }}
    >
      {children}
    </AuthSessionProvider>
  );
}

export function ClerkAuthProvider({ children }: PropsWithChildren) {
  if (!publishableKey) {
    return (
      <AuthSessionProvider value={{ isLoaded: true, isSignedIn: false, isConfigured: false }}>
        {children}
      </AuthSessionProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkSessionBridge>{children}</ClerkSessionBridge>
    </ClerkProvider>
  );
}

export function ClerkLoginPanel() {
  if (!publishableKey) {
    return (
      <section className="auth-panel">
        <h1>Essay Coach</h1>
        <h2>ログイン設定が必要です</h2>
        <p>VITE_CLERK_PUBLISHABLE_KEY を設定してからアプリを開いてください。</p>
      </section>
    );
  }

  const isSignUp = typeof window !== "undefined" && window.location.pathname.includes("sign-up");
  return (
    <section className="auth-panel">
      {isSignUp ? <SignUp routing="hash" signInUrl="/" /> : <SignIn routing="hash" signUpUrl="/#/sign-up" />}
    </section>
  );
}
