import "server-only";
import { pgQuery } from "@/lib/db/pg";

/**
 * PROC-01 provisioning — after the activation token is consumed, link the roster
 * member's account to the new auth user, activate it, and grant EXACTLY the
 * roster member's structural roles (no wider). Privileged server path (pg).
 */
export async function provisionAccount(rosterMemberId: string, authUserId: string): Promise<void> {
  await pgQuery(
    `update accounts a
        set auth_user_id = $2, status = 'active'
       from roster_members rm
      where rm.id = $1 and rm.account_id = a.id`,
    [rosterMemberId, authUserId],
  );
  await pgQuery(
    `insert into account_roles (account_id, role, company_id)
       select rm.account_id, unnest(rm.structural_roles), rm.company_id
         from roster_members rm
        where rm.id = $1 and rm.account_id is not null
     on conflict (account_id, role) do nothing`,
    [rosterMemberId],
  );
}
