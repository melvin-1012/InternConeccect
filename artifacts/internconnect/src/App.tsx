import { type ReactNode, createContext, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  getGetMyProfileQueryKey, getListMyApplicationsQueryKey, getListSavedOpportunitiesQueryKey,
  getListMyNotificationsQueryKey, getGetRecruiterCompanyQueryKey,
  getListOpportunityApplicantsQueryKey, getListPlacementDrivesQueryKey,
  getListPlacementCompaniesQueryKey, getListAdminUsersQueryKey,
  getListOpportunitiesQueryKey,
  useHealthCheck, useGetPublicStats, useListOpportunities, useGetOpportunity, useGetDashboard, useGetMyProfile,
  useUpdateMyProfile, useListMyApplications, useApplyToOpportunity, useListSavedOpportunities,
  useSaveOpportunity, useUnsaveOpportunity, useGetRecruiterCompany, useUpdateRecruiterCompany,
  useListOpportunityApplicants, useUpdateApplicationStage, useListMyInterviews, useListMyNotifications,
  useMarkNotificationRead, useListPlacementStudents, useListPlacementCompanies, useListPlacementDrives,
  useCreatePlacementDrive, useGetPlacementAnalytics, useListAdminUsers, useUpdateAdminUser,
  useListAuditEvents, useCreateOpportunity, useDeleteOpportunity, useUpdateOpportunity,
  useRequestUploadUrl, useCompleteMyResumeUpload, useScheduleInterview,
  useUpdateCompanyVerification,
} from '@workspace/api-client-react';
import type {
  Opportunity, Application, StudentProfileInput, CompanyInput, PlacementDriveInput,
  OpportunityInput, ApplicationStage, PlatformUser,
} from '@workspace/api-client-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness, Building2, CalendarDays,
  Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  Compass, FileText, GraduationCap, LayoutDashboard, Menu, Moon, MoreHorizontal,
  Plus, Search, Settings2, ShieldCheck, Sparkles, Sun, Users, X, Bookmark, MapPin,
  BarChart3, ClipboardList, CircleUserRound, Shield, CalendarCheck, Activity, ExternalLink,
  SlidersHorizontal, ArrowUpRightFromSquare, Layers3, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
type Role = 'student' | 'recruiter' | 'placement-officer' | 'administrator';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#5549df', colorForeground: '#18213d', colorMutedForeground: '#69738d',
    colorDanger: '#d84f5d', colorBackground: '#ffffff', colorInput: '#f7f8fc',
    colorInputForeground: '#18213d', colorNeutral: '#dce0ec', fontFamily: 'DM Sans',
    borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#18213d] font-bold', headerSubtitle: 'text-[#69738d]',
    socialButtonsBlockButtonText: 'text-[#18213d] font-semibold', formFieldLabel: 'text-[#18213d] font-semibold',
    footerActionLink: 'text-[#5549df] font-semibold', footerActionText: 'text-[#69738d]',
    dividerText: 'text-[#69738d]', identityPreviewEditButton: 'text-[#5549df]',
    formFieldSuccessText: 'text-emerald-700', alertText: 'text-rose-700',
    logoBox: 'rounded-xl overflow-hidden', logoImage: 'object-contain',
    socialButtonsBlockButton: 'rounded-xl border-[#dce0ec]',
    formButtonPrimary: 'rounded-xl bg-[#5549df] hover:bg-[#4338ca]',
    formFieldInput: 'rounded-xl border-[#dce0ec] bg-[#f7f8fc]',
    footerAction: 'border-0', dividerLine: 'bg-[#e6e8f0]', alert: 'rounded-xl',
    otpCodeFieldInput: 'rounded-lg border-[#dce0ec]', formFieldRow: 'gap-2', main: 'gap-5',
  },
};

const RoleContext = createContext<{ role: Role; setRole: (r: Role) => void }>({ role: 'student', setRole: () => undefined });
const roles: { id: Role; label: string; short: string }[] = [
  { id: 'student', label: 'Student', short: 'ST' },
  { id: 'recruiter', label: 'Recruiter', short: 'RC' },
  { id: 'placement-officer', label: 'Placement officer', short: 'PO' },
  { id: 'administrator', label: 'Administrator', short: 'AD' },
];
const roleHome: Record<Role, string> = { student: '/dashboard/student', recruiter: '/dashboard/recruiter', 'placement-officer': '/dashboard/placement-officer', administrator: '/dashboard/administrator' };

function Logo({ inverse = false }: { inverse?: boolean }) {
  return <span className={`brand-lockup ${inverse ? 'brand-inverse' : ''}`}><span className="brand-mark"><Layers3 size={18} strokeWidth={2.4} /></span><span>intern<span className="brand-accent">connect</span></span></span>;
}
function BrandAnchor({ href = '/' }: { href?: string }) {
  return <Link href={href} className="inline-flex" data-testid="link-brand"><Logo /></Link>;
}
function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => { setDark(v => { document.documentElement.classList.toggle('dark', !v); return !v; }); };
  return <button className="icon-button" onClick={toggle} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} data-testid="button-theme-toggle">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>;
}
function useRole() { return useContext(RoleContext); }
function AppLink({ href, children, className = '', ...props }: { href: string; children: ReactNode; className?: string; [key: string]: any }) {
  return <Link href={href} className={className} data-testid={props['data-testid'] || `link-${href.replace(/[/:]/g, '-')}`} {...props}>{children}</Link>;
}
function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'violet' | 'blue' }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3" aria-label="Loading"><Skeleton className="h-10 w-full rounded-xl" />{Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-[78px] w-full rounded-xl" />)}</div>;
}
function QueryError({ retry }: { retry: () => void }) {
  return <div className="state-card"><span className="state-icon"><CircleHelp size={21} /></span><h3>We couldn’t load this just now</h3><p>Give it another try. Your work is safe.</p><Button variant="outline" onClick={retry} data-testid="button-retry">Try again</Button></div>;
}
function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="state-card"><span className="state-icon"><Sparkles size={21} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}
function PageTitle({ eyebrow, title, detail, actions }: { eyebrow?: string; title: string; detail?: string; actions?: ReactNode }) {
  return <header className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}
function SectionHeading({ title, caption, href, linkText = 'View all' }: { title: string; caption?: string; href?: string; linkText?: string }) {
  return <div className="section-heading"><div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>{href && <AppLink href={href} className="text-link">{linkText}<ArrowRight size={15} /></AppLink>}</div>;
}
function AppButtonLink({ href, children, variant = 'default' }: { href: string; children: ReactNode; variant?: 'default' | 'outline' | 'ghost' }) {
  return <Button asChild variant={variant}><Link href={href} data-testid={`link-${href.replace(/[/:]/g, '-')}`}>{children}</Link></Button>;
}
function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <header className="public-header"><BrandAnchor /><nav className="public-nav"><AppLink href="/opportunities">Explore roles</AppLink><a href="#how-it-works">How it works</a><a href="#for-universities">For universities</a></nav><div className="public-actions"><ThemeToggle /><AppButtonLink href="/sign-in" variant="ghost">Sign in</AppButtonLink><AppButtonLink href="/sign-up">Create account<ArrowRight size={15} /></AppButtonLink><button className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)} data-testid="button-mobile-menu"><Menu size={20} /></button></div>{mobileOpen && <nav className="public-mobile-nav"><AppLink href="/opportunities">Explore roles</AppLink><a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a><a href="#for-universities" onClick={() => setMobileOpen(false)}>For universities</a><AppLink href="/sign-in">Sign in</AppLink></nav>}</header>;
}
function LandingPage() {
  const stats = useGetPublicStats();
  return <div className="landing-page">
    <PublicHeader />
    <main>
      <section className="hero hero-grid">
        <div className="hero-copy page-enter">
          <div className="hero-kicker"><span className="pulse-dot" /> THE CAMPUS-TO-CAREER NETWORK</div>
          <h1>Your next chapter<br /><span>starts here.</span></h1>
          <p>One considered place for students to find their first great role, and for the people who make those opportunities happen.</p>
          <div className="hero-actions"><AppButtonLink href="/opportunities">Find your opportunity<ArrowRight size={16} /></AppButtonLink><AppButtonLink href="/sign-up" variant="outline">Build your profile</AppButtonLink></div>
          <div className="hero-proof"><div className="proof-avatars"><i>AM</i><i>JL</i><i>RK</i><i>+</i></div><span>Built around the people behind every placement.</span></div>
        </div>
        <div className="hero-visual" aria-label="Placement progress preview">
          <div className="visual-orbit orbit-one"></div><div className="visual-orbit orbit-two"></div>
          <div className="visual-core"><span className="visual-logo"><Layers3 size={29} /></span><span className="mono">CAREER GRAPH / 01</span></div>
          <div className="floating-card float-role"><span className="float-icon violet"><BriefcaseBusiness size={15} /></span><div><strong>PROFILE SIGNAL</strong><small>Skills · projects · direction</small></div><span className="match">READY</span></div>
          <div className="floating-card float-interview"><span className="float-icon blue"><CalendarCheck size={15} /></span><div><small>YOUR NEXT STEP</small><strong>Application progress</strong></div></div>
          <div className="floating-card float-signal"><span className="signal-bars"><i/><i/><i/><i/><i/></span><div><strong>Momentum,</strong><small>in one clear view.</small></div></div>
          <div className="visual-caption"><span>THE THREAD BETWEEN TALENT & OPPORTUNITY</span><span>01—04</span></div>
        </div>
      </section>
      <section className="metric-band">
        <div className="metric-intro"><span className="eyebrow">A NETWORK THAT MOVES</span><h2>Good outcomes<br />aren’t accidental.</h2></div>
        {stats.isLoading ? <div className="metrics-loading"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div> : stats.isError ? <div className="metrics-error"><span>Platform figures are temporarily unavailable.</span><button onClick={() => stats.refetch()}>Retry</button></div> : <div className="metric-values">
          {[['students', 'students'], ['companies', 'hiring partners'], ['placements', 'successful placements']].map(([key, label]) => <div className="metric" key={key}><strong className="stat-number" data-testid={`metric-${key}`}>{Number(stats.data?.[key as keyof typeof stats.data] ?? 0).toLocaleString()}</strong><span>{label}</span></div>)}
        </div>}
        <div className="metric-aside"><span className="metric-seal"><ShieldCheck size={22} /></span><p>Verified companies.<br />University-aware hiring.</p></div>
      </section>
      <section className="story-section" id="how-it-works">
        <div className="story-heading"><span className="eyebrow">A BETTER KIND OF HANDOFF</span><h2>Less chasing.<br /><em>More forward.</em></h2><p>Every application has a person, a timeline, and a next step. InternConnect keeps the thread intact.</p></div>
        <div className="story-steps">
          {[['01', 'A profile with a pulse', 'Give hiring teams the context behind your grades: work, projects, strengths, and where you want to go.', CircleUserRound], ['02', 'Opportunity, in focus', 'Search roles shaped around your discipline, eligibility, and real placement deadlines.', Compass], ['03', 'A process you can trust', 'Know what is moving, what is next, and where a conversation is headed.', Activity]].map(([number, title, description, Icon]: any) => <article className="story-step" key={number}><div className="step-top"><span>{number}</span><Icon size={21} /></div><h3>{title}</h3><p>{description}</p><div className="step-rule" /></article>)}
        </div>
      </section>
      <section className="role-band" id="for-universities"><div><span className="eyebrow">DEMO WORKSPACES · SIMULATED, NOT SECURE OR PERSISTENT</span><h2>For every side of<br />the first opportunity.</h2></div><div className="role-links">
        {roles.map((r, i) => <AppLink key={r.id} href={roleHome[r.id]} className="role-link"><span className="role-index">0{i + 1}</span><span><strong>{r.label}</strong><small>{['Find a role that fits your next step', 'Build a thoughtful talent pipeline', 'Coordinate outcomes across campus', 'Keep the platform accountable'][i]}</small></span><ArrowUpRight size={18} /></AppLink>)}
      </div></section>
      <section className="landing-cta"><div className="cta-glow" /><div className="cta-copy"><span className="eyebrow">THE NEXT MOVE IS YOURS</span><h2>Make your next step<br /><span>count.</span></h2></div><div className="cta-action"><p>Start with a profile. Find your people. Let the work speak for itself.</p><AppButtonLink href="/sign-up">Join InternConnect<ArrowRight size={16} /></AppButtonLink><small>Already with us? <AppLink href="/sign-in">Sign in</AppLink></small></div></section>
      <footer className="public-footer"><BrandAnchor /><span>Built for the moment between learning and what’s next.</span><div><AppLink href="/opportunities">Opportunities</AppLink><AppLink href="/settings">Settings</AppLink><span>© 2025 InternConnect</span></div></footer>
    </main>
  </div>;
}

