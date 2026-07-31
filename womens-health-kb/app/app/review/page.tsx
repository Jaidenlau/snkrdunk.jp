import Nav from "@/components/Nav";
import AuditView from "@/components/AuditView";
import { getReviewClaims } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const claims = await getReviewClaims();
  return (
    <>
      <Nav />
      <AuditView claims={claims} />
    </>
  );
}
