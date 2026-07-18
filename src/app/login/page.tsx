import Nav from "@/components/Nav";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <AuthForm mode="login" />
      </main>
    </div>
  );
}
