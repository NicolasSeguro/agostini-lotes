import { redirect } from "next/navigation";

export default async function AsistentePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  redirect(`/?t=${params.t || "jacaranda"}`);
}
