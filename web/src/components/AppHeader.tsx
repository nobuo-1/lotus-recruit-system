import Logo from "./Logo";
import BackButton from "./BackButton";

export default function AppHeader({
  showBack = false,
}: {
  showBack?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-2">
          {showBack && <BackButton />}
        </div>
      </div>
    </header>
  );
}