const studentLinks = [
  { label: 'Overview', href: '/dashboard/student', icon: LayoutDashboard },
  { label: 'Discover roles', href: '/opportunities', icon: Compass },
  { label: 'My applications', href: '/student/applications', icon: ClipboardList },
  { label: 'Saved roles', href: '/student/saved', icon: Bookmark },
  { label: 'Interviews', href: '/student/interviews', icon: CalendarCheck },
  { label: 'Notifications', href: '/student/notifications', icon: Bell },
  { label: 'My profile', href: '/student/profile', icon: CircleUserRound },
];
const recruiterLinks = [
  { label: 'Overview', href: '/dashboard/recruiter', icon: LayoutDashboard },
  { label: 'Company profile', href: '/recruiter/company', icon: Building2 },
  { label: 'Job openings', href: '/recruiter/jobs', icon: BriefcaseBusiness },
  { label: 'Applicants', href: '/recruiter/applicants', icon: Users },
];
const placementLinks = [
  { label: 'Overview', href: '/dashboard/placement-officer', icon: LayoutDashboard },
  { label: 'Students', href: '/placement/students', icon: GraduationCap },
  { label: 'Companies', href: '/placement/companies', icon: Building2 },
  { label: 'Placement drives', href: '/placement/drives', icon: CalendarDays },
  { label: 'Analytics', href: '/placement/analytics', icon: BarChart3 },
];
const adminLinks = [
  { label: 'Overview', href: '/dashboard/administrator', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Audit log', href: '/admin/audit', icon: Shield },
];
function linksFor(role: Role) { return role === 'student' ? studentLinks : role === 'recruiter' ? recruiterLinks : role === 'placement-officer' ? placementLinks : adminLinks; }
function RolePicker({ compact = false }: { compact?: boolean }) {
  const { role, setRole } = useRole();
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  return <label className={`role-picker ${compact ? 'role-picker-compact' : ''}`}><span className="role-avatar">{roles.find(r => r.id === role)?.short}</span><span className="role-picker-copy"><strong>{roles.find(r => r.id === role)?.label}</strong><small>DEMO PERSONA · SIMULATED</small></span><ChevronDown size={15} /><select aria-label="Choose a demo persona" value={role} onChange={e => { const next = e.target.value as Role; setRole(next); client.clear(); setLocation(roleHome[next]); }} data-testid="select-demo-role">{roles.map(r => <option value={r.id} key={r.id}>{r.label} — demo persona</option>)}</select></label>;
}
function Sidebar({ path, close }: { path: string; close?: () => void }) {
  const { role } = useRole();
  const health = useHealthCheck();
  return <aside className="app-sidebar"><div className="sidebar-brand"><BrandAnchor href={roleHome[role]} /><button className="icon-button sidebar-close" onClick={close} aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button></div>
    <RolePicker />
    <div className="sidebar-caption">WORKSPACE</div>
    <nav className="side-nav">{linksFor(role).map(({ label, href, icon: Icon }) => {
      const active = href === path || (href !== '/dashboard/student' && href !== '/dashboard/recruiter' && href !== '/dashboard/placement-officer' && href !== '/dashboard/administrator' && path.startsWith(href));
      return <Link href={href} key={href} onClick={close} className={`sidebar-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={`nav-${href.replace(/[/:]/g, '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Notifications' && <span className="nav-dot" />}</Link>;
    })}</nav>
    <div className="sidebar-spacer" />
    <div className="sidebar-help"><div className="help-mark"><CircleHelp size={17} /></div><strong>Here to help</strong><p>Questions about your next step?</p><button onClick={() => window.alert('Support details are managed by your university placement team.')} data-testid="button-contact-support">Contact support<ArrowUpRight size={13} /></button></div>
    <div className="sidebar-footer"><span className={`footer-status ${health.isError ? 'footer-offline' : ''}`} data-testid="status-api-connection"><i />{health.isLoading ? 'Connecting to platform' : health.isError ? 'Connection unavailable' : 'Platform connected'}</span><Link href="/settings" className="sidebar-link"><Settings2 size={16} /> Settings</Link></div>
  </aside>;
}
function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role } = useRole();
  const appRoute = path !== '/' && !path.startsWith('/sign-in') && !path.startsWith('/sign-up');
  if (!appRoute) return <>{children}</>;
  const pageName = linksFor(role).find(l => l.href === path)?.label || (path.startsWith('/opportunities/') ? 'Opportunity details' : path.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Workspace');
  return <div className="app-shell">
    <Sidebar path={path} close={() => setMobileOpen(false)} />
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} data-testid="button-navigation-scrim" />}
    <div className="app-main"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-open" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{pageName}</strong></div></div><div className="topbar-actions"><div className="topbar-search"><Search size={15} /><span>Search anything</span><kbd>⌘ K</kbd></div><ThemeToggle /><Link className="icon-button notification-button" href="/student/notifications" aria-label="Notifications" data-testid="link-notifications"><Bell size={17} /><i /></Link><div className="user-mini"><span className="user-initials">IC</span><span className="user-name"><strong>Workspace</strong><small>{roles.find(r => r.id === role)?.label}</small></span><ChevronDown size={14} /></div></div></header>
      <div className="mobile-persona"><RolePicker compact /></div>
      <main className="page-content page-enter">{children}</main>
      <footer className="app-footer"><span>InternConnect <i>·</i> Campus to career, thoughtfully connected.</span><span><Layers3 size={13} /> Connected workspace</span></footer>
    </div>
  </div>;
}
function StatCard({ label, value, change, icon: Icon, trend = 'up' }: { label: string; value: ReactNode; change?: string; icon: any; trend?: 'up' | 'down' }) {
  return <Card className="stat-card"><CardContent className="stat-card-body"><div className="stat-card-top"><span>{label}</span><span className="stat-icon"><Icon size={17} /></span></div><div className="stat-card-value"><strong className="stat-number">{value}</strong>{change && <span className={`stat-change ${trend}`}><ArrowUpRight size={12} />{change}</span>}</div><span className="stat-period">Compared with last term</span></CardContent></Card>;
}
function DashboardPage({ role }: { role: Role }) {
  const query = useGetDashboard(role);
  const { setRole } = useRole();
  const roleName = roles.find(r => r.id === role)?.label;
  const d = query.data;
  return <div className="page-wrap">
    <PageTitle eyebrow={`YOUR ${roleName?.toUpperCase()} DESK`} title={role === 'student' ? 'Make today count.' : role === 'recruiter' ? 'Hiring, in good order.' : role === 'placement-officer' ? 'See the whole picture.' : 'The platform, at a glance.'} detail={d?.sampleData ? 'An operations snapshot from the connected platform.' : 'Your work and next steps, brought into focus.'} actions={<div className="dashboard-date"><span className="live-dot" /> LIVE OVERVIEW</div>} />
    {query.isLoading ? <div className="stats-grid">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div> : query.isError ? <QueryError retry={() => query.refetch()} /> : <>
      <div className="stats-grid">{d?.stats?.map((s, i) => <StatCard key={s.label} label={s.label} value={`${s.value.toLocaleString()}${s.suffix || ''}`} change={s.change} icon={[BriefcaseBusiness, Users, CalendarCheck, BarChart3][i % 4]} />)}</div>
      <div className="dashboard-content-grid">
        <Card className="chart-card"><CardHeader className="chart-header"><div><span className="eyebrow">ACTIVITY OVER TIME</span><CardTitle>Placement momentum</CardTitle></div><Badge variant="secondary">This term</Badge></CardHeader><CardContent>
          {d?.chart?.length ? <div className="bar-chart">{d.chart.map((point, i) => <div className="chart-column" key={`${point.label}-${i}`}><div className="chart-bars"><i style={{ height: `${Math.max(7, point.value / Math.max(...d.chart.map(p => p.value), 1) * 100)}%` }} /><i style={{ height: `${Math.max(5, (point.secondary ?? 0) / Math.max(...d.chart.map(p => Math.max(p.value, p.secondary ?? 0)), 1) * 100)}%` }} /></div><span>{point.label}</span></div>)}</div> : <EmptyState title="Your chart is taking shape" detail="Activity will appear here as work moves through the platform." />}
          <div className="chart-legend"><span><i className="legend-primary" />Applications</span><span><i className="legend-secondary" />Placements</span><span className="chart-note"><Activity size={13} /> Platform activity</span></div>
        </CardContent></Card>
        <Card className="activity-card"><CardHeader className="activity-header"><div><span className="eyebrow">RECENT SIGNALS</span><CardTitle>Latest activity</CardTitle></div><span className="activity-live"><i /> LIVE</span></CardHeader><CardContent className="activity-list">{d?.activity?.length ? d.activity.slice(0, 5).map((a, i) => <div className="activity-row" key={a.id}><span className={`activity-glyph glyph-${i % 4}`}>{i === 0 ? <Check size={15} /> : i === 1 ? <FileText size={15} /> : i === 2 ? <CalendarCheck size={15} /> : <BriefcaseBusiness size={15} />}</span><div className="activity-copy"><strong>{a.title}</strong><span>{a.detail}</span><small>{a.date}</small></div>{a.status && <StatusPill tone="violet">{a.status}</StatusPill>}</div>) : <EmptyState title="No recent activity" detail="When something moves, it will show here." />}</CardContent></Card>
      </div>
      {role === 'student' && <Card className="completion-card"><div className="completion-emblem"><Sparkles size={19} /></div><div className="completion-copy"><span className="eyebrow">YOUR PROFILE IS YOUR FIRST IMPRESSION</span><h3>Make your experience easier to find.</h3><p>A complete profile helps teams understand how you think, not just what you studied.</p></div><div className="completion-action"><span>Profile completeness</span><Progress value={d?.stats?.find(s => /profile/i.test(s.label))?.value || 0} /><AppButtonLink href="/student/profile" variant="outline">Review profile<ArrowRight size={14} /></AppButtonLink></div></Card>}
      {d?.sampleData && <div className="sample-note"><span className="sample-mark"><Layers3 size={14} /></span> This overview includes platform sample data. Your connected account data will appear here as it becomes available.</div>}
    </>}
    <div className="dashboard-shortcuts"><SectionHeading title="Move something forward" caption="Shortcuts into your workspace" /><div className="shortcut-list">{linksFor(role).slice(1).map(({ label, href, icon: Icon }) => <AppLink className="shortcut-link" href={href} key={href}><span><Icon size={17} /></span><strong>{label}</strong><ArrowUpRight size={15} /></AppLink>)}</div></div>
  </div>;
}

