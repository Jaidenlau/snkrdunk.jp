import Nav from "@/components/Nav";
import ReviewCockpit from "@/components/ReviewCockpit";
import { getReviewClaims } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const claims = await getReviewClaims();
  return (
    <>
      <Nav />
      <ReviewCockpit claims={claims} />
    </>
  );
}
