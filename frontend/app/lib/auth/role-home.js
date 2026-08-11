/**
 * Where each role belongs, which areas it may open, and what its sidebar shows.
 *
 * Kept in one place because the redirect was previously duplicated across the proxy,
 * three layouts and the login form, and they had drifted: a resident hitting /admin was
 * sent to /workspace, which then sent them to /sehat — two redirects to reach a page
 * the first one already knew about.
 *
 * The nav used to drift from the guards in the other direction: every signed-in role got
 * the four workspace links, so a resident clicking "Map" was bounced back to /sehat. The
 * table below is now the only place that decides both, so a link can never point at a
 * page its own role is refused.
 */

/** Roles allowed inside the surveillance workspace. */
export const WORKSPACE_ROLES = ["ADMIN", "ASHA", "MEDICAL"];

/**
 * Roles allowed on the insights screen.
 *
 * This used to be ADMIN and MEDICAL only, back when the screen was a supply and stock
 * readiness view — an ASHA files cases and has no stock to move, so she was kept out.
 * The screen is now the two-sided correlation: what she reported, what the shops
 * actually sold, and where the two disagree. "Medicine is moving here and nobody filed
 * a report" is not a supply decision, it is her next day's work, so she belongs here.
 *
 * Who may look is separate from what they may look AT — every non-admin is pinned to
 * their own district by the route itself.
 */
export const INSIGHT_ROLES = ["ADMIN", "ASHA", "MEDICAL"];

/** Roles that see every area rather than only their own. */
export const ALL_AREA_ROLES = ["ADMIN"];

const HOME_BY_ROLE = {
  USER: "/sehat",
  MEDICAL: "/medical",
  ASHA: "/workspace",
  ADMIN: "/workspace",
};

/**
 * Who may open which area. Longest matching prefix wins, so /workspace/team can be
 * admin-only while /workspace stays open to all three surveillance roles.
 * A path not listed here is public (or an unguarded leaf like /login).
 */
const ROUTE_RULES = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/workspace/team", roles: ["ADMIN"] },
  { prefix: "/workspace/insights", roles: INSIGHT_ROLES },
  // Field reports are household survey data. A shop filing them would put guessed case
  // counts on the ASHA side of the very comparison the medicine data is checked against,
  // so the route is closed to MEDICAL rather than merely unlinked.
  { prefix: "/workspace/reports", roles: ["ADMIN", "ASHA"] },
  { prefix: "/workspace", roles: WORKSPACE_ROLES },
  { prefix: "/medical", roles: ["MEDICAL"] },
  { prefix: "/sehat", roles: ["USER"] },
];

/** The landing screen for a signed-in role; `/` for anyone unrecognised. */
export function homeForRole(role) {
  return HOME_BY_ROLE[role] || "/";
}

export function canUseWorkspace(role) {
  return WORKSPACE_ROLES.includes(role);
}

export function canSeeSupplyInsights(role) {
  return INSIGHT_ROLES.includes(role);
}

/** True when this role may look outside its own district. */
export function canSeeAllAreas(role) {
  return ALL_AREA_ROLES.includes(role);
}

