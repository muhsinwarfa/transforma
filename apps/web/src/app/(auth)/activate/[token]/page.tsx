import { validateActivationToken } from "@/lib/auth/tokens";
import { ActivateView } from "./ActivateView";

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state, email } = await validateActivationToken(token);
  return <ActivateView token={token} state={state} email={email} />;
}