function OpportunityCard({ item, saved = false, onSave, saving = false }: { item: Opportunity; saved?: boolean; onSave?: (id: string) => void; saving?: boolean }) {
  return <article className="opportunity-card" data-testid={`card-opportunity-${item.id}`}><div className="opportunity-logo">{item.companyLogo ? <img src={item.companyLogo} alt="" /> : <span>{item.company?.slice(0, 2)?.toUpperCase() || 'IC'}</span>}</div><div className="opportunity-main"><div className="opportunity-overline"><span>{item.company}</span>{item.verified && <span className="verified-mark"><ShieldCheck size={13} /> Verified</span>}</div><a href={`/opportunities/${item.id}`} className="opportunity-title" data-testid={`link-opportunity-${item.id}`}>{item.title}</a><div className="opportunity-meta"><span><MapPin size={13} />{item.location}</span><span><BriefcaseBusiness size={13} />{item.mode}</span><span><Clock3 size={13} />{item.type}</span></div><div className="skill-chips">{item.skills?.slice(0, 4).map(skill => <span key={skill}>{skill}</span>)}</div></div><div className="opportunity-aside">{typeof item.matchScore === 'number' && <span className="match-score"><strong>{item.matchScore}%</strong><small>match</small></span>}<strong className="stipend">{item.stipend ? `₹${item.stipend.toLocaleString()}` : 'Compensation shared'}</strong><small>per month</small><span className="deadline-label">Apply by {item.deadline}</span><div className="opportunity-actions"><a href={`/opportunities/${item.id}`} className="text-link" data-testid={`link-details-${item.id}`}>View role<ArrowRight size={14} /></a>{onSave && <button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={() => onSave(item.id)} disabled={saving} aria-label={saved ? 'Remove from saved roles' : 'Save role'} data-testid={`button-save-${item.id}`}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button>}</div></div></article>;
}
function OpportunitiesPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [mode, setMode] = useState('all');
  const [sort, setSort] = useState<'newest' | 'deadline' | 'stipend' | 'relevance'>('newest');
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ search: search || undefined, type: type === 'all' ? undefined : type as 'internship' | 'full-time', mode: mode === 'all' ? undefined : mode as 'onsite' | 'hybrid' | 'remote', sort, page, pageSize: 10 }), [search, type, mode, sort, page]);
  const query = useListOpportunities(params);
  const savedQuery = useListSavedOpportunities();
  const save = useSaveOpportunity();
  const unsave = useUnsaveOpportunity();
  const client = useQueryClient();
  const savedItems = Array.isArray(savedQuery.data) ? savedQuery.data : [];
  const savedIds = new Set(savedItems.map((item: any) => typeof item === 'string' ? item : item.id));
  const toggleSave = (id: string) => (savedIds.has(id) ? unsave.mutate({ id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListSavedOpportunitiesQueryKey() }) }) : save.mutate({ id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListSavedOpportunitiesQueryKey() }) }));
  const pageData = query.data;
  return <div className="page-wrap"><PageTitle eyebrow="OPPORTUNITY EXCHANGE" title="Find the work that fits." detail="Considered roles, matched to the things you’re good at and the direction you want to grow." actions={<span className="exchange-count"><span className="live-dot" /> {pageData?.total ?? '—'} OPEN ROLES</span>} />
    <div className="opportunity-search-panel"><label className="search-field"><Search size={18} /><Input placeholder="Role, skill, company or keyword" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} data-testid="input-search-opportunities" /><kbd>⌘ K</kbd></label><div className="filter-row"><span className="filter-label"><SlidersHorizontal size={15} /> Refine</span><Select value={type} onValueChange={setType}><SelectTrigger className="filter-select" data-testid="select-opportunity-type"><SelectValue placeholder="Role type" /></SelectTrigger><SelectContent><SelectItem value="all">All role types</SelectItem><SelectItem value="internship">Internship</SelectItem><SelectItem value="full-time">Full time</SelectItem></SelectContent></Select><Select value={mode} onValueChange={setMode}><SelectTrigger className="filter-select" data-testid="select-opportunity-mode"><SelectValue placeholder="Work mode" /></SelectTrigger><SelectContent><SelectItem value="all">Any work mode</SelectItem><SelectItem value="remote">Remote</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem><SelectItem value="onsite">On-site</SelectItem></SelectContent></Select><AppLink href="/student/saved" className="text-link saved-filter"><Bookmark size={14} /> Saved roles</AppLink></div></div>
    <div className="results-head"><div><strong>{pageData?.total ?? '—'} opportunities</strong><span> matched to your search</span></div><div className="results-sort"><span>Sort</span><Select value={sort} onValueChange={value => { setSort(value as typeof sort); setPage(1); }}><SelectTrigger className="sort-select" data-testid="select-opportunity-sort"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest</SelectItem><SelectItem value="relevance">Best match</SelectItem><SelectItem value="deadline">Deadline</SelectItem><SelectItem value="stipend">Stipend</SelectItem></SelectContent></Select></div></div>
    {query.isLoading ? <LoadingRows /> : query.isError ? <QueryError retry={() => query.refetch()} /> : pageData?.items?.length ? <><div className="opportunity-list">{pageData.items.map(item => <OpportunityCard key={item.id} item={item} saved={savedIds.has(item.id)} onSave={toggleSave} saving={save.isPending || unsave.isPending} />)}</div><div className="pagination"><span>Page {page} of {Math.max(1, Math.ceil((pageData.total || 0) / (pageData.pageSize || 10)))}</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-previous-page"><ChevronLeft size={15} /> Previous</Button><Button variant="outline" size="sm" disabled={page * (pageData.pageSize || 10) >= pageData.total} onClick={() => setPage(page + 1)} data-testid="button-next-page">Next <ChevronRight size={15} /></Button></div></div></> : <EmptyState title="Nothing in this search yet" detail="Try another keyword or loosen one of your filters." action={<Button variant="outline" onClick={() => { setSearch(''); setType('all'); setMode('all'); }} data-testid="button-clear-filters">Clear filters</Button>} />}
  </div>;
}
function OpportunityDetailPage({ id }: { id: string }) {
  const query = useGetOpportunity(id);
  const apply = useApplyToOpportunity();
  const [note, setNote] = useState('');
  const client = useQueryClient();
  const item = query.data;
  if (query.isLoading) return <div className="page-wrap"><Skeleton className="h-64 rounded-3xl" /><LoadingRows count={3} /></div>;
  if (query.isError || !item) return <div className="page-wrap"><QueryError retry={() => query.refetch()} /></div>;
  return <div className="page-wrap"><AppLink href="/opportunities" className="back-link"><ChevronLeft size={16} /> All opportunities</AppLink><div className="detail-hero"><div className="detail-company"><div className="opportunity-logo detail-logo">{item.companyLogo ? <img src={item.companyLogo} alt="" /> : item.company.slice(0, 2).toUpperCase()}</div><span>{item.company}{item.verified && <StatusPill tone="green"><ShieldCheck size={12} /> Verified partner</StatusPill>}</span></div><h1>{item.title}</h1><div className="detail-meta"><span><MapPin size={15} />{item.location}</span><span><BriefcaseBusiness size={15} />{item.mode}</span><span><Clock3 size={15} />{item.type}</span><span><CalendarDays size={15} />Deadline {item.deadline}</span></div><div className="detail-apply"><div><span className="eyebrow">MONTHLY COMPENSATION</span><strong>{item.stipend ? `₹${item.stipend.toLocaleString()}` : 'Shared during process'}</strong></div><Button onClick={() => apply.mutate({ id, data: { note: note || undefined } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListMyApplicationsQueryKey() }) })} disabled={apply.isPending} data-testid="button-apply-opportunity">{apply.isPending ? 'Sending application…' : 'Apply for this role'}<ArrowRight size={16} /></Button></div>{apply.isError && <p className="inline-error">Your application could not be submitted. Please try again.</p>}{apply.isSuccess && <p className="inline-success"><Check size={15} /> Application submitted successfully.</p>}</div>
    <div className="detail-layout"><div className="detail-body"><section className="detail-section"><h2>About the opportunity</h2><p>{item.description}</p></section>{item.responsibilities?.length ? <section className="detail-section"><h2>What you’ll work on</h2><ul>{item.responsibilities.map(x => <li key={x}>{x}</li>)}</ul></section> : null}{item.requirements?.length ? <section className="detail-section"><h2>What you’ll bring</h2><ul>{item.requirements.map(x => <li key={x}>{x}</li>)}</ul></section> : null}{item.benefits?.length ? <section className="detail-section"><h2>What’s included</h2><div className="skill-chips">{item.benefits.map(x => <span key={x}>{x}</span>)}</div></section> : null}</div><aside className="detail-aside"><Card><CardHeader><CardTitle>At a glance</CardTitle></CardHeader><CardContent className="detail-facts"><div><span>Discipline</span><strong>{item.department}</strong></div><div><span>Duration</span><strong>{item.duration || 'Not specified'}</strong></div><div><span>Eligibility</span><strong>{item.eligibility || 'See requirements'}</strong></div><div><span>Applicants</span><strong>{item.applicants ?? '—'}</strong></div><div><span>Skills</span><div className="skill-chips">{item.skills?.map(s => <span key={s}>{s}</span>)}</div></div></CardContent></Card><Card className="apply-note"><CardHeader><CardTitle>A note to the team</CardTitle></CardHeader><CardContent><p>Add a short note to introduce your application.</p><Textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="What makes this opportunity feel right for you?" data-testid="input-application-note" /><small>{note.length}/1000</small></CardContent></Card></aside></div>
  </div>;
}

