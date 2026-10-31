import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">계획을 찾을 수 없어요</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">코드가 맞는지 확인해 주세요. 코드는 12자리(예: K7Q2-9XM4-LTPB)예요.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-teal-700 px-4 py-2 text-white">처음으로</Link>
    </main>
  );
}
