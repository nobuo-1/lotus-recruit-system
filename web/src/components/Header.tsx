import React from "react";
import LogoutButton from "./LogoutButton";

export default function Header() {
  return (
    <header className="flex items-center justify-between py-3">
      <div className="font-semibold">Lotus Recruit</div>
      <LogoutButton />
    </header>
  );
}