function ResourceTable({ headers, rows, loading, error, retry, emptyTitle, emptyDetail }: { headers: string[]; rows: ReactNode[][]; loading: boolean; error: boolean; retry: () => void; emptyTitle: string; emptyDetail: string }) {
  if (loading) return <LoadingRows />;
  if (error) return <QueryError retry={retry} />;
  if (!rows.length) return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  return <div className="table-wrap"><table className="data-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} data-testid={`row-record-${i}`}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function ApplicationsPage() {
  const query = useListMyApplications();
  const rows = (query.data || []).map((a: Application) => [<strong key="title">{a.opportunityTitle}</strong>, a.company, a.appliedAt, <StatusPill key="stage" tone={a.stage === 'selected' ? 'green' : a.stage === 'rejected' ? 'red' : 'violet'}>{a.stage.replace(/-/g, ' ')}</StatusPill>, `${a.matchScore}%`]);
  return <div className="page-wrap"><PageTitle eyebrow="YOUR CAREER THREAD" title="Applications" detail="Every role you’ve raised your hand for, and where it stands." actions={<AppButtonLink href="/opportunities">Explore roles<ArrowRight size={15} /></AppButtonLink>} /><ResourceTable headers={['Opportunity', 'Company', 'Applied', 'Stage', 'Fit']} rows={rows} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} emptyTitle="Your next application starts here" emptyDetail="When you apply to a role, its progress will be tracked here." /></div>;
}
function SavedPage() {
  const query = useListSavedOpportunities();
  const unsave = useUnsaveOpportunity();
  const client = useQueryClient();
  const items = (query.data || []) as Opportunity[];
  return <div className="page-wrap"><PageTitle eyebrow="KEEP CLOSE" title="Saved roles" detail="A short list for roles worth coming back to." actions={<AppButtonLink href="/opportunities" variant="outline"><Compass size={15} /> Browse roles</AppButtonLink>} />{query.isLoading ? <LoadingRows /> : query.isError ? <QueryError retry={() => query.refetch()} /> : items.length ? <div className="opportunity-list">{items.map(item => <OpportunityCard key={item.id} item={item} saved onSave={id => unsave.mutate({ id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListSavedOpportunitiesQueryKey() }) })} saving={unsave.isPending} />)}</div> : <EmptyState title="A little room for possibility" detail="Save opportunities that catch your eye and they’ll be gathered here." action={<AppButtonLink href="/opportunities">Discover roles<ArrowRight size={15} /></AppButtonLink>} />}</div>;
}
function InterviewsPage() {
  const query = useListMyInterviews();
  return <div className="page-wrap"><PageTitle eyebrow="CONVERSATIONS AHEAD" title="Interviews" detail="Your confirmed conversations, with the details in one place." />{query.isLoading ? <LoadingRows /> : query.isError ? <QueryError retry={() => query.refetch()} /> : query.data?.length ? <div className="interview-grid">{query.data.map((interview: any) => <Card key={interview.id} className="interview-card"><CardContent><div className="interview-date"><CalendarCheck size={17} />{interview.scheduledAt}</div><h3>{interview.opportunityTitle}</h3><p>{interview.company}</p><div className="interview-rule" /><div className="interview-detail"><span>Format</span><strong>{interview.kind}</strong></div><div className="interview-detail"><span>Location</span><strong>{interview.location}</strong></div><div className="interview-detail"><span>Status</span><StatusPill tone="violet">{interview.status}</StatusPill></div></CardContent></Card>)}</div> : <EmptyState title="A little space before the conversation" detail="Interview details will appear here when a team schedules time with you." action={<AppButtonLink href="/student/applications" variant="outline">View applications</AppButtonLink>} />}</div>;
}
function NotificationsPage() {
  const query = useListMyNotifications();
  const mark = useMarkNotificationRead();
  const client = useQueryClient();
  const rows = (query.data || []).map((n: any) => <article className={`notification-row ${n.read ? '' : 'unread'}`} key={n.id} data-testid={`notification-${n.id}`}><span className="notification-icon"><Bell size={17} /></span><div><div className="notification-title">{n.title}{!n.read && <i />}</div><p>{n.message}</p><small>{n.createdAt}</small></div>{!n.read && <Button variant="ghost" size="sm" disabled={mark.isPending} onClick={() => mark.mutate({ id: n.id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }) })} data-testid={`button-mark-read-${n.id}`}><CheckCheck size={14} /> Mark read</Button>}</article>);
  return <div className="page-wrap"><PageTitle eyebrow="IN THE LOOP" title="Notifications" detail="A quiet place for updates that matter." />{query.isLoading ? <LoadingRows /> : query.isError ? <QueryError retry={() => query.refetch()} /> : rows.length ? <div className="notification-list">{rows}</div> : <EmptyState title="You’re all caught up" detail="Important updates about your applications and schedule will land here." />}</div>;
}

