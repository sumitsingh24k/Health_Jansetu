"use client";

import { usePathname } from "next/navigation";
import { navItemsForRole } from "@/app/lib/auth/role-home";
import { ScreenHeader, TabNav } from "@/app/components/screen-ui";
import { useT } from "@/app/components/i18n/locale-provider";

/**
 * The opening of every workspace screen.
 *
 * The sub-tabs come from the same table that guards the routes, so a role never sees a
 * tab for a page it would be redirected away from — and a shop, whose nav includes its
 * own shop screen, still gets that entry here rather than a workspace-only strip that
 * would strand it.
 */

const ROLE_KICKER = {
  ADMIN: "Admin · all districts",
  ASHA: "ASHA workspace",
  MEDICAL: "Medical shop",
};

const ROLE_SUBTITLE = {
  ADMIN: "Create ASHA workers, approve registrations, and analyse any location's outbreak picture.",
  ASHA: "Submit ground reports for your assigned area with disease and GPS details.",
  MEDICAL: "Watch what is moving in your area — and what the two sides of the data say about it.",
};

export function WorkspaceHeader({ user, title, subtitle, actions }) {
  const pathname = usePathname();
  const items = navItemsForRole(user?.role).map((item) => ({
    href: item.href,
    label: item.name,
  }));

  const area = user?.location?.village
    ? `${user.location.village}, ${user.location.district}`
    : user?.location?.district || "";

  const kicker = [ROLE_KICKER[user?.role] || "Workspace", area].filter(Boolean).join(" · ");

  return (
    <div className="space-y-7">
      <ScreenHeader
        kicker={kicker}
        title={title}
        subtitle={subtitle ?? ROLE_SUBTITLE[user?.role]}
        actions={actions}
      />
      <TabNav items={items} activeHref={pathname} />
    </div>
  );
}

/** Role chip used where a row has to say which side of the data it came from. */
export function RoleBadge({ role }) {
  return (
    <span className="js-mono inline-flex items-center rounded-full border border-brand-line bg-brand-tint px-2.5 py-1 text-[9px] tracking-[0.14em] text-brand-strong">
      {role}
    </span>
  );
}
