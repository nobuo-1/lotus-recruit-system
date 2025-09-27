import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-2">
      {/* シンプルなモノトーン・ロゴ（SVG） */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        aria-hidden
        className="text-neutral-800"
      >
        <path
          fill="currentColor"
          d="M12 2c-.9 2.6-2.9 4.6-5.5 5.5C9.1 8.4 11.1 10.4 12 13c.9-2.6 2.9-4.6 5.5-5.5C14.9 6.6 12.9 4.6 12 2zM5 14c2.9.6 5.3 2.9 5.9 5.9c-2.9-.6-5.3-2.9-5.9-5.9zm14 0c-.6 2.9-2.9 5.3-5.9 5.9c.6-2.9 2.9-5.3 5.9-5.9z"
        />
      </svg>
      <span className="text-sm font-semibold tracking-wide text-neutral-900">
        Lotus Recruit
      </span>
    </Link>
  );
}
