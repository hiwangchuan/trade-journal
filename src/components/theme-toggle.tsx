"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() { const next = !dark; setDark(next); document.documentElement.classList.toggle("dark", next); localStorage.setItem("theme", next ? "dark" : "light"); }
  return <Button variant="ghost" className="h-8 w-8 p-0" onClick={toggle} aria-label="切换外观">{dark ? <Moon key="dark" size={16} className="theme-icon" /> : <Sun key="light" size={16} className="theme-icon" />}</Button>;
}