const profileSchema = z.object({
  name: z.string().min(2, 'Enter at least two characters'), department: z.string().min(1, 'Choose your department'),
  degree: z.string().min(1, 'Add your degree'), graduationYear: z.coerce.number().min(2020).max(2040),
  cgpa: z.coerce.number().min(0).max(10), backlogs: z.coerce.number().min(0),
  skillsText: z.string(), certificationsText: z.string(), projectsText: z.string(), achievementsText: z.string(),
  github: z.string(), linkedin: z.string(), portfolio: z.string(), preferencesText: z.string(),
});
type ProfileForm = z.infer<typeof profileSchema>;
function StudentProfilePage() {
  const query = useGetMyProfile();
  const update = useUpdateMyProfile();
  const client = useQueryClient();
  const profile = query.data;
  const profileValues = useMemo(() => profile ? { name: profile.name, department: profile.department, degree: profile.degree, graduationYear: profile.graduationYear, cgpa: profile.cgpa, backlogs: profile.backlogs, skillsText: profile.skills.join(', '), certificationsText: profile.certifications.join(', '), projectsText: profile.projects.join('\n'), achievementsText: profile.achievements.join('\n'), github: profile.github, linkedin: profile.linkedin, portfolio: profile.portfolio, preferencesText: profile.preferences.join(', ') } : undefined, [profile]);
  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: profileValues,
    defaultValues: { name: '', department: '', degree: '', graduationYear: 2026, cgpa: 0, backlogs: 0, skillsText: '', certificationsText: '', projectsText: '', achievementsText: '', github: '', linkedin: '', portfolio: '', preferencesText: '' },
  });
  const submit = (values: ProfileForm) => {
    const { skillsText, certificationsText, projectsText, achievementsText, preferencesText, ...base } = values;
    const data: StudentProfileInput = { ...base, skills: listValue(skillsText), certifications: listValue(certificationsText), projects: lineValue(projectsText), achievements: lineValue(achievementsText), preferences: listValue(preferencesText) };
    update.mutate({ data }, { onSuccess: result => client.setQueryData(getGetMyProfileQueryKey(), result) });
  };
  if (query.isLoading) return <div className="page-wrap"><Skeleton className="h-44 rounded-2xl" /><LoadingRows count={5} /></div>;
  if (query.isError) return <div className="page-wrap"><QueryError retry={() => query.refetch()} /></div>;
  const fields: [keyof ProfileForm, string, string][] = [['name', 'Full name', 'Your name'], ['department', 'Department', 'e.g. Computer science'], ['degree', 'Degree', 'e.g. B.Tech'], ['graduationYear', 'Graduation year', '2026'], ['cgpa', 'CGPA', '0.0 – 10.0'], ['backlogs', 'Active backlogs', '0'], ['skillsText', 'Skills', 'Separate with commas'], ['certificationsText', 'Certifications', 'Separate with commas'], ['projectsText', 'Projects', 'One per line'], ['achievementsText', 'Achievements', 'One per line'], ['github', 'GitHub profile', 'https://github.com/…'], ['linkedin', 'LinkedIn profile', 'https://linkedin.com/in/…'], ['portfolio', 'Portfolio', 'Your portfolio URL'], ['preferencesText', 'Role preferences', 'Separate with commas']];
  return <div className="page-wrap"><PageTitle eyebrow="YOUR WORK, IN CONTEXT" title="Student profile" detail="Give teams a clearer picture of the person behind the application." actions={<span className="profile-completion"><span>{profile?.completion ?? 0}% complete</span><Progress value={profile?.completion ?? 0} /></span>} />
    <div className="profile-hero-card"><div className="profile-avatar">{profile?.name?.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'ST'}</div><div><h2>{profile?.name}</h2><p>{profile?.degree} · {profile?.department} · Class of {profile?.graduationYear}</p><span><span className="online-mark" /> Profile visible to verified hiring teams</span></div><span className="profile-score"><strong>{profile?.completion ?? 0}%</strong><small>complete</small></span></div>
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="profile-form">
      <Card><CardHeader><span className="eyebrow">THE FOUNDATIONS</span><CardTitle>Academic profile</CardTitle></CardHeader><CardContent className="form-grid">{fields.slice(0, 6).map(([name, label, placeholder]) => <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input {...field} type={['graduationYear', 'cgpa', 'backlogs'].includes(name) ? 'number' : 'text'} step={name === 'cgpa' ? '.01' : '1'} placeholder={placeholder} data-testid={`input-profile-${name}`} /></FormControl><FormMessage /></FormItem>} />)}</CardContent></Card>
      <Card><CardHeader><span className="eyebrow">WHAT YOU BRING</span><CardTitle>Experience & strengths</CardTitle></CardHeader><CardContent className="form-grid">{fields.slice(6, 10).map(([name, label, placeholder]) => <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem className="form-span"><FormLabel>{label}</FormLabel><FormControl><Textarea {...field} placeholder={placeholder} data-testid={`input-profile-${name}`} /></FormControl><FormMessage /></FormItem>} />)}</CardContent></Card>
      <Card><CardHeader><span className="eyebrow">OUT IN THE WORLD</span><CardTitle>Links & direction</CardTitle></CardHeader><CardContent className="form-grid">{fields.slice(10).map(([name, label, placeholder]) => <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input {...field} placeholder={placeholder} data-testid={`input-profile-${name}`} /></FormControl><FormMessage /></FormItem>} />)}</CardContent></Card>
      <ResumeUploader resumePath={profile?.resumePath} onComplete={() => client.invalidateQueries({ queryKey: getGetMyProfileQueryKey() })} />
      <div className="form-footer"><span>{update.isSuccess ? <span className="inline-success"><Check size={15} /> Profile saved.</span> : update.isError ? <span className="inline-error">We couldn’t save your changes. Try again.</span> : 'Your changes are visible to verified hiring teams.'}</span><Button type="submit" disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? 'Saving…' : 'Save profile'}<ArrowRight size={15} /></Button></div>
    </form></Form>
  </div>;
}
function listValue(text: string) { return text.split(',').map(s => s.trim()).filter(Boolean); }
function lineValue(text: string) { return text.split('\n').map(s => s.trim()).filter(Boolean); }

