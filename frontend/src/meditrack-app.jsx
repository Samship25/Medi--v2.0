import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { jsPDF } from "jspdf";
import {
  Activity,
  AlertTriangle,
  Bell,
  Camera,
  Check,
  ClipboardPlus,
  FileBadge,
  FileText,
  Home,
  LoaderCircle,
  LogOut,
  Mic,
  Pill,
  ScanLine,
  ShieldPlus,
  Share2,
  Trash2,
  UserCircle,
  Volume2,
  Eye,
  EyeOff,
  Sparkles,
  Plus,
  ExternalLink,
} from "lucide-react";
import Tesseract from "tesseract.js";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { HealthChat } from "@/components/HealthChat";
import { apiRequest, setAuthToken } from "@/lib/api";
import { cacheData, readCachedData } from "@/lib/offline";

const heroImage =
  "https://images.pexels.com/photos/5712677/pexels-photo-5712677.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const navItems = [
  { label: "Dashboard", href: "/app/dashboard", icon: Home },
  { label: "Records", href: "/app/records", icon: FileText },
  { label: "Doctor Sharing", href: "/app/sharing", icon: Share2 },
  { label: "Profile", href: "/app/profile", icon: UserCircle },
  { label: "Admin", href: "/app/admin", icon: ShieldPlus },
];

const severityStyles = {
  severe: "bg-red-50 text-red-700 border-red-200",
  moderate: "bg-amber-50 text-amber-700 border-amber-200",
  mild: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

const blankSignup = {
  name: "",
  age: "",
  blood_group: "",
  email: "",
  phone: "",
  password: "",
  profile_photo: "",
};

const blankMedicine = {
  medicine_name: "",
  dosage: "",
  start_date: new Date().toISOString().slice(0, 10),
  frequency: "Once daily",
  reminder_times: ["08:00"],
  notes: "",
  source: "manual",
  barcode: "",
};

const blankRecord = {
  title: "",
  past_treatments: "",
  notes: "",
  prescription_image: "",
  prescription_text: "",
  report_type: "prescription",
};

const blankProfile = {
  name: "",
  age: "",
  blood_group: "",
  phone: "",
  profile_photo: "",
};

const isIosDevice = () => {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
};

const downloadBlobFile = (blob, filename) => {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (isIosDevice()) {
    const popup = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      window.location.href = blobUrl;
    }
  }

  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
};

const savePdfToDevice = async (blob, filename) => {
  const pdfFile = new File([blob], filename, { type: "application/pdf" });

  if (window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "PDF document",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      toast.success("PDF saved to your device.");
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast.error("Direct file save was blocked. Trying another save method...");
      }
    }
  }

  if (navigator.canShare) {
    try {
      if (navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: filename,
          text: "Save or share your Medi Track report PDF.",
        });
        toast.success("Use the share sheet to save the PDF to Files or Downloads.");
        return true;
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast.error("Native save/share was blocked. Trying browser download instead...");
      }
    }
  }

  downloadBlobFile(blob, filename);
  toast.success(isIosDevice() ? "PDF opened. Use the share button to Save to Files." : "PDF download started.");
  return true;
};

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Share link copied.");
      return true;
    } catch {
      // fall through to legacy copy below
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    const copied = document.execCommand("copy");
    if (copied) {
      toast.success("Share link copied.");
      return true;
    }
  } catch {
    // noop
  } finally {
    document.body.removeChild(textarea);
  }

  toast.error("Unable to copy automatically. Please long-press or select the link manually.");
  return false;
};

const makePdf = async (report, filename = "medi-track-report.pdf") => {
  try {
    const doc = new jsPDF();
    const payload = report.payload || report;
    let y = 18;

    const writeLine = (text, offset = 8) => {
      const lines = doc.splitTextToSize(text, 175);
      doc.text(lines, 18, y);
      y += lines.length * 6 + offset;
      if (y > 270) {
        doc.addPage();
        y = 18;
      }
    };

    doc.setFontSize(18);
    doc.text("Medi Track Medical Report", 18, y);
    y += 10;
    doc.setFontSize(11);
    writeLine(`Generated: ${payload.generated_at || report.created_at || new Date().toISOString()}`, 6);

    if (payload.user) {
      writeLine(`Patient: ${payload.user.name} | Blood Group: ${payload.user.blood_group} | Email: ${payload.user.email}`);
    }
    writeLine(`Medicines (${payload.medicines?.length || 0})`, 4);
    (payload.medicines || []).forEach((medicine) => {
      writeLine(`• ${medicine.medicine_name} — ${medicine.dosage} — ${medicine.frequency}`);
    });
    writeLine(`Interaction Alerts (${payload.alerts?.length || 0})`, 4);
    (payload.alerts || []).forEach((alert) => {
      writeLine(`• ${alert.severity_level.toUpperCase()}: ${alert.medicine_combination.join(" + ")} — ${alert.explanation}`);
    });
    writeLine(`Medical Records (${payload.records?.length || 0})`, 4);
    (payload.records || []).forEach((record) => {
      writeLine(`• ${record.title}: ${record.past_treatments}`);
    });

    const pdfBlob = doc.output("blob");
    await savePdfToDevice(pdfBlob, filename);
  } catch {
    toast.error("Unable to prepare the PDF right now.");
  }
};

const StatCard = ({ title, value, helper, icon: Icon, testId }) => (
  <Card data-testid={testId} className="border-sky-100 bg-white/85 shadow-sm backdrop-blur-sm">
    <CardContent className="flex items-start justify-between gap-4 p-5">
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
      </div>
      <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
        <Icon className="h-5 w-5" />
      </div>
    </CardContent>
  </Card>
);

const EmptyState = ({ icon: Icon, title, description, testId }) => (
  <div data-testid={testId} className="rounded-3xl border border-dashed border-sky-200 bg-sky-50/80 p-8 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-sky-600 shadow-sm">
      <Icon className="h-5 w-5" />
    </div>
    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
  </div>
);

const Shell = ({ user, onLogout, children }) => {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.55),_transparent_34%),linear-gradient(180deg,_#f8fdff_0%,_#eef7ff_48%,_#f8fbff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:py-6">
        <aside className="glass-panel lg:sticky lg:top-6 lg:flex lg:w-72 lg:flex-col">
          <div className="flex items-center gap-3 border-b border-sky-100 px-5 py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg">
              <Pill className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-semibold">Medi Track</p>
              <p className="text-sm text-slate-500">Hospital-style medicine control</p>
            </div>
          </div>

          <div className="px-5 py-5">
            <div data-testid="sidebar-user-card" className="rounded-3xl bg-sky-50 p-4">
              <p className="text-sm text-slate-500">Signed in as</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge data-testid="sidebar-user-role-badge" className="bg-sky-600 text-white hover:bg-sky-600">
                  {user.role}
                </Badge>
                <Badge data-testid="sidebar-user-blood-group-badge" variant="outline" className="border-sky-200 text-sky-700">
                  {user.blood_group}
                </Badge>
              </div>
            </div>
          </div>

          <nav className="flex flex-1 flex-row gap-2 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  data-testid={`sidebar-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-300 ${
                    active
                      ? "bg-sky-600 text-white shadow-[0_18px_35px_rgba(2,132,199,0.25)]"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-sky-100 px-5 py-5">
            <Button data-testid="logout-button" variant="outline" className="w-full border-sky-200" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </aside>

        <main className="flex-1 space-y-6 py-3">{children}</main>
      </div>
    </div>
  );
};

