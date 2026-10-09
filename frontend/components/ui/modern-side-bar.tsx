"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutFromApp } from "@/app/lib/auth/client-sign-out";
import { navItemsForRole } from "@/app/lib/auth/role-home";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Home,
  LogOut,
  LogIn,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  // Search pairs with the Input import below — both belong to the commented-out
  // search box further down, not to the nav.
  Search,
  Activity,
  MessageSquareHeart,
  ClipboardList,
  Stethoscope,
  LayoutDashboard,
  LineChart,
  MapPin,
  FileText,
  Sparkles,
  Users,
  BookOpenText,
} from "lucide-react";
import { useT } from "@/app/components/i18n/locale-provider";

type IconComponent = React.ComponentType<{ className?: string }>;

interface NavigationItem {
  id: string;
  // Either final text, or the two wordings this app carries everywhere else.
  name: string | { en: string; hi: string };
  icon: IconComponent;
  href: string;
  badge?: string;
}

/**
 * The link list itself lives in `role-home`, next to the access table that guards those
 * same paths, so the sidebar cannot offer a page the role will be redirected away from.
 * Only the icons are resolved here — that module stays React-free for the edge proxy.
 */
const ICONS: Record<string, IconComponent> = {
  home: Home,
  chat: MessageSquareHeart,
  record: ClipboardList,
  activity: Activity,
  shop: Stethoscope,
  overview: LayoutDashboard,
  trends: LineChart,
  map: MapPin,
  reports: FileText,
  insights: Sparkles,
  team: Users,
};

const QUICK_GUIDES: Record<
  string,
  { title: { en: string; hi: string }; steps: { en: string; hi: string }[] }
> = {
  ASHA: {
    title: { en: "ASHA quick guide", hi: "ASHA ke liye chhota guide" },
    steps: [
      {
        en: "Open Reports and tap voice capture. Say the illness, case count, and village; review the filled form, then submit.",
        hi: "Reports kholkar voice capture dabayein. Bimari, case count aur gaon boliye; form check karke submit karein.",
      },
      {
        en: "Open Map to review reports and risk areas near your village.",
        hi: "Apne gaon ke reports aur risk wale ilaake dekhne ke liye Map kholiye.",
      },
      {
        en: "Use Trends to see how case counts change over time.",
        hi: "Samay ke saath case count ka badlav dekhne ke liye Trends kholiye.",
      },
    ],
  },
  MEDICAL: {
    title: { en: "Medical shop quick guide", hi: "Medical dukaan ke liye chhota guide" },
    steps: [
      {
        en: "Open My shop and keep medicine quantities and prices up to date.",
        hi: "My shop kholkar dawai ki quantity aur daam update rakhiye.",
      },
      {
        en: "When handing over an order, enter the customer's pickup code to confirm it.",
        hi: "Order dete waqt customer ka pickup code daalkar confirm karein.",
      },
      {
        en: "Open Insights to review medicine demand and local health signals.",
        hi: "Dawai ki demand aur ilaake ke health signals ke liye Insights kholiye.",
      },
    ],
  },
  USER: {
    title: { en: "Citizen quick guide", hi: "Nagrik ke liye chhota guide" },
    steps: [
      {
        en: "Tell Sehat Sahayak what symptoms you have to get general guidance.",
        hi: "Aam salah ke liye Sehat Sahayak ko apne symptoms batayein.",
      },
      {
        en: "If you need medicine, choose a nearby shop and place an order.",
        hi: "Dawai chahiye to paas ki dukaan chuniye aur order karein.",
      },
      {
        en: "Show the pickup code at the shop to collect your medicine.",
        hi: "Dawai lene ke liye dukaan par pickup code dikhayein.",
      },
    ],
  },
  ADMIN: {
    title: { en: "Admin quick guide", hi: "Admin ke liye chhota guide" },
    steps: [
      {
        en: "Review case totals and alerts on Overview.",
        hi: "Overview par case total aur alerts dekhein.",
      },
      {
        en: "Use Map filters to inspect a district, village, or illness.",
        hi: "Zila, gaon ya bimari dekhne ke liye Map filters istemal karein.",
      },
      {
        en: "Compare field reports and medicine movement in Insights.",
        hi: "Insights mein field reports aur dawai ki movement compare karein.",
      },
    ],
  },
};

