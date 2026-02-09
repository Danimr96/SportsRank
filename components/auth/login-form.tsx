"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getActionButtonClass } from "@/lib/ui/color-system";

interface AuthApiResponse {
  ok: boolean;
  error?: string;
  needsEmailConfirmation?: boolean;
}

async function callAuthApi(
  endpoint: string,
  payload: { email: string; password: string },
): Promise<AuthApiResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as AuthApiResponse;
  if (!response.ok) {
    return {
      ok: false,
      error: data.error ?? "Authentication failed.",
    };
  }

  return data;
}

export function LoginForm() {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      if (isSignup) {
        const result = await callAuthApi("/api/auth/sign-up", { email, password });
        if (!result.ok) {
          throw new Error(result.error ?? "Sign up failed.");
        }

        if (result.needsEmailConfirmation) {
          setMessage("Check your email to confirm the account, then log in.");
          return;
        }
      } else {
        const result = await callAuthApi("/api/auth/sign-in", { email, password });
        if (!result.ok) {
          throw new Error(result.error ?? "Log in failed.");
        }
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="panel-vibrant w-full max-w-md rounded-3xl text-slate-900 shadow-[0_30px_100px_-50px_rgba(8,145,178,0.75)]">
      <CardHeader>
        <CardTitle className="font-display">
          {isSignup ? "Create account" : "Welcome back"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-700">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              className="border-slate-300/80 bg-white text-slate-900"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-700">Password</Label>
            <Input
              id="password"
              type="password"
              minLength={6}
              required
              value={password}
              className="border-slate-300/80 bg-white text-slate-900"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {message ? <p className="text-sm text-slate-600">{message}</p> : null}

          <Button
            type="submit"
            className={`w-full ${getActionButtonClass("primary")}`}
            disabled={pending}
          >
            {pending
              ? "Please wait..."
              : isSignup
                ? "Sign up"
                : "Log in"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-slate-700 hover:bg-cyan-500/15"
            onClick={() => {
              setMessage(null);
              setIsSignup((value) => !value);
            }}
          >
            {isSignup ? "Already have an account? Log in" : "Need an account? Sign up"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