const LandingPage = () => (
  <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.7),_transparent_32%),linear-gradient(180deg,_#f7fdff_0%,_#eef7ff_42%,_#ffffff_100%)] text-slate-900">
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="glass-panel mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg">
            <Pill className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">Medi Track</p>
            <p className="text-sm text-slate-500">Smart medical records and medicine tracking</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/auth">
            <Button data-testid="landing-login-button" variant="outline" className="border-sky-200 bg-white/90 px-6">
              Login
            </Button>
          </Link>
          <Link to="/auth?tab=signup">
            <Button data-testid="landing-signup-button" className="bg-sky-600 px-6 hover:bg-sky-700">
              Create account
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-8 pb-8 pt-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <Badge data-testid="hero-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">
            AI-powered medicine safety and medical memory
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Keep medicines, prescriptions, and doctor-ready reports in one calm place.
          </h1>
          <p className="max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
            Track active medicines, detect harmful interactions, scan prescriptions, set reminders, and share clean health summaries with doctors — all inside a mobile-friendly hospital-style dashboard.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/auth?tab=signup">
              <Button data-testid="hero-start-button" className="h-12 rounded-full bg-sky-600 px-6 hover:bg-sky-700">
                Start tracking
              </Button>
            </Link>
            <Link to="/auth">
              <Button data-testid="hero-demo-login-button" variant="outline" className="h-12 rounded-full border-sky-200 bg-white px-6">
                View dashboard flow
              </Button>
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Drug interaction safety", "Hybrid database + AI checks"],
              ["Prescription capture", "Camera, file upload, OCR, voice"],
              ["Doctor sharing", "Exportable report summaries"],
            ].map(([title, text]) => (
              <div key={title} className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel relative overflow-hidden p-4">
          <div className="absolute inset-x-8 top-8 h-24 rounded-full bg-sky-200/55 blur-3xl" />
          <div className="relative rounded-[2rem] border border-white/70 bg-white p-4 shadow-xl">
            <div className="aspect-[4/4.4] overflow-hidden rounded-[1.6rem] bg-slate-100">
              <img
                data-testid="hero-image"
                src={heroImage}
                alt="Medication reminder app"
                className="h-full w-full object-cover object-center"
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-sky-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-sky-700">Active today</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">4 reminders</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Safety engine</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">2 alerts checked</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 py-8 md:grid-cols-3">
        {[
          [Camera, "Capture prescriptions", "Use mobile camera preview, retake if needed, and OCR medicines into your records."],
          [Activity, "Understand interactions", "Static interaction rules plus AI analysis highlight severe, moderate, and mild risks."],
          [Share2, "Send doctor-ready reports", "Generate PDF summaries that include medicine lists, records, and safety alerts."],
        ].map(([Icon, title, text]) => (
          <Card key={title} className="border-sky-100 bg-white/90 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold text-slate-900 md:text-lg">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">{text}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  </div>
);

const AuthPage = ({ onAuthSuccess }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") || "login");
  const [showPassword, setShowPassword] = useState(false);
  const [signupForm, setSignupForm] = useState(blankSignup);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [resetForm, setResetForm] = useState({ phone: "", code: "", new_password: "" });
  const [resetCode, setResetCode] = useState("");
  const [loading, setLoading] = useState(false);

  const runAuth = async (type) => {
    setLoading(true);
    try {
      const endpoint = type === "signup" ? "/auth/signup" : "/auth/login";
      const data = type === "signup" ? { ...signupForm, age: Number(signupForm.age) } : loginForm;
      const response = await apiRequest({ method: "post", url: endpoint, data });
      onAuthSuccess(response.token, response.user);
      toast.success(type === "signup" ? "Account created" : "Welcome back");
      navigate("/app/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Unable to continue");
    } finally {
      setLoading(false);
    }
  };

  const requestReset = async () => {
    try {
      const response = await apiRequest({ method: "post", url: "/auth/request-reset", data: { phone: resetForm.phone } });
      setResetCode(response.demo_code);
      toast.success("Verification code generated for phone recovery");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Reset request failed");
    }
  };

  const confirmReset = async () => {
    try {
      await apiRequest({ method: "post", url: "/auth/confirm-reset", data: resetForm });
      toast.success("Password updated. Please login.");
      setTab("login");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Password reset failed");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(186,230,253,0.75),_transparent_30%),linear-gradient(180deg,_#f6fdff_0%,_#eff8ff_42%,_#ffffff_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[90vh] max-w-6xl gap-6 lg:grid-cols-[1fr_0.95fr] lg:items-center">
        <div className="glass-panel space-y-6 p-6 lg:p-8">
          <Badge data-testid="auth-page-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">
            Secure access for patients and admin
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Your medicines deserve organized care.</h1>
          <p className="max-w-xl text-base leading-8 text-slate-600 md:text-lg">
            Sign in to manage prescriptions, reminders, AI medicine guidance, and doctor sharing from one hospital-inspired workspace.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [Bell, "Reminders", "Track every dose"],
              [ScanLine, "Scanning", "Barcode, OCR, voice"],
              [FileBadge, "Reports", "Shareable doctor summaries"],
            ].map(([Icon, title, text]) => (
              <div key={title} className="rounded-3xl bg-white/90 p-4 shadow-sm">
                <Icon className="h-5 w-5 text-sky-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{text}</p>
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Demo admin access</p>
            <p data-testid="demo-admin-credentials" className="mt-2 text-sm leading-7 text-slate-600">
              Email: admin@meditrack.app <br /> Password: Admin123!
            </p>
          </div>
        </div>

        <Card className="border-sky-100 bg-white/95 shadow-[0_30px_80px_rgba(14,116,244,0.12)] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-900">Access Medi Track</CardTitle>
            <CardDescription>Use secure email login now, plus password recovery with phone verification code.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab} className="space-y-5">
              <TabsList className="grid w-full grid-cols-3 rounded-full bg-sky-50 p-1">
                <TabsTrigger data-testid="auth-tab-login" value="login" className="rounded-full">Login</TabsTrigger>
                <TabsTrigger data-testid="auth-tab-signup" value="signup" className="rounded-full">Signup</TabsTrigger>
                <TabsTrigger data-testid="auth-tab-reset" value="reset" className="rounded-full">Reset</TabsTrigger>
              </TabsList>

              <Button
                data-testid="google-login-button"
                variant="outline"
                className="w-full border-sky-200 bg-white"
                onClick={() => toast.info("Google sign-in can be connected when Firebase project keys are added.")}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>

              <TabsContent value="login" className="space-y-4">
                <Input data-testid="login-email-input" placeholder="Email" value={loginForm.email} onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))} />
                <div className="relative">
                  <Input data-testid="login-password-input" type={showPassword ? "text" : "password"} placeholder="Password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
                  <button type="button" data-testid="login-password-toggle" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button data-testid="login-submit-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={() => runAuth("login")} disabled={loading}>
                  {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Login
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <Input data-testid="signup-name-input" placeholder="Full name" value={signupForm.name} onChange={(event) => setSignupForm((current) => ({ ...current, name: event.target.value }))} />
                <div className="grid grid-cols-2 gap-4">
                  <Input data-testid="signup-age-input" type="number" placeholder="Age" value={signupForm.age} onChange={(event) => setSignupForm((current) => ({ ...current, age: event.target.value }))} />
                  <Input data-testid="signup-blood-group-input" placeholder="Blood group" value={signupForm.blood_group} onChange={(event) => setSignupForm((current) => ({ ...current, blood_group: event.target.value }))} />
                </div>
                <Input data-testid="signup-email-input" placeholder="Email" value={signupForm.email} onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))} />
                <Input data-testid="signup-phone-input" placeholder="Phone number" value={signupForm.phone} onChange={(event) => setSignupForm((current) => ({ ...current, phone: event.target.value }))} />
                <div className="relative">
                  <Input data-testid="signup-password-input" type={showPassword ? "text" : "password"} placeholder="Password" value={signupForm.password} onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))} />
                  <button type="button" data-testid="signup-password-toggle" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Input data-testid="signup-photo-input" placeholder="Profile photo URL (optional)" value={signupForm.profile_photo} onChange={(event) => setSignupForm((current) => ({ ...current, profile_photo: event.target.value }))} />
                <Button data-testid="signup-submit-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={() => runAuth("signup")} disabled={loading}>
                  {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create account
                </Button>
              </TabsContent>

              <TabsContent value="reset" className="space-y-4">
                <Input data-testid="reset-phone-input" placeholder="Phone number used on account" value={resetForm.phone} onChange={(event) => setResetForm((current) => ({ ...current, phone: event.target.value }))} />
                <Button data-testid="reset-request-button" variant="outline" className="w-full border-sky-200" onClick={requestReset}>
                  Request verification code
                </Button>
                {resetCode ? (
                  <p data-testid="reset-demo-code" className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
                    Verification code: {resetCode}
                  </p>
                ) : null}
                <Input data-testid="reset-code-input" placeholder="Verification code" value={resetForm.code} onChange={(event) => setResetForm((current) => ({ ...current, code: event.target.value }))} />
                <Input data-testid="reset-new-password-input" type="password" placeholder="New password" value={resetForm.new_password} onChange={(event) => setResetForm((current) => ({ ...current, new_password: event.target.value }))} />
                <Button data-testid="reset-confirm-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={confirmReset}>
                  Update password
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const DashboardPage = ({ dashboard, medicineForm, setMedicineForm, onAddMedicine, onMarkTaken, onDeleteMedicine }) => (
  <div className="space-y-6">
    <section className="glass-panel overflow-hidden p-6 lg:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge data-testid="dashboard-hero-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">
            Live medicine safety overview
          </Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Welcome back, {dashboard.user?.name?.split(" ")[0]}.</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
            Monitor your active medicines, upcoming reminders, recent prescriptions, and interaction alerts from a single care dashboard.
          </p>
        </div>
        <div data-testid="dashboard-adherence-card" className="rounded-[2rem] bg-white/90 p-5 shadow-sm lg:w-80">
          <p className="text-sm text-slate-500">Adherence outlook</p>
          <p className="mt-2 text-4xl font-semibold text-slate-900">{dashboard.summary?.adherence_score || 0}%</p>
          <p className="mt-2 text-sm text-slate-500">Improves when reminders are checked and risky combinations are reduced.</p>
        </div>
      </div>
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard testId="dashboard-stat-medicines" title="Current medicines" value={dashboard.summary?.medicine_count || 0} helper="Actively tracked in your regimen" icon={Pill} />
      <StatCard testId="dashboard-stat-alerts" title="Interaction alerts" value={dashboard.summary?.alert_count || 0} helper="Color-coded safety checks" icon={AlertTriangle} />
      <StatCard testId="dashboard-stat-records" title="Medical records" value={dashboard.summary?.record_count || 0} helper="Past treatments and prescriptions" icon={ClipboardPlus} />
      <StatCard testId="dashboard-stat-reminders" title="Reminder windows" value={dashboard.reminders?.length || 0} helper="Daily medicine touchpoints" icon={Bell} />
    </section>

    <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>Quick add medicine</CardTitle>
          <CardDescription>Add medicine manually and trigger fresh interaction analysis instantly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input data-testid="quick-add-medicine-name-input" placeholder="Medicine name" value={medicineForm.medicine_name} onChange={(event) => setMedicineForm((current) => ({ ...current, medicine_name: event.target.value }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input data-testid="quick-add-dosage-input" placeholder="Dosage" value={medicineForm.dosage} onChange={(event) => setMedicineForm((current) => ({ ...current, dosage: event.target.value }))} />
            <Input data-testid="quick-add-start-date-input" type="date" value={medicineForm.start_date} onChange={(event) => setMedicineForm((current) => ({ ...current, start_date: event.target.value }))} />
          </div>
          <Input data-testid="quick-add-frequency-input" placeholder="Frequency" value={medicineForm.frequency} onChange={(event) => setMedicineForm((current) => ({ ...current, frequency: event.target.value }))} />
          <Input data-testid="quick-add-reminders-input" placeholder="Reminder times, comma separated (08:00,20:00)" value={medicineForm.reminder_times.join(",")} onChange={(event) => setMedicineForm((current) => ({ ...current, reminder_times: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }))} />
          <Textarea data-testid="quick-add-notes-input" placeholder="Notes or instructions" value={medicineForm.notes} onChange={(event) => setMedicineForm((current) => ({ ...current, notes: event.target.value }))} />
          <Button data-testid="quick-add-submit-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={() => onAddMedicine({ ...medicineForm, source: "manual" })}>
            <Plus className="mr-2 h-4 w-4" />
            Add medicine
          </Button>
        </CardContent>
      </Card>

      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>Interaction alerts</CardTitle>
          <CardDescription>Hybrid safety engine showing severe, moderate, and mild medication conflicts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashboard.alerts?.length ? (
            dashboard.alerts.map((alert) => (
              <div key={alert.id} data-testid={`dashboard-alert-${alert.id}`} className={`rounded-3xl border p-4 ${severityStyles[alert.severity_level] || severityStyles.mild}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em]">{alert.severity_level}</p>
                  <Badge variant="outline" className="border-current bg-transparent text-current">{alert.source}</Badge>
                </div>
                <p className="mt-3 text-lg font-semibold">{alert.medicine_combination.join(" + ")}</p>
                <p className="mt-2 text-sm leading-7">{alert.explanation}</p>
                <p className="mt-3 text-sm font-medium">Recommendation: {alert.safety_recommendation}</p>
              </div>
            ))
          ) : (
            <EmptyState testId="dashboard-alerts-empty" icon={Check} title="No active interaction alerts" description="Your current medicine list does not show stored conflicts right now." />
          )}
        </CardContent>
      </Card>
    </section>

    <section className="grid gap-6 lg:grid-cols-2">
      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>Current medicines & reminders</CardTitle>
          <CardDescription>Mark doses as taken and keep timing under control.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashboard.medicines?.length ? (
            dashboard.medicines.map((medicine) => {
              const takenToday = medicine.taken_log?.includes(new Date().toISOString().slice(0, 10));
              return (
                <div key={medicine.id} data-testid={`medicine-card-${medicine.id}`} className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{medicine.medicine_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{medicine.dosage} • {medicine.frequency}</p>
                      <p className="mt-2 text-sm text-slate-500">Reminders: {medicine.reminder_times?.join(", ") || "Not set"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button data-testid={`mark-taken-button-${medicine.id}`} size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={() => onMarkTaken(medicine.id)}>
                        <Check className="mr-2 h-4 w-4" />
                        {takenToday ? "Taken today" : "Mark taken"}
                      </Button>
                      <Button data-testid={`delete-medicine-button-${medicine.id}`} size="sm" variant="outline" className="border-red-200 text-red-600" onClick={() => onDeleteMedicine(medicine.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState testId="dashboard-medicines-empty" icon={Pill} title="No medicines added yet" description="Use quick add or scanning tools to populate your treatment list." />
          )}
        </CardContent>
      </Card>

      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>Recent prescriptions and records</CardTitle>
          <CardDescription>Newly uploaded items appear here for fast review before doctor visits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashboard.records?.length ? (
            dashboard.records.map((record) => (
              <div key={record.id} data-testid={`dashboard-record-${record.id}`} className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-semibold text-slate-900">{record.title}</p>
                  <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">{record.report_type}</Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-500">{record.past_treatments}</p>
                {record.prescription_text ? <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">OCR: {record.prescription_text}</p> : null}
              </div>
            ))
          ) : (
            <EmptyState testId="dashboard-records-empty" icon={FileText} title="No records stored yet" description="Prescription scans, history notes, and uploaded treatments will appear here." />
          )}
        </CardContent>
      </Card>
    </section>
  </div>
);

const CameraCaptureCard = ({ onCapture }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [capturedPreview, setCapturedPreview] = useState("");
  const [capturedSource, setCapturedSource] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Open the camera or use your device photo capture.");

  const stopCamera = () => {
    streamRef.current?.getTracks()?.forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("Live camera is unavailable here. Please use device photo capture below.");
      toast.error("Live camera is not supported in this browser.");
      return;
    }

    try {
      stopCamera();
      setCapturedPreview("");
      setCapturedSource(null);
      setCameraStatus("Requesting camera permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      setCameraStatus("Camera ready. Frame the prescription, then capture it.");
    } catch {
      setCameraStatus("Live camera could not start. Use device photo capture below instead.");
      toast.error("Unable to start the live camera. Use your device photo capture below.");
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !cameraReady || video.readyState < 2) {
      toast.error("Open the camera and wait for the preview before capturing.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    setCapturedSource(dataUrl);
    setCapturedPreview(dataUrl);
    setCameraStatus("Photo captured. Review it, retake if needed, or use it for OCR.");
    stopCamera();
  };

  const handleCapturedFile = (file) => {
    if (!file) return;
    stopCamera();
    const nextPreview = URL.createObjectURL(file);
    setCapturedSource(file);
    setCapturedPreview(nextPreview);
    setCameraStatus("Device photo selected. Review it, then use it for OCR.");
  };

  const resetCapture = () => {
    setCapturedPreview("");
    setCapturedSource(null);
    setCameraStatus("Open the camera or use your device photo capture.");
  };

  return (
    <div className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
      <div className="flex flex-wrap gap-3">
        <Button data-testid="camera-start-button" variant="outline" className="border-sky-200" onClick={startCamera}>
          <Camera className="mr-2 h-4 w-4" />
          Open camera
        </Button>
        <Button data-testid="camera-capture-button" className="bg-sky-600 hover:bg-sky-700" onClick={captureFrame}>
          Capture prescription
        </Button>
        <Button data-testid="camera-retake-button" variant="outline" className="border-sky-200" onClick={resetCapture}>
          Retake
        </Button>
        {capturedPreview ? (
          <Button data-testid="camera-use-image-button" variant="outline" className="border-sky-200" onClick={() => onCapture(capturedSource || capturedPreview)}>
            Use captured image
          </Button>
        ) : null}
      </div>
      <label data-testid="camera-device-capture-label" className="mt-4 flex cursor-pointer flex-col gap-2 rounded-3xl border border-dashed border-sky-200 bg-white px-4 py-4 text-sm text-slate-500">
        <span className="font-medium text-slate-900">Use device camera / gallery fallback</span>
        <span>Works when live camera access is blocked on mobile or desktop browsers.</span>
        <input
          data-testid="camera-device-capture-input"
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block w-full text-sm"
          onChange={(event) => handleCapturedFile(event.target.files?.[0])}
        />
      </label>
      <p data-testid="camera-status-text" className="mt-4 text-sm text-slate-500">{cameraStatus}</p>
      <div className="mt-4 overflow-hidden rounded-[1.6rem] bg-slate-950/90">
        {capturedPreview ? (
          <img data-testid="camera-preview-image" src={capturedPreview} alt="Captured prescription" className="h-72 w-full object-contain" />
        ) : (
          <video data-testid="camera-live-preview" ref={videoRef} autoPlay playsInline muted className="h-72 w-full object-cover" />
        )}
      </div>
    </div>
  );
};

const BarcodeScannerCard = ({ token, onAutoAdd }) => {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [active, setActive] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanStatus, setScanStatus] = useState("Start the live scanner, upload a barcode image, or enter the code manually.");
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const handleDetectedCode = async (code) => {
    if (!code) {
      toast.error("Enter or scan a barcode first.");
      return;
    }
    setLastCode(code);
    setBarcodeInput(code);
    setActive(false);
    controlsRef.current?.stop();
    setBarcodeLoading(true);
    setScanStatus("Looking up that barcode...");
    try {
      const response = await apiRequest({ method: "get", url: `/medicines/barcode/${code}`, token });
      setScanStatus(`Barcode found: ${response.item.medicine_name}. Adding it to your medicine list...`);
      await onAutoAdd({
        ...blankMedicine,
        ...response.item,
        source: "barcode",
        barcode: code,
      });
      setScanStatus(`Barcode matched ${response.item.medicine_name}.`);
      toast.success(`Barcode matched ${response.item.medicine_name}`);
    } catch {
      setScanStatus("Barcode lookup failed. Try a clearer image or manual entry.");
      toast.error("Barcode lookup failed.");
    } finally {
      setBarcodeLoading(false);
    }
  };

  useEffect(() => {
    const startScan = async () => {
      if (!active || !videoRef.current) return;
      setScanStatus("Starting live barcode scanner...");
      try {
        const reader = new BrowserMultiFormatReader();
        controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
          if (!result) return;
          await handleDetectedCode(result.getText());
        });
        setScanStatus("Scanner ready. Point the camera at the medicine barcode.");
      } catch {
        setActive(false);
        setScanStatus("Live scanning is unavailable here. Upload a barcode image or enter the code manually.");
        toast.error("Unable to start live barcode scanning.");
      }
    };
    startScan();
    return () => controlsRef.current?.stop();
  }, [active, token]);

  const decodeBarcodeImage = async (file) => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = async () => {
      try {
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromImageElement(image);
        await handleDetectedCode(result.getText());
      } catch {
        setScanStatus("No barcode was detected in that image.");
        toast.error("No barcode found in the uploaded image.");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setScanStatus("That barcode image could not be read.");
      toast.error("Unable to read the uploaded barcode image.");
    };
    image.src = objectUrl;
  };

  return (
    <div className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button data-testid="barcode-start-button" className="bg-sky-600 hover:bg-sky-700" onClick={() => setActive(true)}>
          <ScanLine className="mr-2 h-4 w-4" />
          Start barcode scan
        </Button>
        <Button data-testid="barcode-stop-button" variant="outline" className="border-sky-200" onClick={() => { setActive(false); controlsRef.current?.stop(); }}>
          Stop scan
        </Button>
        {lastCode ? <p data-testid="barcode-last-code" className="text-sm text-slate-500">Last code: {lastCode}</p> : null}
      </div>
      <p data-testid="barcode-status-text" className="mt-4 text-sm text-slate-500">{scanStatus}</p>
      <video data-testid="barcode-video-preview" ref={videoRef} autoPlay playsInline muted className="mt-4 h-72 w-full rounded-[1.6rem] bg-slate-950 object-cover" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label data-testid="barcode-image-upload-label" className="rounded-3xl border border-dashed border-sky-200 bg-white px-4 py-4 text-sm text-slate-500">
          <span className="font-medium text-slate-900">Upload a barcode image</span>
          <input
            data-testid="barcode-image-upload-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="mt-2 block w-full text-sm"
            onChange={(event) => decodeBarcodeImage(event.target.files?.[0])}
          />
        </label>
        <div className="rounded-3xl border border-sky-100 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Manual barcode lookup</p>
          <Input data-testid="barcode-manual-input" className="mt-3" placeholder="Enter barcode digits" value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} />
          <Button data-testid="barcode-manual-lookup-button" className="mt-3 w-full bg-sky-600 hover:bg-sky-700" onClick={() => handleDetectedCode(barcodeInput.trim())} disabled={barcodeLoading}>
            {barcodeLoading ? "Looking up barcode..." : "Lookup barcode"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const RecordsPage = ({ token, records, onAddMedicine, onAddRecord, onDeleteRecord }) => {
  const [recordForm, setRecordForm] = useState(blankRecord);
  const [ocrPreview, setOcrPreview] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Use live speech, record a short voice note, or paste spoken medicine text manually.");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceManualInput, setVoiceManualInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);

  const importText = async (rawText, source) => {
    if (!rawText?.trim()) {
      toast.error("No text found for medicine extraction.");
      return;
    }
    try {
      const response = await apiRequest({ method: "post", url: "/medicines/import-from-text", token, data: { raw_text: rawText, source } });
      toast.success(`${response.items.length} medicine item(s) added`);
      setRecordForm((current) => ({ ...current, prescription_text: rawText }));
      await onAddMedicine(null, true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Import failed");
    }
  };

  const runOcr = async (imageSource, source) => {
    setOcrLoading(true);
    setOcrPreview(typeof imageSource === "string" ? imageSource : URL.createObjectURL(imageSource));
    try {
      const result = await Tesseract.recognize(imageSource, "eng");
      const text = result.data.text.trim();
      setRecordForm((current) => ({ ...current, prescription_image: typeof imageSource === "string" ? imageSource : "", prescription_text: text }));
      await importText(text, source);
    } catch {
      toast.error("OCR could not read that image.");
    } finally {
      setOcrLoading(false);
    }
  };

  const stopVoiceStream = () => {
    voiceStreamRef.current?.getTracks()?.forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const transcribeAudioBlob = async (audioBlob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, audioBlob.type.includes("mp4") ? "voice-note.m4a" : "voice-note.webm");

    setVoiceLoading(true);
    setVoiceStatus("Uploading voice note for transcription...");
    try {
      const response = await apiRequest({ method: "post", url: "/voice/transcribe", token, data: formData });
      setVoiceTranscript(response.transcript);
      setVoiceManualInput(response.transcript);
      setVoiceStatus(`Transcribed with ${response.model}. Medicines are being extracted now.`);
      await importText(response.transcript, "voice");
    } catch (error) {
      setVoiceStatus("Voice note transcription failed. Try again or paste the spoken text manually.");
      toast.error(error.response?.data?.detail || "Unable to transcribe the voice note.");
    } finally {
      setVoiceLoading(false);
    }
  };

  const startVoiceRecognition = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus("Live speech recognition is unavailable in this browser. Use Record voice note instead.");
      toast.error("Live speech recognition is not supported here. Try Record voice note.");
      return;
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((track) => track.stop());
      } catch {
        setVoiceStatus("Microphone permission is blocked. Use Record voice note or paste the spoken text manually.");
        toast.error("Microphone permission is blocked.");
        return;
      }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceStatus("Starting live speech input...");
    recognition.onstart = () => setVoiceStatus("Listening now. Speak the medicine names clearly.");
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setVoiceTranscript(transcript);
      setVoiceManualInput(transcript);
      setVoiceStatus("Speech captured. Importing medicines now.");
      await importText(transcript, "voice");
    };
    recognition.onerror = () => {
      setVoiceStatus("Live speech capture failed. Try Record voice note instead.");
      toast.error("Voice capture failed. Please try the record voice note option.");
    };
    recognition.onend = () => {
      setVoiceStatus((current) => current === "Listening now. Speak the medicine names clearly." ? "Voice capture ended." : current);
    };
    try {
      recognition.start();
    } catch {
      setVoiceStatus("Live speech input could not start. Use Record voice note instead.");
      toast.error("Unable to start live speech input.");
    }
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setVoiceStatus("Finishing voice note...");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceStatus("Audio recording is unavailable in this browser. Paste spoken text manually below.");
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        stopVoiceStream();
        setIsRecording(false);
        setVoiceStatus("Recording failed. Try again or paste the spoken text manually.");
        toast.error("Voice recording failed.");
      };
      recorder.onstop = async () => {
        const voiceBlob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stopVoiceStream();
        if (voiceBlob.size > 0) {
          await transcribeAudioBlob(voiceBlob);
        } else {
          setVoiceStatus("No voice note was captured.");
          toast.error("No voice note was captured.");
        }
      };

      recorder.start();
      setIsRecording(true);
      setVoiceStatus("Recording voice note... Tap again to stop and transcribe.");
    } catch {
      stopVoiceStream();
      setIsRecording(false);
      setVoiceStatus("Microphone permission was blocked. Paste spoken text manually if needed.");
      toast.error("Unable to access the microphone.");
    }
  };

  useEffect(() => stopVoiceStream, []);

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6 lg:p-8">
        <Badge data-testid="records-page-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">Medical records and ingestion tools</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Bring prescriptions into your record flow faster.</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">Capture a prescription with camera, upload a file, scan a barcode, speak medicine names, or read medicine strip text with OCR-assisted recognition.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="border-sky-100 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Prescription scanning suite</CardTitle>
            <CardDescription>Use whichever medicine adding method is most convenient on mobile or desktop.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="camera" className="space-y-5">
              <TabsList className="grid w-full grid-cols-5 rounded-3xl bg-sky-50 p-1">
                <TabsTrigger data-testid="records-tab-camera" value="camera">Camera</TabsTrigger>
                <TabsTrigger data-testid="records-tab-upload" value="upload">Upload</TabsTrigger>
                <TabsTrigger data-testid="records-tab-barcode" value="barcode">Barcode</TabsTrigger>
                <TabsTrigger data-testid="records-tab-voice" value="voice">Voice</TabsTrigger>
                <TabsTrigger data-testid="records-tab-image" value="image">Image AI</TabsTrigger>
              </TabsList>
              <TabsContent value="camera"><CameraCaptureCard onCapture={(image) => runOcr(image, "camera")} /></TabsContent>
              <TabsContent value="upload">
                <div className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                  <Input data-testid="file-upload-input" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && runOcr(event.target.files[0], "upload")} />
                  <p className="mt-3 text-sm text-slate-500">Upload a prescription image and Medi Track will extract medicine names and dosage clues.</p>
                </div>
              </TabsContent>
              <TabsContent value="barcode"><BarcodeScannerCard token={token} onAutoAdd={onAddMedicine} /></TabsContent>
              <TabsContent value="voice">
                <div className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                  <div className="flex flex-wrap gap-3">
                    <Button data-testid="voice-start-button" className="bg-sky-600 hover:bg-sky-700" onClick={startVoiceRecognition} disabled={voiceLoading}>
                      <Mic className="mr-2 h-4 w-4" />
                      Live speech input
                    </Button>
                    <Button data-testid="voice-record-button" variant="outline" className="border-sky-200" onClick={toggleVoiceRecording} disabled={voiceLoading}>
                      <Volume2 className="mr-2 h-4 w-4" />
                      {isRecording ? "Stop recording" : "Record voice note"}
                    </Button>
                  </div>
                  <p data-testid="voice-status-text" className="mt-4 text-sm text-slate-500">{voiceLoading ? "Processing your voice note..." : voiceStatus}</p>
                  <Textarea
                    data-testid="voice-manual-input"
                    className="mt-4"
                    placeholder="Or paste the medicine names you spoke, then import them manually"
                    value={voiceManualInput}
                    onChange={(event) => setVoiceManualInput(event.target.value)}
                  />
                  <Button data-testid="voice-manual-import-button" className="mt-3 bg-sky-600 hover:bg-sky-700" onClick={() => importText(voiceManualInput, "voice")} disabled={voiceLoading}>
                    Import spoken text
                  </Button>
                  {voiceTranscript ? <p data-testid="voice-transcript" className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-600">{voiceTranscript}</p> : null}
                </div>
              </TabsContent>
              <TabsContent value="image">
                <div className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                  <Input data-testid="medicine-image-input" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && runOcr(event.target.files[0], "image")} />
                  <p className="mt-3 text-sm text-slate-500">Upload a medicine strip or tablet packaging image to identify printed medicine details and add them automatically.</p>
                </div>
              </TabsContent>
            </Tabs>
            <div className="mt-5 rounded-3xl border border-sky-100 bg-sky-50/80 p-4">
              <p className="text-sm font-semibold text-slate-900">OCR processing</p>
              <p data-testid="ocr-processing-status" className="mt-2 text-sm text-slate-500">{ocrLoading ? "Extracting prescription text..." : "Ready for camera, upload, barcode, voice, or medicine strip processing."}</p>
              {ocrPreview ? <img data-testid="ocr-preview-image" src={ocrPreview} alt="OCR preview" className="mt-4 h-48 w-full rounded-[1.6rem] object-cover" /> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-sky-100 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Add medical record</CardTitle>
            <CardDescription>Store history, prescription text, and treatment details for future reference.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input data-testid="record-title-input" placeholder="Record title" value={recordForm.title} onChange={(event) => setRecordForm((current) => ({ ...current, title: event.target.value }))} />
            <Input data-testid="record-type-input" placeholder="Record type (prescription, lab, history)" value={recordForm.report_type} onChange={(event) => setRecordForm((current) => ({ ...current, report_type: event.target.value }))} />
            <Textarea data-testid="record-treatment-input" placeholder="Past treatments or main findings" value={recordForm.past_treatments} onChange={(event) => setRecordForm((current) => ({ ...current, past_treatments: event.target.value }))} />
            <Textarea data-testid="record-notes-input" placeholder="Additional notes" value={recordForm.notes} onChange={(event) => setRecordForm((current) => ({ ...current, notes: event.target.value }))} />
            <Textarea data-testid="record-prescription-text-input" placeholder="Detected prescription text" value={recordForm.prescription_text} onChange={(event) => setRecordForm((current) => ({ ...current, prescription_text: event.target.value }))} />
            <Button data-testid="record-submit-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={() => onAddRecord(recordForm, () => setRecordForm(blankRecord))}>
              <ClipboardPlus className="mr-2 h-4 w-4" />
              Save record
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>Stored medical history</CardTitle>
          <CardDescription>Every prescription and treatment note stays grouped for future doctor consultations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {records.length ? (
            records.map((record) => (
              <div key={record.id} data-testid={`record-card-${record.id}`} className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{record.title}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-500">{record.past_treatments}</p>
                  </div>
                  <Button data-testid={`record-delete-button-${record.id}`} variant="outline" className="border-red-200 text-red-600" onClick={() => onDeleteRecord(record.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
                {record.prescription_text ? <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">OCR text: {record.prescription_text}</p> : null}
              </div>
            ))
          ) : (
            <EmptyState testId="records-empty-state" icon={FileText} title="No records saved yet" description="Scan a prescription or add a treatment summary to start building your medical history." />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const SharingPage = ({ reports, onCreateReport }) => {
  const [form, setForm] = useState({ doctor_name: "", doctor_email: "", notes: "" });

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6 lg:p-8">
        <Badge data-testid="sharing-page-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">Doctor collaboration</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Generate clean summaries for consultations.</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">Build a shareable report that combines your medicine list, alerts, and medical history, then export it as a PDF for your doctor.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
        <Card className="border-sky-100 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Create report</CardTitle>
            <CardDescription>Prepare a doctor-ready summary in one click.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input data-testid="doctor-name-input" placeholder="Doctor name" value={form.doctor_name} onChange={(event) => setForm((current) => ({ ...current, doctor_name: event.target.value }))} />
            <Input data-testid="doctor-email-input" placeholder="Doctor email" value={form.doctor_email} onChange={(event) => setForm((current) => ({ ...current, doctor_email: event.target.value }))} />
            <Textarea data-testid="doctor-notes-input" placeholder="Notes to include" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <Button data-testid="generate-report-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={() => onCreateReport(form, () => setForm({ doctor_name: "", doctor_email: "", notes: "" }))}>
              <Share2 className="mr-2 h-4 w-4" />
              Generate shareable report
            </Button>
          </CardContent>
        </Card>

        <Card className="border-sky-100 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Shared report history</CardTitle>
            <CardDescription>Track every report you generated for doctors or care teams.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reports.length ? (
              reports.map((report) => {
                const shareUrl = `${window.location.origin}/report/${report.share_token}`;
                return (
                  <div key={report.id} data-testid={`report-card-${report.id}`} className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">{report.doctor_name}</p>
                        <p className="mt-1 text-sm text-slate-500">{report.doctor_email}</p>
                        <p className="mt-3 text-sm leading-7 text-slate-500">{report.notes || "No note added."}</p>
                      </div>
                      <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">{new Date(report.created_at).toLocaleDateString()}</Badge>
                    </div>
                    <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
                      <span className="font-medium text-slate-900">Share URL:</span> {shareUrl}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button data-testid={`copy-share-link-button-${report.id}`} variant="outline" className="border-sky-200" onClick={() => copyTextToClipboard(shareUrl)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Copy link
                      </Button>
                      <Button data-testid={`download-report-button-${report.id}`} className="bg-sky-600 hover:bg-sky-700" onClick={() => makePdf(report, `medi-track-report-${report.id}.pdf`)}>
                        <FileBadge className="mr-2 h-4 w-4" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState testId="reports-empty-state" icon={Share2} title="No reports shared yet" description="Generate a report to prepare for your next doctor discussion." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ProfilePage = ({ user, profileForm, setProfileForm, onSaveProfile, onDeleteAccount }) => (
  <div className="space-y-6">
    <section className="glass-panel p-6 lg:p-8">
      <Badge data-testid="profile-page-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">Patient profile</Badge>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Your identity, settings, and account control.</h1>
      <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">Update the details your doctor needs most often: name, age, blood group, photo, and secure account settings.</p>
    </section>

    <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardContent className="p-6 text-center">
          <img data-testid="profile-avatar-image" src={profileForm.profile_photo || user.profile_photo} alt={user.name} className="mx-auto h-28 w-28 rounded-full object-cover shadow-lg" />
          <h2 data-testid="profile-name-display" className="mt-4 text-2xl font-semibold text-slate-900">{user.name}</h2>
          <p data-testid="profile-email-display" className="mt-1 text-sm text-slate-500">{user.email}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge data-testid="profile-blood-group-display" className="bg-sky-100 text-sky-700 hover:bg-sky-100">{user.blood_group}</Badge>
            <Badge data-testid="profile-role-display" variant="outline" className="border-sky-200 text-sky-700">{user.role}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>Account settings</CardTitle>
          <CardDescription>Edit your personal details and manage account access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input data-testid="profile-name-input" placeholder="Full name" value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} />
            <Input data-testid="profile-age-input" type="number" placeholder="Age" value={profileForm.age} onChange={(event) => setProfileForm((current) => ({ ...current, age: event.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input data-testid="profile-blood-group-input" placeholder="Blood group" value={profileForm.blood_group} onChange={(event) => setProfileForm((current) => ({ ...current, blood_group: event.target.value }))} />
            <Input data-testid="profile-phone-input" placeholder="Phone" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} />
          </div>
          <Input data-testid="profile-photo-input" placeholder="Profile photo URL" value={profileForm.profile_photo} onChange={(event) => setProfileForm((current) => ({ ...current, profile_photo: event.target.value }))} />
          <Button data-testid="profile-save-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={onSaveProfile}>
            Save profile
          </Button>
          <Button data-testid="profile-delete-button" variant="outline" className="w-full border-red-200 text-red-600" onClick={onDeleteAccount}>
            Delete account
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
);

const AdminPage = ({ user, adminData, onAddRule }) => {
  const [ruleForm, setRuleForm] = useState({ medicines: "", severity_level: "moderate", explanation: "", safety_recommendation: "", organ_effects: "" });

  if (user.role !== "admin") {
    return <EmptyState testId="admin-access-locked" icon={ShieldPlus} title="Admin view is restricted" description="Sign in with the seeded admin account to manage users, system alerts, and interaction rules." />;
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6 lg:p-8">
        <Badge data-testid="admin-page-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">System control center</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Monitor platform usage and medicine safety rules.</h1>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard testId="admin-stat-users" title="Users" value={adminData.summary?.users || 0} helper="Registered accounts" icon={UserCircle} />
        <StatCard testId="admin-stat-medicines" title="Medicines" value={adminData.summary?.medicines || 0} helper="Tracked medicine entries" icon={Pill} />
        <StatCard testId="admin-stat-alerts" title="Alerts" value={adminData.summary?.alerts || 0} helper="Stored interaction warnings" icon={AlertTriangle} />
        <StatCard testId="admin-stat-reports" title="Reports" value={adminData.summary?.reports || 0} helper="Doctor reports generated" icon={Share2} />
        <StatCard testId="admin-stat-safety" title="Safety index" value={`${adminData.summary?.safety_index || 0}%`} helper="High-level trust indicator" icon={Activity} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <Card className="border-sky-100 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Recent users</CardTitle>
            <CardDescription>Quick access to new signups and account metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {adminData.users?.map((entry) => (
              <div key={entry.id} data-testid={`admin-user-row-${entry.id}`} className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{entry.name}</p>
                    <p className="text-sm text-slate-500">{entry.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">{entry.role}</Badge>
                    <Badge variant="outline" className="border-sky-200 text-sky-700">{entry.blood_group}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-sky-100 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Add interaction rule</CardTitle>
            <CardDescription>Expand the local safety database with new medicine combinations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input data-testid="admin-rule-medicines-input" placeholder="Medicines, comma separated" value={ruleForm.medicines} onChange={(event) => setRuleForm((current) => ({ ...current, medicines: event.target.value }))} />
            <Input data-testid="admin-rule-severity-input" placeholder="Severity (mild, moderate, severe)" value={ruleForm.severity_level} onChange={(event) => setRuleForm((current) => ({ ...current, severity_level: event.target.value }))} />
            <Textarea data-testid="admin-rule-explanation-input" placeholder="Explanation" value={ruleForm.explanation} onChange={(event) => setRuleForm((current) => ({ ...current, explanation: event.target.value }))} />
            <Textarea data-testid="admin-rule-recommendation-input" placeholder="Safety recommendation" value={ruleForm.safety_recommendation} onChange={(event) => setRuleForm((current) => ({ ...current, safety_recommendation: event.target.value }))} />
            <Input data-testid="admin-rule-organ-effects-input" placeholder="Organ effects" value={ruleForm.organ_effects} onChange={(event) => setRuleForm((current) => ({ ...current, organ_effects: event.target.value }))} />
            <Button data-testid="admin-rule-submit-button" className="w-full bg-sky-600 hover:bg-sky-700" onClick={() => onAddRule({ ...ruleForm, medicines: ruleForm.medicines.split(",").map((item) => item.trim()).filter(Boolean) }, () => setRuleForm({ medicines: "", severity_level: "moderate", explanation: "", safety_recommendation: "", organ_effects: "" }))}>
              Save interaction rule
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-sky-100 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>Interaction database</CardTitle>
          <CardDescription>Current static rules feeding the immediate safety engine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {adminData.rules?.map((rule) => (
            <div key={rule.id} data-testid={`admin-rule-card-${rule.id}`} className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{rule.medicines.join(" + ")}</p>
                <Badge className={severityStyles[rule.severity_level] || severityStyles.mild}>{rule.severity_level}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-500">{rule.explanation}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

const PublicReportPage = () => {
  const { token } = useParams();
  const [report, setReport] = useState(null);

  useEffect(() => {
    const loadReport = async () => {
      try {
        const response = await apiRequest({ method: "get", url: `/public/reports/${token}` });
        setReport(response.report);
      } catch {
        toast.error("Shared report could not be loaded.");
      }
    };
    loadReport();
  }, [token]);

  if (!report) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><LoaderCircle className="h-6 w-6 animate-spin text-sky-600" /></div>;
  }

  const payload = report.payload;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.65),_transparent_30%),linear-gradient(180deg,_#f7fdff_0%,_#eff7ff_45%,_#ffffff_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="glass-panel p-6 lg:p-8">
          <Badge data-testid="public-report-badge" className="bg-sky-100 text-sky-700 hover:bg-sky-100">Shared medical report</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Patient summary for {report.doctor_name}</h1>
          <p data-testid="public-report-patient-name" className="mt-4 text-base leading-8 text-slate-600 md:text-lg">Patient: {payload.user?.name} • Email: {payload.user?.email} • Blood Group: {payload.user?.blood_group}</p>
          <div className="mt-6">
            <Button data-testid="public-report-download-button" className="bg-sky-600 hover:bg-sky-700" onClick={() => makePdf(report, `shared-report-${report.id}.pdf`)}>
              <FileBadge className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-sky-100 bg-white/90"><CardContent className="p-5"><p className="text-sm text-slate-500">Medicines</p><p className="mt-2 text-3xl font-semibold text-slate-900">{payload.medicines?.length || 0}</p></CardContent></Card>
          <Card className="border-sky-100 bg-white/90"><CardContent className="p-5"><p className="text-sm text-slate-500">Alerts</p><p className="mt-2 text-3xl font-semibold text-slate-900">{payload.alerts?.length || 0}</p></CardContent></Card>
          <Card className="border-sky-100 bg-white/90"><CardContent className="p-5"><p className="text-sm text-slate-500">Records</p><p className="mt-2 text-3xl font-semibold text-slate-900">{payload.records?.length || 0}</p></CardContent></Card>
        </div>
        <Card className="border-sky-100 bg-white/90">
          <CardHeader><CardTitle>Medicines</CardTitle></CardHeader>
          <CardContent className="space-y-3">{payload.medicines?.map((medicine) => <div key={medicine.id} className="rounded-3xl border border-sky-100 bg-slate-50/90 p-4"><p className="font-semibold text-slate-900">{medicine.medicine_name}</p><p className="mt-1 text-sm text-slate-500">{medicine.dosage} • {medicine.frequency}</p></div>)}</CardContent>
        </Card>
      </div>
    </div>
  );
};

const ProtectedApp = ({ token, user, onLogout, onSessionChange }) => {
  const [dashboard, setDashboard] = useState({ summary: {}, medicines: [], alerts: [], records: [], reminders: [], user });
  const [reports, setReports] = useState([]);
  const [records, setRecords] = useState([]);
  const [profileForm, setProfileForm] = useState({ ...blankProfile, ...user });
  const [medicineForm, setMedicineForm] = useState(blankMedicine);
  const [adminData, setAdminData] = useState({ summary: {}, users: [], rules: [] });
  const location = useLocation();

  const refreshData = async () => {
    try {
      const requests = [
        apiRequest({ method: "get", url: "/dashboard", token }),
        apiRequest({ method: "get", url: "/records", token }),
        apiRequest({ method: "get", url: "/reports", token }),
      ];
      if (user.role === "admin") {
        requests.push(apiRequest({ method: "get", url: "/admin/overview", token }));
      }
      const [dashboardResponse, recordsResponse, reportsResponse, adminResponse] = await Promise.all(requests);
      setDashboard(dashboardResponse);
      setRecords(recordsResponse.items || []);
      setReports(reportsResponse.items || []);
      setProfileForm({ ...blankProfile, ...dashboardResponse.user });
      await cacheData("meditrack-dashboard", dashboardResponse);
      await cacheData("meditrack-records", recordsResponse.items || []);
      await cacheData("meditrack-reports", reportsResponse.items || []);
      if (adminResponse) {
        setAdminData(adminResponse);
        await cacheData("meditrack-admin", adminResponse);
      }
    } catch {
      const [cachedDashboard, cachedRecords, cachedReports, cachedAdmin] = await Promise.all([
        readCachedData("meditrack-dashboard"),
        readCachedData("meditrack-records"),
        readCachedData("meditrack-reports"),
        readCachedData("meditrack-admin"),
      ]);
      if (cachedDashboard) setDashboard(cachedDashboard);
      if (cachedRecords) setRecords(cachedRecords);
      if (cachedReports) setReports(cachedReports);
      if (cachedAdmin) setAdminData(cachedAdmin);
      toast.info("Loaded cached health data for offline use.");
    }
  };

  useEffect(() => {
    refreshData();
  }, [token, user.role]);

  useEffect(() => {
    if (!("Notification" in window) || !dashboard.medicines?.length) return;
    Notification.requestPermission();
    const interval = window.setInterval(() => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      dashboard.medicines.forEach((medicine) => {
        if (medicine.reminder_times?.includes(currentTime) && Notification.permission === "granted") {
          new Notification(`Time for ${medicine.medicine_name}`, {
            body: `${medicine.dosage} • ${medicine.frequency}`,
          });
        }
      });
    }, 60000);
    return () => window.clearInterval(interval);
  }, [dashboard.medicines]);

  const addMedicine = async (payload, refreshOnly = false) => {
    if (refreshOnly) {
      await refreshData();
      return;
    }
    try {
      await apiRequest({ method: "post", url: "/medicines", token, data: payload });
      toast.success("Medicine added and interactions refreshed.");
      setMedicineForm(blankMedicine);
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not add medicine.");
    }
  };

  const markTaken = async (medicineId) => {
    try {
      await apiRequest({ method: "post", url: `/medicines/${medicineId}/mark-taken`, token });
      toast.success("Medicine marked as taken.");
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Unable to mark medicine as taken.");
    }
  };

  const deleteMedicine = async (medicineId) => {
    try {
      await apiRequest({ method: "delete", url: `/medicines/${medicineId}`, token });
      toast.success("Medicine removed.");
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Unable to remove medicine.");
    }
  };

  const addRecord = async (payload, onDone) => {
    try {
      await apiRequest({ method: "post", url: "/records", token, data: payload });
      toast.success("Medical record saved.");
      onDone?.();
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save record.");
    }
  };

  const deleteRecord = async (recordId) => {
    try {
      await apiRequest({ method: "delete", url: `/records/${recordId}`, token });
      toast.success("Record deleted.");
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Unable to delete record.");
    }
  };

  const createReport = async (payload, onDone) => {
    try {
      await apiRequest({ method: "post", url: "/reports", token, data: payload });
      toast.success("Doctor report generated.");
      onDone?.();
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not generate report.");
    }
  };

  const saveProfile = async () => {
    try {
      const response = await apiRequest({ method: "put", url: "/profile", token, data: { ...profileForm, age: Number(profileForm.age) } });
      onSessionChange(token, response.profile);
      toast.success("Profile updated.");
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save profile.");
    }
  };

  const deleteAccount = async () => {
    try {
      await apiRequest({ method: "delete", url: "/auth/account", token });
      toast.success("Account deleted.");
      onLogout();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Unable to delete account.");
    }
  };

  const addRule = async (payload, onDone) => {
    try {
      await apiRequest({ method: "post", url: "/admin/interaction-rules", token, data: payload });
      toast.success("Interaction rule saved.");
      onDone?.();
      await refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Unable to save interaction rule.");
    }
  };

  const currentPage = useMemo(() => {
    if (location.pathname === "/app/records") {
      return <RecordsPage token={token} records={records} onAddMedicine={addMedicine} onAddRecord={addRecord} onDeleteRecord={deleteRecord} />;
    }
    if (location.pathname === "/app/sharing") {
      return <SharingPage reports={reports} onCreateReport={createReport} />;
    }
    if (location.pathname === "/app/profile") {
      return <ProfilePage user={user} profileForm={profileForm} setProfileForm={setProfileForm} onSaveProfile={saveProfile} onDeleteAccount={deleteAccount} />;
    }
    if (location.pathname === "/app/admin") {
      return <AdminPage user={user} adminData={adminData} onAddRule={addRule} />;
    }
    return <DashboardPage dashboard={dashboard} medicineForm={medicineForm} setMedicineForm={setMedicineForm} onAddMedicine={addMedicine} onMarkTaken={markTaken} onDeleteMedicine={deleteMedicine} />;
  }, [location.pathname, token, records, reports, user, profileForm, dashboard, medicineForm, adminData]);

  return (
    <Shell user={user} onLogout={onLogout}>
      {currentPage}
      <HealthChat token={token} />
    </Shell>
  );
};

export const MediTrackApp = () => {
  const [token, setToken] = useState(localStorage.getItem("meditrack-token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("meditrack-user");
    return raw ? JSON.parse(raw) : null;
  });

  const handleSessionChange = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    setAuthToken(nextToken);
    localStorage.setItem("meditrack-token", nextToken);
    localStorage.setItem("meditrack-user", JSON.stringify(nextUser));
  };

  const logout = () => {
    setToken("");
    setUser(null);
    setAuthToken("");
    localStorage.removeItem("meditrack-token");
    localStorage.removeItem("meditrack-user");
  };

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={token && user ? <Navigate to="/app/dashboard" replace /> : <LandingPage />} />
        <Route path="/auth" element={token && user ? <Navigate to="/app/dashboard" replace /> : <AuthPage onAuthSuccess={handleSessionChange} />} />
        <Route path="/report/:token" element={<PublicReportPage />} />
        <Route path="/app/dashboard" element={token && user ? <ProtectedApp token={token} user={user} onLogout={logout} onSessionChange={handleSessionChange} /> : <Navigate to="/auth" replace />} />
        <Route path="/app/records" element={token && user ? <ProtectedApp token={token} user={user} onLogout={logout} onSessionChange={handleSessionChange} /> : <Navigate to="/auth" replace />} />
        <Route path="/app/sharing" element={token && user ? <ProtectedApp token={token} user={user} onLogout={logout} onSessionChange={handleSessionChange} /> : <Navigate to="/auth" replace />} />
        <Route path="/app/profile" element={token && user ? <ProtectedApp token={token} user={user} onLogout={logout} onSessionChange={handleSessionChange} /> : <Navigate to="/auth" replace />} />
        <Route path="/app/admin" element={token && user ? <ProtectedApp token={token} user={user} onLogout={logout} onSessionChange={handleSessionChange} /> : <Navigate to="/auth" replace />} />
      </Routes>
    </BrowserRouter>
  );
};