function ResumeUploader({ resumePath, onComplete }: { resumePath?: string | null; onComplete: () => void }) {
  const requestUpload = useRequestUploadUrl();
  const completeUpload = useCompleteMyResumeUpload();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setError('');
    setMessage('');
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const contentType = file.type || ({
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } as Record<string, string>)[extension];
    if (!['pdf', 'doc', 'docx'].includes(extension) || !contentType) {
      setError('Choose a PDF, DOC, or DOCX resume.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('The file must be 10 MB or smaller.');
      return;
    }

    setBusy(true);
    try {
      const upload = await requestUpload.mutateAsync({
        data: { name: file.name, size: file.size, contentType },
      });
      const uploaded = await fetch(upload.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!uploaded.ok) throw new Error('The file could not be uploaded to secure storage.');

      await completeUpload.mutateAsync({ data: { objectPath: upload.objectPath } });
      setMessage(`${file.name} is attached to your profile.`);
      onComplete();
    } catch {
      setError('The resume could not be saved. Check your connection and try again.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return <Card className="resume-card">
    <CardHeader><span className="eyebrow">YOUR APPLICATION MATERIALS</span><CardTitle>Resume</CardTitle></CardHeader>
    <CardContent>
      <p className="resume-privacy">Private file storage. Your resume is shared with hiring teams only when you apply.</p>
      {resumePath && <a className="resume-current" href={`/api/storage${resumePath}`} target="_blank" rel="noreferrer" data-testid="link-current-resume"><FileText size={16} /><span><strong>View current resume</strong><small>Opens in a new tab</small></span><ArrowUpRightFromSquare size={15} /></a>}
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={event => void handleFile(event.target.files?.[0])} data-testid="input-resume-file" />
      <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} data-testid="button-upload-resume"><Upload size={15} />{busy ? 'Uploading securely…' : resumePath ? 'Replace resume' : 'Upload a resume'}</Button>
      <span className="resume-upload-hint">PDF, DOC, or DOCX · Up to 10 MB</span>
      {message && <p className="inline-success"><Check size={15} />{message}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </CardContent>
  </Card>;
}

function CompanyPage() {
  const query = useGetRecruiterCompany();
  const update = useUpdateRecruiterCompany();
  const client = useQueryClient();
  const c = query.data;
  const [values, setValues] = useState<CompanyInput | null>(null);
  const input = values || (c ? { name: c.name, industry: c.industry, location: c.location, website: c.website, description: c.description } : { name: '', industry: '', location: '', website: '', description: '' });
  const set = (key: keyof CompanyInput, value: string) => setValues(v => ({ ...(v || input), [key]: value }));
  return <div className="page-wrap"><PageTitle eyebrow="YOUR EMPLOYER PROFILE" title="Company profile" detail="A clear company story helps the right people understand the work." />
    {query.isLoading ? <LoadingRows /> : query.isError ? <QueryError retry={() => query.refetch()} /> : <div className="company-layout"><Card className="company-summary"><CardContent><div className="company-monogram">{c?.name?.slice(0, 2).toUpperCase() || 'CO'}</div><span className="eyebrow">HIRING PARTNER</span><h2>{c?.name}</h2><p>{c?.industry}</p><div className="company-verify"><ShieldCheck size={15} />{c?.verified ? 'Verified company' : 'Verification pending'}</div><div className="company-summary-stats"><div><strong>{c?.openRoles ?? 0}</strong><span>Open roles</span></div><div><strong>{c?.location || '—'}</strong><span>Based in</span></div></div></CardContent></Card><Card><CardHeader><CardTitle>Company details</CardTitle></CardHeader><CardContent className="company-form">{[['name', 'Company name'], ['industry', 'Industry'], ['location', 'Location'], ['website', 'Website']].map(([key, label]) => <label key={key}>{label}<Input value={input[key as keyof CompanyInput]} onChange={e => set(key as keyof CompanyInput, e.target.value)} data-testid={`input-company-${key}`} /></label>)}<label className="form-span">Company overview<Textarea value={input.description} onChange={e => set('description', e.target.value)} data-testid="input-company-description" /></label><div className="form-footer form-span"><span>{update.isSuccess ? 'Company profile updated.' : update.isError ? 'Could not update profile. Try again.' : 'Your story appears on every job listing.'}</span><Button disabled={update.isPending || !c} onClick={() => update.mutate({ data: input }, { onSuccess: result => client.setQueryData(getGetRecruiterCompanyQueryKey(), result) })} data-testid="button-save-company">{update.isPending ? 'Saving…' : 'Save changes'}<ArrowRight size={15} /></Button></div></CardContent></Card></div>}
  </div>;
}

const jobSchema = z.object({ title: z.string().min(3), company: z.string().min(2), location: z.string().min(2), mode: z.enum(['onsite', 'hybrid', 'remote']), type: z.enum(['internship', 'full-time']), department: z.string().min(1), deadline: z.string().min(1), description: z.string().min(10), stipend: z.coerce.number().min(0), duration: z.string(), skillsText: z.string() });
type JobForm = z.infer<typeof jobSchema>;
function CreateJobDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const create = useCreateOpportunity();
  const form = useForm<JobForm>({ resolver: zodResolver(jobSchema), defaultValues: { title: '', company: '', location: '', mode: 'hybrid', type: 'internship', department: '', deadline: '', description: '', stipend: 0, duration: '', skillsText: '' } });
  const submit = (values: JobForm) => {
    const { skillsText, ...rest } = values;
    const data: OpportunityInput = { ...rest, skills: listValue(skillsText), status: 'published' };
    create.mutate({ data }, { onSuccess: () => { onCreated(); setOpen(false); form.reset(); } });
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button data-testid="button-create-job"><Plus size={16} /> Post an opening</Button></DialogTrigger><DialogContent className="dialog-scroll"><DialogHeader><DialogTitle>Post an opportunity</DialogTitle><DialogDescription>Introduce a role clearly, and the right people will find it.</DialogDescription></DialogHeader><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="dialog-form">
    {(['title', 'company', 'location', 'department', 'deadline', 'stipend', 'duration', 'skillsText', 'description'] as (keyof JobForm)[]).map(key => <FormField key={key} control={form.control} name={key} render={({ field }) => <FormItem className={key === 'description' ? 'form-span' : ''}><FormLabel>{({ title: 'Role title', company: 'Company', location: 'Location', department: 'Department', deadline: 'Apply by', stipend: 'Monthly stipend', duration: 'Duration', skillsText: 'Skills (comma separated)', description: 'Description' } as any)[key]}</FormLabel><FormControl>{key === 'description' ? <Textarea {...field} rows={4} data-testid={`input-job-${key}`} /> : <Input {...field} type={key === 'deadline' ? 'date' : key === 'stipend' ? 'number' : 'text'} data-testid={`input-job-${key}`} />}</FormControl><FormMessage /></FormItem>} />)}
    <FormField control={form.control} name="mode" render={({ field }) => <FormItem><FormLabel>Work mode</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-job-mode"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="onsite">On-site</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem><SelectItem value="remote">Remote</SelectItem></SelectContent></Select></FormItem>} />
    <FormField control={form.control} name="type" render={({ field }) => <FormItem><FormLabel>Role type</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-job-type"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="internship">Internship</SelectItem><SelectItem value="full-time">Full-time</SelectItem></SelectContent></Select></FormItem>} />
    {create.isError && <p className="inline-error form-span">Could not create the opening. Check the details and retry.</p>}<div className="dialog-footer form-span"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} data-testid="button-submit-job">{create.isPending ? 'Publishing…' : 'Publish opening'}<ArrowRight size={14} /></Button></div>
  </form></Form></DialogContent></Dialog>;
}
function RecruiterJobsPage() {
  const query = useListOpportunities({ page: 1, pageSize: 50 });
  const del = useDeleteOpportunity();
  const client = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const update = useUpdateOpportunity();
  return <div className="page-wrap"><PageTitle eyebrow="YOUR OPEN REQUISITIONS" title="Job openings" detail="Create a role, keep its status current, and follow the applicant pipeline." actions={<CreateJobDialog onCreated={() => client.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() })} />} />
    {query.isLoading ? <LoadingRows /> : query.isError ? <QueryError retry={() => query.refetch()} /> : query.data?.items?.length ? <div className="opportunity-list">{query.data.items.map(job => <article className="opportunity-card recruiter-job" key={job.id} data-testid={`card-job-${job.id}`}><div className="opportunity-logo"><BriefcaseBusiness size={19} /></div><div className="opportunity-main"><div className="opportunity-overline"><span>{job.company}</span><StatusPill tone={job.status === 'published' ? 'green' : 'amber'}>{job.status}</StatusPill></div><a href={`/opportunities/${job.id}`} className="opportunity-title">{job.title}</a><div className="opportunity-meta"><span><MapPin size={13} />{job.location}</span><span><Users size={13} />{job.applicants ?? 0} applicants</span><span><CalendarDays size={13} />Closes {job.deadline}</span></div></div><div className="recruiter-job-actions"><a href={`/recruiter/applicants?opportunityId=${job.id}`} className="text-link" data-testid={`link-applicants-${job.id}`}>Review applicants<ArrowRight size={14} /></a><Select value={job.status} onValueChange={status => update.mutate({ id: job.id, data: { status: status as any } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() }) })}><SelectTrigger className="job-status-select" data-testid={`select-job-status-${job.id}`}><SelectValue /></SelectTrigger><SelectContent>{['draft', 'published', 'closed', 'archived'].map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select><button className="quiet-action danger-action" onClick={() => setConfirmId(job.id)} aria-label="Archive role" data-testid={`button-archive-job-${job.id}`}><MoreHorizontal size={17} /></button>{confirmId === job.id && <div className="confirm-popover"><span>Archive this opening?</span><button onClick={() => del.mutate({ id: job.id }, { onSuccess: () => { setConfirmId(null); client.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() }); } })} disabled={del.isPending} data-testid="button-confirm-archive">{del.isPending ? 'Archiving…' : 'Confirm archive'}</button><button onClick={() => setConfirmId(null)} data-testid="button-cancel-archive">Cancel</button></div>}</div></article>)}</div> : <EmptyState title="Your first opening begins here" detail="Post a clear opportunity and start a thoughtful conversation with students." action={<CreateJobDialog onCreated={() => client.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() })} />} />}
  </div>;
}
function toIndiaDateTimeInput(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function InterviewScheduleDialog({ applicationId, onScheduled }: { applicationId: string; onScheduled: () => void }) {
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => toIndiaDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [kind, setKind] = useState('Interview');
  const [location, setLocation] = useState('Online');
  const schedule = useScheduleInterview();

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline" data-testid={`button-schedule-interview-${applicationId}`}><CalendarDays size={14} /> Schedule</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Schedule an interview</DialogTitle><DialogDescription>The student receives an in-app notification. Times are entered in India Standard Time.</DialogDescription></DialogHeader>
      <form className="dialog-form" onSubmit={event => {
        event.preventDefault();
        schedule.mutate({
          id: applicationId,
          data: { scheduledAt: new Date(`${scheduledAt}:00+05:30`).toISOString(), kind, location },
        }, { onSuccess: () => { setOpen(false); onScheduled(); } });
      }}>
        <label className="schedule-field"><span>Date and time (IST)</span><Input type="datetime-local" min={toIndiaDateTimeInput(new Date())} value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} required data-testid={`input-interview-time-${applicationId}`} /></label>
        <label className="schedule-field"><span>Interview type</span><Input value={kind} onChange={event => setKind(event.target.value)} maxLength={80} required data-testid={`input-interview-kind-${applicationId}`} /></label>
        <label className="schedule-field"><span>Location or meeting link</span><Input value={location} onChange={event => setLocation(event.target.value)} maxLength={240} required data-testid={`input-interview-location-${applicationId}`} /></label>
        {schedule.isError && <p className="inline-error form-span">Could not schedule the interview. Choose a future time and try again.</p>}
        <div className="dialog-footer form-span"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={schedule.isPending} data-testid={`button-submit-interview-${applicationId}`}>{schedule.isPending ? 'Scheduling…' : 'Schedule interview'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function ApplicantsPage() {
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('opportunityId') || '');
  const [search, setSearch] = useState('');
  const jobs = useListOpportunities({ page: 1, pageSize: 50 });
  const opportunities = jobs.data?.items || [];
  const opportunityId = selected || opportunities[0]?.id || '';
  const appQuery = useListOpportunityApplicants({ opportunityId, search: search || undefined }, { query: { enabled: Boolean(opportunityId), queryKey: getListOpportunityApplicantsQueryKey({ opportunityId, search: search || undefined }) } });
  const update = useUpdateApplicationStage();
  const client = useQueryClient();
  const stages: ApplicationStage[] = ['applied', 'under-review', 'shortlisted', 'interview', 'selected', 'rejected'];
  return <div className="page-wrap"><PageTitle eyebrow="TALENT PIPELINE" title="Applicants" detail="Review each candidate in context and keep the next step visible." actions={<Select value={opportunityId} onValueChange={setSelected}><SelectTrigger className="filter-select" data-testid="select-applicant-opportunity"><SelectValue placeholder="Select opening" /></SelectTrigger><SelectContent>{opportunities.map(job => <SelectItem value={job.id} key={job.id}>{job.title}</SelectItem>)}</SelectContent></Select>} />
    <label className="search-field applicant-search"><Search size={16} /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applicants by name or department" data-testid="input-search-applicants" /></label>
    {!opportunityId && !jobs.isLoading ? <EmptyState title="Post your first opening" detail="Applicant review becomes available once you have a published opportunity." action={<AppButtonLink href="/recruiter/jobs">Go to job openings</AppButtonLink>} /> : <ResourceTable headers={['Candidate', 'Discipline', 'CGPA', 'Applied', 'Fit', 'Resume', 'Stage', 'Interview']} rows={(appQuery.data || []).map((a: Application) => [<div className="candidate-cell"><span className="candidate-avatar">{a.studentName.slice(0, 2).toUpperCase()}</span><div><strong>{a.studentName}</strong><small>{a.studentId}</small></div></div>, a.department, a.cgpa.toFixed(2), a.appliedAt, `${a.matchScore}%`, a.resumePath ? <a className="table-link" href={`/api/storage${a.resumePath}`} target="_blank" rel="noreferrer"><FileText size={13} />View resume</a> : '—', <Select key={a.id} value={a.stage} onValueChange={stage => update.mutate({ id: a.id, data: { stage: stage as any } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListOpportunityApplicantsQueryKey({ opportunityId, search: search || undefined }) }) })}><SelectTrigger className="stage-select" data-testid={`select-stage-${a.id}`}><SelectValue /></SelectTrigger><SelectContent>{stages.map(stage => <SelectItem value={stage} key={stage}>{stage.replace(/-/g, ' ')}</SelectItem>)}</SelectContent></Select>, <InterviewScheduleDialog key={`interview-${a.id}`} applicationId={a.id} onScheduled={() => client.invalidateQueries({ queryKey: getListOpportunityApplicantsQueryKey({ opportunityId, search: search || undefined }) })} />])} loading={jobs.isLoading || (!!opportunityId && appQuery.isLoading)} error={jobs.isError || appQuery.isError} retry={() => { jobs.refetch(); appQuery.refetch(); }} emptyTitle="No applicants to review" emptyDetail="Applications for this opportunity will appear here." />}
  </div>;
}

