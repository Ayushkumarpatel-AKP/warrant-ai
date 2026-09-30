"use client";

import { useEffect, useState } from "react";
import SignIn from "./SignIn";
import Dashboard from "./Dashboard";

// There is no identity in this app. Nothing signs anybody in, no token is
// issued and no server knows who is asking — so the start screen must not imply
// otherwise. What the flag below records is narrower and is named for what it
// is: that the operator opened the dashboard in this browser.
const SESSION_KEY = "ct_session";

export default function Home() {
  const [session, setSession] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Restore the local session flag + theme from this browser.
  useEffect(() => {
    setSession(localStorage.getItem(SESSION_KEY) === "1");
    const t = (localStorage.getItem("ct_theme") as "light" | "dark") || "light";
    setTheme(t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ct_theme", theme);
  }, [theme]);

  function startSession() {
    localStorage.setItem(SESSION_KEY, "1");
    setSession(true);
  }
  function endSession() {
    localStorage.removeItem(SESSION_KEY);
    setSession(false);
  }
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  if (!session) return <SignIn onStart={startSession} />;
  return <Dashboard onSignOut={endSession} theme={theme} onToggleTheme={toggleTheme} />;
}