function normalizePath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return "/";
  const withoutQuery = pathname.split(/[?#]/)[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

/** Every rule covering this path, most specific first. */
function matchingRules(pathname) {
  const path = normalizePath(pathname);
  return ROUTE_RULES.filter(
    (rule) => path === rule.prefix || path.startsWith(`${rule.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length);
}

/** True when `role` may open `pathname`. Unguarded paths are open to everyone. */
export function canAccessPath(role, pathname) {
  const [rule] = matchingRules(pathname);
  return !rule || rule.roles.includes(role);
}

/**
 * Where to send `role` when it cannot open `pathname`.
 *
 * Falls back to the nearest enclosing area the role *can* use — an ASHA opening
 * /workspace/team lands on /workspace, not all the way back at her home screen —
 * and only drops to the role home when nothing on the path is hers.
 */
export function fallbackPathFor(role, pathname) {
  for (const rule of matchingRules(pathname)) {
    if (rule.roles.includes(role)) return rule.prefix;
  }
  return homeForRole(role);
}

/**
 * A post-login destination that the role can actually open. A guarded page sends its own
 * path as the callbackUrl, so a resident who followed a stale /workspace/map link would
 * otherwise sign in only to be bounced again.
 */
export function safeDestination(role, callbackUrl) {
  const isInternal =
    typeof callbackUrl === "string" &&
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("//");

  if (!isInternal) return homeForRole(role);
  return canAccessPath(role, callbackUrl) ? callbackUrl : homeForRole(role);
}

/**
 * Sidebar entries per role. `icon` is a key the sidebar maps to a lucide component —
 * this module stays free of React so the proxy can import it on the edge.
 */
const WORKSPACE_NAV = [
  { id: "ws-overview", name: "Overview", icon: "overview", href: "/workspace" },
  { id: "ws-trends", name: "Trends", icon: "trends", href: "/workspace/trends" },
  { id: "ws-map", name: "Map", icon: "map", href: "/workspace/map" },
  { id: "ws-reports", name: "Reports", icon: "reports", href: "/workspace/reports" },
  { id: "ws-insights", name: "Insights", icon: "insights", href: "/workspace/insights" },
  { id: "ws-team", name: "Team", icon: "team", href: "/workspace/team" },
];

const NAV_BY_ROLE = {
  USER: [
    { id: "sehat", name: "Sehat Sahayak", icon: "chat", href: "/sehat" },
    { id: "record", name: { en: "My health record", hi: "Mera health record" }, icon: "record", href: "/sehat/profile" },
    { id: "area", name: { en: "Area status", hi: "Ilaake ki halat" }, icon: "activity", href: "/" },
  ],
  // A shop's own data is its shelf, not a survey form. Overview and Reports were on
  // this list, and both were the wrong screen for a pharmacist: Overview totals up
  // ASHA caseloads, and Reports asks how many households were visited — a question a
  // medical shop cannot answer. Not one shop ever filed one. What a shop actually
  // contributes now arrives on its own, from stock movement and confirmed pickups.
  MEDICAL: [
    { id: "shop", name: { en: "My shop", hi: "Meri dukaan" }, icon: "shop", href: "/medical" },
    { id: "ws-trends", name: "Trends", icon: "trends", href: "/workspace/trends" },
    { id: "ws-map", name: "Map", icon: "map", href: "/workspace/map" },
    { id: "ws-insights", name: "Insights", icon: "insights", href: "/workspace/insights" },
  ],
  ASHA: WORKSPACE_NAV,
  // Admin gets the workspace and nothing else. /admin, /admin/notifications,
  // /admin/settings and /admin/profile were listed here for one revision because the
  // routes existed and nothing linked to them — but all four are placeholder pages with
  // a paragraph of text and zero data behind them. A nav entry that opens an empty page
  // costs an admin a click and some trust; "the route exists" is not a reason to ship it.
  ADMIN: WORKSPACE_NAV,
};

const GUEST_NAV = [
  { id: "portal", name: "Home", icon: "home", href: "/" },
  { id: "reg-user", name: { en: "Citizen register", hi: "Aam nagrik register" }, icon: "chat", href: "/register/user" },
  { id: "reg-asha", name: "ASHA register", icon: "team", href: "/register/asha" },
  { id: "reg-medical", name: "Medical register", icon: "shop", href: "/register/medical" },
];

/**
 * The sidebar links for a role, filtered through the same access table the proxy and the
 * layouts use — a link that would redirect is never rendered.
 */
export function navItemsForRole(role) {
  if (!role) return GUEST_NAV;
  const items = NAV_BY_ROLE[role] || [];
  return items.filter((item) => canAccessPath(role, item.href));
}