function PlacementStudentsPage() {
  const [search, setSearch] = useState('');
  const params = useMemo(() => ({ search: search || undefined }), [search]);
  const query = useListPlacementStudents(params);
  const rows = (query.data || []).map((s: any) => [<div className="candidate-cell"><span className="candidate-avatar">{s.name?.slice(0, 2).toUpperCase()}</span><div><strong>{s.name}</strong><small>{s.email}</small></div></div>, s.department, s.degree, s.graduationYear, s.cgpa?.toFixed?.(2) ?? s.cgpa, s.completion != null ? <span className="completion-cell"><Progress value={s.completion} />{s.completion}%</span> : <StatusPill tone="neutral">Profile ready</StatusPill>]);
  return <div className="page-wrap"><PageTitle eyebrow="CAMPUS TALENT" title="Students" detail="A searchable view of student profiles and readiness." /><label className="search-field applicant-search"><Search size={16} /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students, disciplines or skills" data-testid="input-search-students" /></label><ResourceTable headers={['Student', 'Department', 'Degree', 'Class', 'CGPA', 'Profile']} rows={rows} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} emptyTitle="No students found" emptyDetail="Try another search. Student profiles will appear as they become available." /></div>;
}
function PlacementCompaniesPage() {
  const query = useListPlacementCompanies();
  const verify = useUpdateCompanyVerification();
  const client = useQueryClient();
  const rows = (query.data || []).map((c: any) => [<strong>{c.name}</strong>, c.industry, c.location, c.website ? <a className="table-link" href={c.website} target="_blank" rel="noreferrer">{c.website}<ExternalLink size={12} /></a> : '—', <div className="verify-cell"><StatusPill tone={c.verified ? 'green' : 'amber'}>{c.verified ? 'Verified' : 'Review pending'}</StatusPill><Button size="sm" variant="outline" disabled={verify.isPending} onClick={() => verify.mutate({ id: c.id, data: { verified: !c.verified } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListPlacementCompaniesQueryKey() }) })} data-testid={`button-company-verify-${c.id}`}>{c.verified ? 'Revoke' : 'Verify'}</Button></div>, c.openRoles]);
  return <div className="page-wrap"><PageTitle eyebrow="HIRING PARTNERS" title="Companies" detail="Review registered organizations and manage their campus verification." />{verify.isError && <p className="inline-error" role="alert">Company verification could not be updated. Try again.</p>}<ResourceTable headers={['Company', 'Industry', 'Location', 'Website', 'Verification', 'Open roles']} rows={rows} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} emptyTitle="Your partner list is waiting" emptyDetail="Companies connected to your campus will be listed here." /></div>;
}
function DriveDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const create = useCreatePlacementDrive();
  const form = useForm<PlacementDriveInput>({ defaultValues: { company: '', title: '', date: '', location: '', opportunityId: '' } });
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button data-testid="button-create-drive"><Plus size={16} /> Schedule a drive</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Schedule a placement drive</DialogTitle><DialogDescription>Set the date, place, and opportunity for a campus drive.</DialogDescription></DialogHeader><Form {...form}><form onSubmit={form.handleSubmit(data => create.mutate({ data }, { onSuccess: () => { setOpen(false); onCreated(); form.reset(); } }))} className="dialog-form">{(['company', 'title', 'date', 'location', 'opportunityId'] as (keyof PlacementDriveInput)[]).map(key => <FormField key={key} control={form.control} name={key} render={({ field }) => <FormItem className={key === 'title' ? 'form-span' : ''}><FormLabel>{{ company: 'Company', title: 'Drive title', date: 'Date', location: 'Location', opportunityId: 'Opportunity ID' }[key]}</FormLabel><FormControl><Input {...field} type={key === 'date' ? 'date' : 'text'} data-testid={`input-drive-${key}`} /></FormControl></FormItem>} />)}{create.isError && <p className="inline-error form-span">Could not schedule the drive. Try again.</p>}<div className="dialog-footer form-span"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} data-testid="button-submit-drive">{create.isPending ? 'Scheduling…' : 'Schedule drive'}<ArrowRight size={14} /></Button></div></form></Form></DialogContent></Dialog>;
}
function PlacementDrivesPage() {
  const query = useListPlacementDrives();
  const client = useQueryClient();
  const rows = (query.data || []).map((d: any) => [<strong>{d.title}</strong>, d.company, d.date, d.location, <StatusPill tone={d.status === 'completed' ? 'green' : 'violet'}>{d.status}</StatusPill>, d.opportunityId]);
  return <div className="page-wrap"><PageTitle eyebrow="CAMPUS CALENDAR" title="Placement drives" detail="Plan and coordinate the moments that connect hiring teams with students." actions={<DriveDialog onCreated={() => client.invalidateQueries({ queryKey: getListPlacementDrivesQueryKey() })} />} /><ResourceTable headers={['Drive', 'Company', 'Date', 'Location', 'Status', 'Opportunity']} rows={rows} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} emptyTitle="No drives on the calendar yet" emptyDetail="Schedule an upcoming campus drive to start coordinating." /></div>;
}
function PlacementAnalyticsPage() {
  const query = useGetPlacementAnalytics();
  const data = query.data;
  const drawChart = (title: string, caption: string, points: any[] = []) => {
    const maximum = Math.max(...points.map((point) => point.value), 1);
    return (
      <Card className="analytics-card">
        <CardHeader><span className="eyebrow">{caption}</span><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent>
          {points.length ? (
            <div className="horizontal-bars">
              {points.map((point, index) => (
                <div className="horizontal-bar-row" key={`${point.label}-${index}`}>
                  <span>{point.label}</span>
                  <div><i style={{ width: `${Math.max(3, (point.value / maximum) * 100)}%` }} /></div>
                  <strong>{point.value}</strong>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No data to visualize yet" detail="Outcomes will build here as activity is recorded." />}
        </CardContent>
      </Card>
    );
  };
  return <div className="page-wrap"><PageTitle eyebrow="OUTCOMES & MOMENTUM" title="Placement analytics" detail="A measured view of how your campus outcomes are taking shape." />{query.isLoading ? <div className="stats-grid"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div> : query.isError ? <QueryError retry={() => query.refetch()} /> : <><div className="analytics-grid">{drawChart('By department', 'PLACEMENT RATE', data?.departments)}{drawChart('Compensation', 'PACKAGE DISTRIBUTION', data?.packages)}{drawChart('Outcomes', 'STUDENT JOURNEY', data?.outcomes)}</div>{data?.sampleData && <div className="sample-note"><Layers3 size={14} /> Figures include platform sample data.</div>}</>}</div>;
}
function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const query = useListAdminUsers({ search: search || undefined });
  const update = useUpdateAdminUser();
  const client = useQueryClient();
  return <div className="page-wrap"><PageTitle eyebrow="PLATFORM STEWARDSHIP" title="Users" detail="Access status and roles across the InternConnect network." /><label className="search-field applicant-search"><Search size={16} /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a user by name or email" data-testid="input-search-users" /></label><ResourceTable headers={['Person', 'Role', 'Status', 'Joined', 'Manage role', 'Manage status']} rows={(query.data || []).map((u: PlatformUser) => [<div className="candidate-cell"><span className="candidate-avatar">{u.name.slice(0, 2).toUpperCase()}</span><div><strong>{u.name}</strong><small>{u.email}</small></div></div>, <StatusPill tone="violet">{u.role.replace(/-/g, ' ')}</StatusPill>, <StatusPill tone={u.status === 'active' ? 'green' : u.status === 'inactive' ? 'red' : 'amber'}>{u.status}</StatusPill>, u.createdAt, <Select key={`role-${u.id}`} value={u.role} onValueChange={role => update.mutate({ id: u.id, data: { role: role as any } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListAdminUsersQueryKey({ search: search || undefined }) }) })}><SelectTrigger className="stage-select" data-testid={`select-user-role-${u.id}`}><SelectValue /></SelectTrigger><SelectContent>{roles.map(r => <SelectItem value={r.id} key={r.id}>{r.label}</SelectItem>)}</SelectContent></Select>, <Select key={`status-${u.id}`} value={u.status} onValueChange={status => update.mutate({ id: u.id, data: { status: status as any } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListAdminUsersQueryKey({ search: search || undefined }) }) })}><SelectTrigger className="stage-select" data-testid={`select-user-status-${u.id}`}><SelectValue /></SelectTrigger><SelectContent>{['active', 'pending', 'inactive'].map(s => <SelectItem value={s} key={s}>{s}</SelectItem>)}</SelectContent></Select>])} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} emptyTitle="No users match that search" emptyDetail="Try a different name or email address." /></div>;
}
function AdminAuditPage() {
  const query = useListAuditEvents();
  const rows = (query.data || []).map((e: any) => [<strong>{e.actor}</strong>, e.action, e.target, e.createdAt, e.details || '—']);
  return <div className="page-wrap"><PageTitle eyebrow="ACCOUNTABILITY, BY DESIGN" title="Audit log" detail="A read-only record of meaningful platform activity." actions={<span className="audit-readonly"><ShieldCheck size={14} /> Read-only record</span>} /><ResourceTable headers={['Actor', 'Action', 'Target', 'When', 'Details']} rows={rows} loading={query.isLoading} error={query.isError} retry={() => query.refetch()} emptyTitle="The log is quiet" emptyDetail="Important platform events will be captured here." /></div>;
}

function SettingsPage() {
  const { role, setRole } = useRole();
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const toggle = () => { document.documentElement.classList.toggle('dark', !dark); setDark(!dark); };
  return <div className="page-wrap"><PageTitle eyebrow="YOUR PREFERENCES" title="Settings" detail="Shape how InternConnect feels and which workspace you see." /><div className="settings-stack"><Card><CardHeader><span className="eyebrow">APPEARANCE</span><CardTitle>A comfortable workspace</CardTitle></CardHeader><CardContent><div className="setting-row"><div className="setting-icon"><Sun size={17} /></div><div><strong>Interface theme</strong><p>Choose a light or dark working environment.</p></div><button className={`theme-choice ${dark ? 'dark-choice' : ''}`} onClick={toggle} data-testid="button-setting-theme">{dark ? <><Moon size={15} /> Dark <span>·</span> switch to light</> : <><Sun size={15} /> Light <span>·</span> switch to dark</>}</button></div></CardContent></Card>
    <Card><CardHeader><span className="eyebrow">DEMO WORKSPACE</span><CardTitle>Explore each point of view</CardTitle></CardHeader><CardContent><p className="settings-description">Demo personas change the preview role and navigation only. They are simulated, not secure, do not sign in, and do not persist across sessions. For genuine account access, use Clerk sign-in.</p><div className="persona-grid">{roles.map(r => <button key={r.id} className={`persona-choice ${role === r.id ? 'selected' : ''}`} onClick={() => setRole(r.id)} data-testid={`button-persona-${r.id}`}><span className="role-avatar">{r.short}</span><span><strong>{r.label}</strong><small>Demo persona</small></span>{role === r.id && <Check size={16} />}</button>)}</div></CardContent></Card>
    <Card><CardHeader><span className="eyebrow">ACCOUNT</span><CardTitle>Sign-in and privacy</CardTitle></CardHeader><CardContent><div className="setting-row"><div className="setting-icon"><ShieldCheck size={17} /></div><div><strong>Clerk account</strong><p>Your real account session is managed by Clerk.</p></div><AppButtonLink href="/sign-in" variant="outline">Manage account<ArrowUpRightFromSquare size={14} /></AppButtonLink><SignOutAction /></div></CardContent></Card></div></div>;
}
function SignOutAction() {
  const { signOut } = useClerk();
  return <Button variant="ghost" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</Button>;
}
function DemoPersonaSelector() {
  const { setRole } = useRole();
  const [, setLocation] = useLocation();

  const handleSelectRole = (r: Role) => {
    setRole(r);
    window.sessionStorage.setItem('internconnect_demo_role', r);
    setLocation(roleHome[r]);
  };

  return (
    <div className="bg-white border border-[#dce0ec] rounded-2xl p-6 shadow-sm mb-4 max-w-[440px] w-full text-left">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="p-1 rounded-md bg-[#5549df]/10 text-[#5549df]">
          <Sparkles size={16} />
        </span>
        <h3 className="font-semibold text-[#18213d] text-sm">Quick Demo Access</h3>
      </div>
      <p className="text-xs text-[#69738d] mb-3">
        Explore the platform instantly using any role:
      </p>
      <div className="grid grid-cols-2 gap-2">
        {roles.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => handleSelectRole(r.id)}
            className="flex items-center justify-between p-2.5 rounded-xl border border-[#e2e5f0] hover:border-[#5549df] hover:bg-[#5549df]/5 text-xs font-medium text-[#18213d] transition-all text-left"
          >
            <span>{r.label}</span>
            <span className="text-[10px] bg-[#f0f2f8] px-1.5 py-0.5 rounded font-mono font-bold text-[#5549df]">
              {r.short}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
function SignInPage() {
  return <div className="auth-page"><div className="auth-aside"><BrandAnchor /><div className="auth-message"><span className="eyebrow">YOUR NEXT CHAPTER, CONTINUED</span><h1>Good to see<br />you again.</h1><p>Pick up where your campus-to-career story left off.</p></div><div className="auth-footer">A clearer path between learning and what’s next.</div></div><div className="auth-form-area"><div className="auth-mobile-brand"><BrandAnchor /></div><DemoPersonaSelector /><ErrorBoundary FallbackComponent={() => <div className="text-xs text-[#69738d] max-w-[440px] text-center p-3 bg-gray-50 rounded-xl border border-gray-200">To enable real email/Google auth, set your free Clerk publishable key in <code>.env</code>.</div>}><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></ErrorBoundary><span className="auth-back"><AppLink href="/">Back to InternConnect</AppLink></span></div></div>;
}
function SignUpPage() {
  return <div className="auth-page"><div className="auth-aside"><BrandAnchor /><div className="auth-message"><span className="eyebrow">START WITH WHAT’S NEXT</span><h1>Make room<br />for possibility.</h1><p>A profile, a good opportunity, and the people who can help connect the two.</p></div><div className="auth-footer">Your next step is closer than you think.</div></div><div className="auth-form-area"><div className="auth-mobile-brand"><BrandAnchor /></div><DemoPersonaSelector /><ErrorBoundary FallbackComponent={() => <div className="text-xs text-[#69738d] max-w-[440px] text-center p-3 bg-gray-50 rounded-xl border border-gray-200">To enable real email/Google auth, set your free Clerk publishable key in <code>.env</code>.</div>}><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></ErrorBoundary><span className="auth-back"><AppLink href="/">Back to InternConnect</AppLink></span></div></div>;
}
function RoleDashboardRouter() {
  const params = useLocation()[0].split('/');
  const role = params[2] as Role;
  const { setRole } = useRole();
  useEffect(() => { if (roles.some(r => r.id === role)) setRole(role); }, [role, setRole]);
  return <DashboardPage role={roles.some(r => r.id === role) ? role : 'student'} />;
}
function OpportunityDetailRouter() {
  const [path] = useLocation();
  return <OpportunityDetailPage id={decodeURIComponent(path.split('/').pop() || '')} />;
}
function HomeRedirect() {
  const { role } = useRole();
  return <><Show when="signed-in"><Redirect to={roleHome[role]} /></Show><LandingPage /></>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevRef = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (prevRef.current !== undefined && prevRef.current !== userId) client.clear();
    prevRef.current = userId;
  }), [addListener, client]);
  return null;
}
function RouterContents() {
  const client = useQueryClient();
  const [role, setRoleState] = useState<Role>(() => {
    const saved = window.sessionStorage.getItem('internconnect_demo_role');
    if (roles.some(item => item.id === saved)) return saved as Role;
    const parts = stripBase(window.location.pathname).split('/').filter(Boolean);
    const found = roles.find(r => parts.includes(r.id))?.id;
    const initial = found || 'student';
    window.sessionStorage.setItem('internconnect_demo_role', initial);
    return initial;
  });
  const setRole = (nextRole: Role) => {
    window.sessionStorage.setItem('internconnect_demo_role', nextRole);
    setRoleState(nextRole);
    client.clear();
  };
  return <RoleContext.Provider value={{ role, setRole }}><AppShell><RoutedErrorBoundary><Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/opportunities" component={OpportunitiesPage} />
    <Route path="/opportunities/:id" component={OpportunityDetailRouter} />
    <Route path="/dashboard/:role" component={RoleDashboardRouter} />
    <Route path="/student/profile" component={StudentProfilePage} />
    <Route path="/student/applications" component={ApplicationsPage} />
    <Route path="/student/saved" component={SavedPage} />
    <Route path="/student/interviews" component={InterviewsPage} />
    <Route path="/student/notifications" component={NotificationsPage} />
    <Route path="/recruiter/company" component={CompanyPage} />
    <Route path="/recruiter/jobs" component={RecruiterJobsPage} />
    <Route path="/recruiter/applicants" component={ApplicantsPage} />
    <Route path="/placement/students" component={PlacementStudentsPage} />
    <Route path="/placement/companies" component={PlacementCompaniesPage} />
    <Route path="/placement/drives" component={PlacementDrivesPage} />
    <Route path="/placement/analytics" component={PlacementAnalyticsPage} />
    <Route path="/admin/users" component={AdminUsersPage} />
    <Route path="/admin/audit" component={AdminAuditPage} />
    <Route path="/settings" component={SettingsPage} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary></AppShell></RoleContext.Provider>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your InternConnect account' } }, signUp: { start: { title: 'Create your account', subtitle: 'Make your next step count' } } }} routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><TooltipProvider><ClerkQueryClientCacheInvalidator /><RouterContents /><Toaster /></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
export default App;
