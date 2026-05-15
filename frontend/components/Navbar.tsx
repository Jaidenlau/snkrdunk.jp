"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearToken, getRegionalPreference, isLoggedIn } from "@/lib/api";

export default function Navbar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isHongKong, setIsHongKong] = useState(false);

  useEffect(() => {
    const refresh = () => setLoggedIn(isLoggedIn());
    refresh();
    setIsHongKong(getRegionalPreference().isHongKong);
    window.addEventListener("storage", refresh);
    window.addEventListener("auth-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("auth-changed", refresh);
    };
  }, []);

  function logout() {
    clearToken();
    setLoggedIn(false);
    window.dispatchEvent(new Event("auth-changed"));
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 shadow-sm shadow-slate-200/40 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 text-lg font-black tracking-tight text-slate-950">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm text-yellow-300 shadow-lg shadow-slate-300 ring-4 ring-yellow-300/10">
            S
          </span>
          <span className="hidden sm:inline">snkrdunk.jp</span>
        </Link>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Link className="rounded-full px-4 py-2 transition hover:bg-slate-950 hover:text-white" href="/">
            {isHongKong ? "首頁" : "Home"}
          </Link>
          <Link className="rounded-full px-4 py-2 transition hover:bg-slate-950 hover:text-white" href="/portfolio">
            Collection
          </Link>
          {loggedIn ? (
            <Link className="rounded-full px-4 py-2 transition hover:bg-slate-950 hover:text-white" href="/admin">
              Admin
            </Link>
          ) : null}
          {loggedIn ? (
            <button className="rounded-full bg-slate-950 px-4 py-2 text-white shadow-lg shadow-slate-200 transition hover:bg-emerald-600" onClick={logout}>
              {isHongKong ? "登出" : "Logout"}
            </button>
          ) : (
            <Link className="rounded-full bg-slate-950 px-4 py-2 text-white shadow-lg shadow-slate-200 transition hover:bg-emerald-600" href="/login">
              {isHongKong ? "登入" : "Login"}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
