import Link from "next/link";

export default function Nav() {
  return (
    <header className="border-b border-zinc-800">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          <span className="text-emerald-400">Tok</span>Shop
        </Link>
        <div className="flex items-center gap-6 text-sm text-zinc-300">
          <Link href="/#pricing" className="hover:text-white">
            Pricing
          </Link>
          <Link href="/docs" className="hover:text-white">
            Docs
          </Link>
          <Link href="/login" className="hover:text-white">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Get API Key
          </Link>
        </div>
      </nav>
    </header>
  );
}