export interface SidebarProps {
  className?: string;
  children?: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
}

function navigationForUser(role: string | undefined | null): NavigationItem[] {
  return navItemsForRole(role ?? undefined).map((item: { icon: string } & Omit<NavigationItem, "icon">) => ({
    ...item,
    icon: ICONS[item.icon] ?? Home,
  }));
}

function initialsFromName(name: string | null | undefined) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A nav name is either already-final text or an {en, hi} pair. */
function navLabel(name: any, t: (en: string, hi?: string) => string) {
  return typeof name === "string" ? name : t(name.en, name.hi);
}

export function Sidebar({ className = "", children, user }: SidebarProps) {
  const t = useT();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const role = user?.role ?? undefined;
  const quickGuide = role ? QUICK_GUIDES[role] : undefined;
  const navigationItems = navigationForUser(role);
  const ROLE_LABELS: Record<string, string> = {
    ADMIN: "Admin",
    ASHA: "ASHA",
    MEDICAL: "Medical",
    USER: "Nagrik",
  };
  const headerSubtitle = role && ROLE_LABELS[role] ? `JanSetu · ${ROLE_LABELS[role]}` : "JanSetu";

  const displayName = user?.name || "Guest";
  const subtitle = user?.email || (role ? role.replace(/_/g, " ") : "Not signed in");

  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  /**
   * A link is active on its own page, and on pages beneath it — unless a deeper link in
   * this same menu already covers those. Otherwise "Sehat Sahayak" (/sehat) would stay
   * lit while the user is on "Mera health record" (/sehat/profile), and both rows would
   * look selected at once. Derived from the menu rather than special-cased per path, so
   * adding a sub-page never needs this function touched again.
   */
  const isActiveHref = (href: string) => {
    if (href === "/") return normalizedPath === "/";
    if (normalizedPath === href) return true;

    const hasDeeperLink = navigationItems.some(
      (other) => other.href !== href && other.href.startsWith(`${href}/`)
    );
    if (hasDeeperLink) return false;

    return normalizedPath.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen w-full bg-canvas md:h-screen md:overflow-hidden">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={toggleSidebar}
        className="fixed top-5 left-5 z-50 border-line bg-card shadow-[0_8px_20px_rgba(18,32,25,0.12)] md:hidden"
        aria-label="Toggle sidebar"
      >
        {isOpen ? (
          <X className="h-5 w-5 text-ink-2" />
        ) : (
          <Menu className="h-5 w-5 text-ink-2" />
        )}
      </Button>

      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-night/50 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      <div
        className={`
          fixed top-0 left-0 z-40 flex h-full shrink-0 flex-col border-r border-line bg-card transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          ${isCollapsed ? "w-20" : "w-72"}
          md:sticky md:top-0 md:z-auto md:translate-x-0
          ${className}
        `}
      >
        <div
          className={`flex items-center border-b border-line-soft p-5 ${
            isCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!isCollapsed && (
            <div className="flex items-center space-x-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[linear-gradient(140deg,#2ea86f,#0e5c39)]">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12h4l2-7 4 14 2-7h6" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="js-display text-lg font-semibold text-ink">
                  JanSetu<span className="text-brand">.</span>
                </span>
                <span className="js-mono text-[8px] tracking-[0.16em] text-muted-2">
                  {headerSubtitle}
                </span>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="hidden shrink-0 rounded-md md:flex"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-2" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-muted-2" />
            )}
          </Button>
        </div>

        {/* {!isCollapsed && (
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 transform text-faint" />
              <Input
                type="search"
                placeholder="Search..."
                className="border-line bg-brand-tint-2 py-2 pr-4 pl-9"
              />
            </div>
          </div>
        )} */}

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveHref(item.href);

              return (
                <li key={item.id} className="relative">
                  <Link
                    href={item.href}
                    onClick={() => {
                      if (window.innerWidth < 768) setIsOpen(false);
                    }}
                    className={`
                      group flex w-full items-center rounded-full px-3.5 py-2.5 text-left transition-colors duration-200
                      ${active ? "bg-ink text-white" : "text-ink-2 hover:bg-brand-tint hover:text-brand-strong"}
                      ${isCollapsed ? "justify-center px-2" : "space-x-2.5"}
                    `}
                    title={isCollapsed ? navLabel(item.name, t) : undefined}
                  >
                    <div className="flex min-w-[24px] items-center justify-center">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? "text-neon" : "text-muted-2 group-hover:text-brand"
                        }`}
                      />
                    </div>

                    {!isCollapsed && (
                      <div className="flex w-full items-center justify-between">
                        <span className={`text-[13px] ${active ? "font-semibold" : "font-normal"}`}>
                          {navLabel(item.name, t)}
                        </span>
                        {item.badge && (
                          <span
                            className={`js-code rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              active ? "bg-white/15 text-white" : "bg-brand-tint text-brand-strong"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}

                    {isCollapsed && item.badge && (
                      <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-brand-tint">
                        <span className="js-code text-[10px] font-medium text-brand-strong">
                          {parseInt(item.badge, 10) > 9 ? "9+" : item.badge}
                        </span>
                      </div>
                    )}

                    {isCollapsed && (
                      <div className="invisible absolute left-full z-50 ml-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                        {navLabel(item.name, t)}
                        {item.badge && (
                          <span className="ml-1.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">
                            {item.badge}
                          </span>
                        )}
                        <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-ink" />
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {!isCollapsed && quickGuide ? (
          <aside className="mx-3 mb-3 rounded-[14px] border border-brand-line bg-brand-tint-2 p-3">
            <details open>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold text-ink">
                <BookOpenText className="h-4 w-4 shrink-0 text-brand" />
                {t(quickGuide.title.en, quickGuide.title.hi)}
              </summary>
              <ol className="mt-2.5 space-y-2.5">
                {quickGuide.steps.map((step, index) => (
                  <li key={step.en} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                    <span className="js-mono shrink-0 text-[10px] font-semibold text-brand">
                      {index + 1}.
                    </span>
                    <span>{t(step.en, step.hi)}</span>
                  </li>
                ))}
              </ol>
            </details>
          </aside>
        ) : null}

        <div className="mt-auto border-t border-line">
          <div
            className={`border-b border-line-soft ${isCollapsed ? "px-2 py-3" : "p-3"}`}
          >
            {!isCollapsed ? (
              <div className="flex items-center rounded-[14px] bg-brand-tint-2 px-3 py-2.5 transition-colors duration-200 hover:bg-brand-tint">
                <div className="js-display grid h-8 w-8 place-items-center rounded-full bg-brand-tint text-sm font-semibold text-brand">
                  {initialsFromName(displayName)}
                </div>
                <div className="ml-2.5 min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{displayName}</p>
                  <p className="truncate text-[11px] text-muted-2">{subtitle}</p>
                </div>
                {user && (
                  <div className="ml-2 h-2 w-2 rounded-full bg-brand" title="Online" />
                )}
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="relative">
                  <div className="js-display grid h-9 w-9 place-items-center rounded-full bg-brand-tint text-sm font-semibold text-brand">
                    {initialsFromName(displayName)}
                  </div>
                  {user && (
                    <div className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full border-2 border-white bg-brand" />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-3">
            {user ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => signOutFromApp()}
                title={isCollapsed ? "Sign out" : undefined}
                className={`group relative w-full ${
                  isCollapsed ? "justify-center px-2" : "justify-start"
                }`}
              >
                <LogOut className="text-muted-2 group-hover:text-brand" />
                {!isCollapsed && <span className="text-[13px] font-semibold">Sign out</span>}
                {isCollapsed && (
                  <div className="invisible absolute left-full z-50 ml-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                    Sign out
                    <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-ink" />
                  </div>
                )}
              </Button>
            ) : (
              <Button
                variant="ghost"
                asChild
                title={isCollapsed ? "Sign in" : undefined}
                className={`group relative w-full text-brand ${
                  isCollapsed ? "justify-center px-2" : "justify-start"
                }`}
              >
                <Link
                  href="/login"
                  onClick={() => {
                    if (window.innerWidth < 768) setIsOpen(false);
                  }}
                >
                  <LogIn className="text-brand group-hover:text-brand-strong" />
                  {!isCollapsed && <span className="text-[13px] font-semibold">Sign in</span>}
                  {isCollapsed && (
                    <div className="invisible absolute left-full z-50 ml-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                      Sign in
                      <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-ink" />
                    </div>
                  )}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1 pt-20 md:h-screen md:overflow-y-auto md:pt-0">
        {children}
      </div>
    </div>
  );
}
