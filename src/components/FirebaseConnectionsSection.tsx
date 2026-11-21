import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Edit3,
  Info,
  KeyRound,
  LogOut,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  ConnectionStatusCode,
  containsSensitiveSecret,
  DATABASE_ROLE_META,
  DatabaseRole,
  FirebaseProjectConfig,
  generateRulesTemplateForProject,
  getAllFirebaseProjects,
  getProjectAuthUser,
  getProjectConnectionState,
  getRoleAssignments,
  getSecondaryConfiguredProjects,
  getUserDisplayEmail,
  isConfiguredProject,
  isValidFirestoreDatabaseId,
  parseFirebaseSdkSnippet,
  ProjectConnectionState,
  reassignProjectRolesToPrimary,
  removeRuntimeFirebaseProject,
  setRoleAssignment,
  signInToProject,
  signOutFromProject,
  subscribeManagerUpdates,
  testAllProjectConnections,
  testProjectConnection,
  toggleFirebaseProjectEnabled,
  upsertRuntimeFirebaseProject,
} from '../lib/multiFirebaseManager';
import { MultiFirebaseLoginModal } from './MultiFirebaseLoginModal';

const ALL_ROLES: DatabaseRole[] = ['users', 'catalog', 'transactions', 'engagement', 'admin'];

function getStatusBadge(state: ProjectConnectionState): {
  label: string;
  tone: string;
  icon: React.ReactNode;
} {
  const map: Record<ConnectionStatusCode, { label: string; tone: string; icon: React.ReactNode }> = {
    connected: {
      label: state.latencyMs !== undefined ? `সংযুক্ত (${state.latencyMs}ms)` : 'সংযুক্ত',
      tone: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />,
    },
    testing: {
      label: 'যাচাই হচ্ছে...',
      tone: 'bg-sky-50 text-sky-800 border-sky-200',
      icon: <RefreshCw className="w-3.5 h-3.5 text-sky-700 animate-spin" />,
    },
    idle: {
      label: 'প্রস্তুত (পরীক্ষিত নয়)',
      tone: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      icon: <Activity className="w-3.5 h-3.5 text-zinc-500" />,
    },
    unconfigured: {
      label: 'কনফিগার প্রয়োজন',
      tone: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: <Info className="w-3.5 h-3.5 text-amber-700" />,
    },
    disabled: {
      label: 'নিষ্ক্রিয়',
      tone: 'bg-zinc-100 text-zinc-500 border-zinc-200',
      icon: <Power className="w-3.5 h-3.5 text-zinc-400" />,
    },
    quota_exceeded: {
      label: 'কোটা শেষ',
      tone: 'bg-amber-50 text-amber-900 border-amber-300',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />,
    },
    permission_denied: {
      label: 'অনুমতি নেই (Rules)',
      tone: 'bg-rose-50 text-rose-800 border-rose-200',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-700" />,
    },
    offline: {
      label: 'অফলাইন',
      tone: 'bg-rose-50 text-rose-800 border-rose-200',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-700" />,
    },
    error: {
      label: 'ত্রুটি',
      tone: 'bg-rose-50 text-rose-800 border-rose-200',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-700" />,
    },
  };
  return map[state.status] ?? map.error;
}

export const FirebaseConnectionsSection: React.FC = () => {
  const [projects, setProjects] = useState<FirebaseProjectConfig[]>(() => getAllFirebaseProjects());
  const [roleMap, setRoleMap] = useState<Record<DatabaseRole, string>>(() => getRoleAssignments());
  const [tick, setTick] = useState(0);
  const [testingAll, setTestingAll] = useState(false);
  const [signingInKey, setSigningInKey] = useState<string | null>(null);
  const [copiedRulesKey, setCopiedRulesKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);
  const [loginPanelFocusKey, setLoginPanelFocusKey] = useState<string | null>(null);

  // Add / Edit Project Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [snippetInput, setSnippetInput] = useState('');
  const [snippetStatus, setSnippetStatus] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [projectIdInput, setProjectIdInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [authDomainInput, setAuthDomainInput] = useState('');
  const [storageBucketInput, setStorageBucketInput] = useState('');
  const [messagingSenderIdInput, setMessagingSenderIdInput] = useState('');
  const [appIdInput, setAppIdInput] = useState('');
  const [databaseIdInput, setDatabaseIdInput] = useState('(default)');
  const [enabledInput, setEnabledInput] = useState(true);

  useEffect(() => {
    const sync = () => {
      setProjects(getAllFirebaseProjects());
      setRoleMap(getRoleAssignments());
      setTick((t) => t + 1);
    };
    sync();
    return subscribeManagerUpdates(sync);
  }, []);

  const rolesByProject = useMemo(() => {
    const map: Record<string, DatabaseRole[]> = {};
    (Object.keys(roleMap) as DatabaseRole[]).forEach((role) => {
      const targetId = roleMap[role];
      if (!map[targetId]) map[targetId] = [];
      map[targetId].push(role);
    });
    return map;
  }, [roleMap, tick]);

  const unsignedSecondaryCount = useMemo(() => {
    return getSecondaryConfiguredProjects().filter((p) => !getProjectAuthUser(p.id)).length;
  }, [projects, tick]);

  const handleApplySdkSnippet = (raw: string) => {
    setSnippetInput(raw);
    setSnippetStatus('');
    if (!raw.trim()) return;
    try {
      const parsed = parseFirebaseSdkSnippet(raw);
      if (parsed.projectId) setProjectIdInput(parsed.projectId);
      if (parsed.apiKey) setApiKeyInput(parsed.apiKey);
      if (parsed.authDomain) setAuthDomainInput(parsed.authDomain);
      if (parsed.storageBucket) setStorageBucketInput(parsed.storageBucket);
      if (parsed.messagingSenderId) setMessagingSenderIdInput(parsed.messagingSenderId);
      if (parsed.appId) setAppIdInput(parsed.appId);
      setDatabaseIdInput('(default)');
      setSnippetStatus('Firebase SDK কনফিগারেশন স্বয়ংক্রিয়ভাবে পূরণ হয়েছে!');
    } catch (err) {
      setSnippetStatus(err instanceof Error ? err.message : 'কনফিগ পার্স করা যায়নি।');
    }
  };

  const openAddForm = () => {
    const nextNum = projects.length + 1;
    setEditingKey(null);
    setSnippetInput('');
    setSnippetStatus('');
    setLabelInput(`Firebase ${nextNum}`);
    setProjectIdInput('');
    setApiKeyInput('');
    setAuthDomainInput('');
    setStorageBucketInput('');
    setMessagingSenderIdInput('');
    setAppIdInput('');
    setDatabaseIdInput('(default)');
    setEnabledInput(true);
    setFeedback(null);
    setFormOpen(true);
  };

  const openEditForm = (proj: FirebaseProjectConfig) => {
    setEditingKey(proj.id);
    setSnippetInput('');
    setSnippetStatus('');
    setLabelInput(proj.label);
    setProjectIdInput(proj.projectId);
    setApiKeyInput(proj.apiKey);
    setAuthDomainInput(proj.authDomain);
    setStorageBucketInput(proj.storageBucket);
    setMessagingSenderIdInput(proj.messagingSenderId);
    setAppIdInput(proj.appId);
    setDatabaseIdInput(proj.firestoreDatabaseId || '(default)');
    setEnabledInput(isConfiguredProject(proj) ? proj.enabled : true);
    setFeedback(null);
    setFormOpen(true);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const payload = {
      id: editingKey || `project_${Date.now()}`,
      label: labelInput.trim(),
      projectId: projectIdInput.trim(),
      apiKey: apiKeyInput.trim(),
      authDomain: authDomainInput.trim() || `${projectIdInput.trim()}.firebaseapp.com`,
      storageBucket: storageBucketInput.trim() || `${projectIdInput.trim()}.firebasestorage.app`,
      messagingSenderId: messagingSenderIdInput.trim(),
      appId: appIdInput.trim(),
      firestoreDatabaseId: databaseIdInput.trim() || '(default)',
      enabled: editingKey === 'project_1' ? true : enabledInput,
    };

    if (containsSensitiveSecret(payload)) {
      setFeedback({
        type: 'err',
        text: 'নিরাপত্তার কারণে Service Account JSON বা Private Key এখানে প্রবেশ করানো নিষিদ্ধ। শুধুমাত্র পাবলিক Web SDK কনফিগারেশন দিন।',
      });
      return;
    }

    if (!payload.projectId || !payload.apiKey || !payload.appId) {
      setFeedback({
        type: 'err',
        text: 'Project ID, Web API Key এবং App ID অবশ্যই পূরণ করতে হবে।',
      });
      return;
    }

    if (!isValidFirestoreDatabaseId(payload.firestoreDatabaseId)) {
      setFeedback({
        type: 'err',
        text: 'Firestore Database ID-এর ঘরে Realtime Database URL (firebaseio.com) বা ভুল অক্ষর দেবেন না। সাধারণত এটি "(default)" রাখুন।',
      });
      return;
    }

    try {
      const saved = upsertRuntimeFirebaseProject(payload);
      setFormOpen(false);
      setFeedback({
        type: 'ok',
        text: `"${saved.label}" (${saved.projectId}) সংরক্ষিত হয়েছে — স্বয়ংক্রিয়ভাবে সংযোগ পরীক্ষা ও লগইন প্যানেল চালু হচ্ছে।`,
      });
      if (saved.enabled) {
        void testProjectConnection(saved.id);
      }
      if (saved.id !== 'project_1' && saved.enabled && !getProjectAuthUser(saved.id)) {
        setLoginPanelFocusKey(saved.id);
        setLoginPanelOpen(true);
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'কনফিগারেশন সংরক্ষণ করা যায়নি।',
      });
    }
  };

  const handleRoleChange = (role: DatabaseRole, targetProjectKey: string) => {
    setFeedback(null);
    const target = projects.find((p) => p.id === targetProjectKey);
    if (target && (!target.enabled || !isConfiguredProject(target))) {
      setFeedback({
        type: 'err',
        text: `"${target.label}" এখনো কনফিগার বা সক্রিয় করা হয়নি। প্রথমে বৈধ কনফিগারেশন দিয়ে Enable করুন।`,
      });
      return;
    }
    try {
      setRoleAssignment(role, targetProjectKey);
      setFeedback({
        type: 'ok',
        text: `"${DATABASE_ROLE_META[role].labelBn}" রোলটি সফলভাবে "${target?.label || targetProjectKey}"-এ যুক্ত হয়েছে।`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'রোল পরিবর্তন করা যায়নি।',
      });
    }
  };

  const handleTestOne = async (projectKey: string) => {
    setFeedback(null);
    await testProjectConnection(projectKey);
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    setFeedback(null);
    try {
      await testAllProjectConnections();
    } finally {
      setTestingAll(false);
    }
  };

  const handleToggleEnabled = (proj: FirebaseProjectConfig) => {
    setFeedback(null);
    try {
      toggleFirebaseProjectEnabled(proj.id, !proj.enabled);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'স্ট্যাটাস পরিবর্তন করা যায়নি।',
      });
    }
  };

  const handleRemoveProject = (proj: FirebaseProjectConfig) => {
    setFeedback(null);
    try {
      removeRuntimeFirebaseProject(proj.id);
      setFeedback({
        type: 'ok',
        text: `"${proj.label}" প্রজেক্টটি সরানো হয়েছে এবং এর রোলসমূহ প্রাইমারি প্রজেক্টে ফেরত এসেছে।`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'প্রজেক্ট সরানো যায়নি।',
      });
    }
  };

  const handleGoogleSignInForProject = async (proj: FirebaseProjectConfig) => {
    setFeedback(null);
    if (!isConfiguredProject(proj)) {
      openEditForm(proj);
      setFeedback({
        type: 'err',
        text: `"${proj.label}" এখনো কনফিগার করা হয়নি। নিচের ফর্মে আপনার Firebase SDK Config পেস্ট করে সংরক্ষণ করুন — সাথে সাথেই Google সাইন-ইন পপ-আপ চলে আসবে!`,
      });
      return;
    }

    setSigningInKey(proj.id);
    try {
      if (!proj.enabled && proj.id !== 'project_1') {
        toggleFirebaseProjectEnabled(proj.id, true);
      }
      const user = await signInToProject(proj.id);
      const email = getUserDisplayEmail(user) || user.uid;
      setFeedback({
        type: 'ok',
        text: `"${proj.label}"-এ ${email} দিয়ে Google সাইন-ইন সম্পন্ন হয়েছে।`,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : 'সাইন-ইন ব্যর্থ হয়েছে।';
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setFeedback({
          type: 'err',
          text: `"${proj.projectId}"-এর Firebase Console → Authentication → Settings → Authorized domains-এ এই ডোমেইনটি (${window.location.hostname}) যোগ করুন।`,
          actionUrl: `https://console.firebase.google.com/project/${proj.projectId}/authentication/settings`,
          actionLabel: 'Authorized Domains খুলুন',
        });
      } else if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        setFeedback({
          type: 'err',
          text: `"${proj.projectId}"-এর Firebase Console → Authentication → Sign-in method-এ গিয়ে Google প্রোভাইডারটি Enable করুন।`,
          actionUrl: `https://console.firebase.google.com/project/${proj.projectId}/authentication/providers`,
          actionLabel: 'Google Auth Enable করুন',
        });
      } else if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        setFeedback({
          type: 'err',
          text: 'ব্রাউজার পপ-আপ উইন্ডো ব্লক করেছে। পপ-আপ Allow করে আবার "Google সাইন-ইন" চাপুন।',
        });
      } else if (code === 'auth/popup-closed-by-user') {
        setFeedback({
          type: 'err',
          text: 'গুগল লগইন পপ-আপ সম্পন্ন হওয়ার আগেই বন্ধ করা হয়েছে। আবার চেষ্টা করুন।',
        });
      } else {
        setFeedback({
          type: 'err',
          text: `"${proj.label}"-এ সাইন-ইন করা যায়নি (${msg})।`,
        });
      }
    } finally {
      setSigningInKey(null);
    }
  };

  const handleSecondarySignOut = async (proj: FirebaseProjectConfig) => {
    setFeedback(null);
    try {
      await signOutFromProject(proj.id);
      setFeedback({
        type: 'ok',
        text: `"${proj.label}" থেকে সাইন-আউট করা হয়েছে।`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'সাইন-আউট করা যায়নি।',
      });
    }
  };

  const handleCopyProjectRules = async (
    proj: FirebaseProjectConfig,
    assignedRoles: DatabaseRole[]
  ) => {
    const rolesToInclude: DatabaseRole[] =
      assignedRoles.length > 0 ? assignedRoles : ['transactions'];
    const rulesText = generateRulesTemplateForProject(rolesToInclude);
    try {
      await navigator.clipboard.writeText(rulesText);
      setCopiedRulesKey(proj.id);
      setTimeout(() => setCopiedRulesKey((prev) => (prev === proj.id ? null : prev)), 2500);
      setFeedback({
        type: 'ok',
        text: `"${proj.label}" (${proj.projectId})-এর জন্য তৈরি Firestore Rules কপি হয়েছে। Firebase Console → Firestore → Rules-এ পেস্ট করে Publish করুন।`,
      });
    } catch {
      setFeedback({
        type: 'err',
        text: 'ক্লিপবোর্ডে কপি করা যায়নি। MULTI_FIREBASE_SETUP.md থেকে রুলস কপি করুন।',
      });
    }
  };

  const handleReassignToPrimary = (proj: FirebaseProjectConfig) => {
    setFeedback(null);
    const moved = reassignProjectRolesToPrimary(proj.id);
    if (moved.length > 0) {
      setFeedback({
        type: 'ok',
        text: `"${proj.label}"-এর রোলসমূহ (${moved.join(', ')}) নিরাপদভাবে Firebase 1-এ ফিরিয়ে নেওয়া হয়েছে।`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-700" />
            <span>মাল্টি-ফায়ারবেস ও ডাটাবেস সংযোগ ব্যবস্থাপনা</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            একই ওয়েবসাইটে ৪ বা তার বেশি স্বাধীন Firebase প্রজেক্ট ও Firestore ডাটাবেস যুক্ত করুন এবং রোল অনুযায়ী ডেটা ভাগ করুন
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setLoginPanelFocusKey(null);
              setLoginPanelOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>
              সকল ফায়ারবেজ লগইন প্যানেল
              {unsignedSecondaryCount > 0 ? ` (${unsignedSecondaryCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            disabled={testingAll}
            onClick={() => void handleTestAll()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-zinc-200 bg-white text-zinc-800 text-xs font-semibold rounded-lg hover:bg-zinc-100 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingAll ? 'animate-spin' : ''}`} />
            <span>{testingAll ? 'পরীক্ষা চলছে...' : 'সব সংযোগ পরীক্ষা'}</span>
          </button>

          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>নতুন Firebase প্রজেক্ট</span>
          </button>
        </div>
      </div>

      {/* Security & Cross-Project Consistency Notice */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-2">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">
              নিরাপত্তা ও মাল্টি-প্রজেক্ট ডেটা কনসিস্টেন্সি নির্দেশনা
            </p>
            <ul className="list-disc pl-4 space-y-1 text-amber-900">
              <li>
                <strong>কোনো প্রাইভেট সিক্রেট নয়:</strong> এখানে শুধুমাত্র পাবলিক ওয়েব ক্লায়েন্ট কনফিগারেশন (API Key, Project ID, App ID) যুক্ত করুন। কখনোই Service Account JSON বা Private Key দেবেন না।
              </li>
              <li>
                <strong>ক্রস-প্রজেক্ট ট্রানজ্যাকশন সীমাবদ্ধতা:</strong> Firestore ট্রানজ্যাকশন/ব্যাচ একাধিক আলাদা Firebase প্রজেক্ট জুড়ে অ্যাটমিক হতে পারে না। আর্থিক লেনদেন (পেমেন্ট, ডিপোজিট, উইথড্র, রিওয়ার্ড) ক্রস-প্রজেক্টে সিঙ্ক করতে ট্রাস্টেড ব্যাকএন্ড / Cloud Functions এবং idempotency key ব্যবহার করুন।
              </li>
              <li>
                <strong>স্বাধীন নিরাপত্তা:</strong> প্রতিটি Firebase প্রজেক্টে আলাদাভাবে শক্তিশালী Firestore Security Rules ডিপ্লয় করতে হবে।
              </li>
            </ul>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex flex-wrap items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="flex-1 min-w-0">{feedback.text}</span>
          <div className="flex items-center gap-2 shrink-0">
            {feedback.actionUrl && feedback.actionLabel && (
              <a
                href={feedback.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 bg-white border border-rose-300 text-rose-950 font-semibold rounded-md hover:bg-rose-100"
              >
                {feedback.actionLabel}
              </a>
            )}
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-current opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Firebase Project Modal Form */}
      {formOpen && (
        <form
          onSubmit={handleSaveProject}
          className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-zinc-950">
                {editingKey ? 'Firebase প্রজেক্ট কনফিগারেশন সম্পাদনা' : 'নতুন Firebase প্রজেক্ট যুক্ত করুন'}
              </h3>
              <p className="text-[11px] text-zinc-500">
                Firebase Console → Project Settings → Your Apps (Web App SDK Config) থেকে তথ্য দিন
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {editingKey !== 'project_1' && (
            <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
              <label className="block text-xs font-semibold text-zinc-800">
                সহজ পেস্ট: Firebase Console থেকে পাওয়া <code className="bg-zinc-200/70 px-1 rounded">firebaseConfig</code> কোড এখানে পেস্ট করুন (অটো-ফিল)
              </label>
              <textarea
                rows={3}
                value={snippetInput}
                onChange={(e) => handleApplySdkSnippet(e.target.value)}
                placeholder={'const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  projectId: "my-project",\n  appId: "1:..."\n};'}
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              {snippetStatus && (
                <p
                  className={`text-[11px] font-medium ${
                    snippetStatus.includes('স্বয়ংক্রিয়ভাবে') ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {snippetStatus}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-600 mb-1">প্রজেক্ট লেবেল (নাম) *</label>
              <input
                type="text"
                required
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="যেমন: Firebase 2 (Transactions)"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">Project ID *</label>
              <input
                type="text"
                required
                disabled={editingKey === 'project_1'}
                value={projectIdInput}
                onChange={(e) => setProjectIdInput(e.target.value)}
                placeholder="my-firebase-project-2"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-200 rounded-lg disabled:bg-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">Web API Key *</label>
              <input
                type="text"
                required
                disabled={editingKey === 'project_1'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-200 rounded-lg disabled:bg-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">App ID *</label>
              <input
                type="text"
                required
                disabled={editingKey === 'project_1'}
                value={appIdInput}
                onChange={(e) => setAppIdInput(e.target.value)}
                placeholder="1:123456789:web:abcdef..."
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-200 rounded-lg disabled:bg-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">Auth Domain</label>
              <input
                type="text"
                disabled={editingKey === 'project_1'}
                value={authDomainInput}
                onChange={(e) => setAuthDomainInput(e.target.value)}
                placeholder="project-id.firebaseapp.com"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-200 rounded-lg disabled:bg-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">Firestore Database ID</label>
              <input
                type="text"
                disabled={editingKey === 'project_1'}
                value={databaseIdInput}
                onChange={(e) => setDatabaseIdInput(e.target.value)}
                placeholder="(default)"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-200 rounded-lg disabled:bg-zinc-100"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                সাধারণত <code className="bg-zinc-100 px-1 rounded">(default)</code> রাখুন — এখানে <code className="bg-zinc-100 px-1 rounded">firebaseio.com</code> URL দেবেন না
              </p>
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">Storage Bucket (ঐচ্ছিক)</label>
              <input
                type="text"
                disabled={editingKey === 'project_1'}
                value={storageBucketInput}
                onChange={(e) => setStorageBucketInput(e.target.value)}
                placeholder="project-id.firebasestorage.app"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-200 rounded-lg disabled:bg-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">Messaging Sender ID (ঐচ্ছিক)</label>
              <input
                type="text"
                disabled={editingKey === 'project_1'}
                value={messagingSenderIdInput}
                onChange={(e) => setMessagingSenderIdInput(e.target.value)}
                placeholder="1234567890"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-200 rounded-lg disabled:bg-zinc-100"
              />
            </div>
          </div>

          {editingKey !== 'project_1' && (
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledInput}
                onChange={(e) => setEnabledInput(e.target.checked)}
                className="accent-zinc-950"
              />
              <span>এই Firebase প্রজেক্টটি সক্রিয় (Enabled) রাখুন</span>
            </label>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 cursor-pointer"
            >
              সংরক্ষণ করুন
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2.5 border border-zinc-200 text-xs font-medium rounded-lg hover:bg-zinc-100 cursor-pointer"
            >
              বাতিল
            </button>
          </div>
        </form>
      )}

      {/* Database Role Mapping Matrix */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-zinc-950">ডাটাবেস রোল অ্যাসাইনমেন্ট (Role Mapping)</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            কোন ধরনের ডেটা কোন Firebase প্রজেক্টের Firestore ডাটাবেসে সংরক্ষণ হবে তা কোড পরিবর্তন ছাড়াই নির্ধারণ করুন
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {ALL_ROLES.map((role) => {
            const meta = DATABASE_ROLE_META[role];
            const currentProjId = roleMap[role];
            return (
              <div
                key={role}
                className="p-4 border border-zinc-200 rounded-xl bg-zinc-50/50 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-zinc-950">{meta.labelBn}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{meta.descriptionBn}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-zinc-200/80 text-zinc-800 font-mono-tabular text-[10px] font-semibold uppercase shrink-0">
                    {role}
                  </span>
                </div>

                <select
                  value={currentProjId}
                  onChange={(e) => handleRoleChange(role, e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
                >
                  {projects.map((p) => {
                    const ready = p.enabled && isConfiguredProject(p);
                    return (
                      <option key={p.id} value={p.id} disabled={!ready}>
                        {p.label} ({p.projectId || 'কনফিগার করা নেই'}){!ready ? ' — নিষ্ক্রিয়/অপূর্ণ' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected Firebase Projects List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-950">সংযুক্ত Firebase প্রজেক্টসমূহ ({projects.length}টি)</h3>

        <div className="grid grid-cols-1 gap-4">
          {projects.map((proj) => {
            const connState = getProjectConnectionState(proj.id);
            const badge = getStatusBadge(connState);
            const assignedRoles = rolesByProject[proj.id] || [];
            const isPrimary = proj.id === 'project_1';
            const configured = isConfiguredProject(proj);
            const secondaryUser = configured && proj.enabled ? getProjectAuthUser(proj.id) : null;
            const secondaryEmail = getUserDisplayEmail(secondaryUser);

            return (
              <div
                key={proj.id}
                className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col gap-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-zinc-950">{proj.label}</h4>
                      {isPrimary && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-zinc-950 text-white">
                          Primary Auth & Default DB
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded border ${badge.tone}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>
                        Project ID:{' '}
                        <strong className="font-mono-tabular text-zinc-800">
                          {proj.projectId || 'সেট করা হয়নি'}
                        </strong>
                      </span>
                      <span>
                        Database ID:{' '}
                        <strong className="font-mono-tabular text-zinc-800">
                          {proj.firestoreDatabaseId || '(default)'}
                        </strong>
                      </span>
                      <span>উৎস: {proj.source === 'primary' ? 'প্রজেক্ট কনফিগ' : proj.source === 'env' ? 'Environment (.env)' : 'অ্যাডমিন প্যানেল'}</span>
                      {configured && proj.enabled && (
                        <span>
                          Auth:{' '}
                          <strong className={secondaryUser ? 'text-emerald-700' : 'text-amber-700'}>
                            {secondaryUser
                              ? secondaryEmail || `UID: ${secondaryUser.uid.slice(0, 8)}...`
                              : 'সাইন-ইন করা নেই'}
                          </strong>
                        </span>
                      )}
                    </div>

                    {connState.message && connState.status !== 'idle' && (
                      <p className="text-xs text-zinc-600 pt-0.5">{connState.message}</p>
                    )}
                    {connState.rawError && connState.status !== 'connected' && (
                      <p className="text-[11px] font-mono-tabular text-zinc-500 bg-zinc-50 border border-zinc-200 rounded px-2.5 py-1.5 break-all">
                        Diagnostic: {connState.rawError}
                      </p>
                    )}
                    {!isPrimary && secondaryUser && !secondaryEmail && (
                      <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1">
                        সাইন-ইন করা আছে কিন্তু প্রোফাইল ইমেইল পাওয়া যায়নি। অ্যাডমিন অ্যাক্সেসের জন্য উপরে <strong>Auth লগআউট</strong> করে আবার <strong>Google সাইন-ইন</strong> করুন (অথবা নিশ্চিত করুন আপনার Google অ্যাকাউন্টে ইমেইল অনুমতি আছে)।
                      </div>
                    )}
                    {!isPrimary && connState.status === 'permission_denied' && (
                      <div className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3 mt-1.5 space-y-2">
                        <p className="leading-relaxed">
                          <strong>{proj.projectId}</strong> ({proj.firestoreDatabaseId || '(default)'}) প্রজেক্টের Firestore Rules-এ <code className="bg-rose-100 px-1 rounded">/test/connection</code> বা <code className="bg-rose-100 px-1 rounded">/orders</code> পড়ার অনুমতি নেই। নিচের <strong>&quot;প্রজেক্টের Rules কপি করুন&quot;</strong> চাপুন, তারপর{' '}
                          <a
                            href={`https://console.firebase.google.com/project/${proj.projectId}/firestore/rules`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-bold text-rose-950"
                          >
                            {proj.projectId} Firestore Rules পেজ
                          </a>{' '}
                          খুলে পেস্ট করে <strong>Publish</strong> করুন (অথবা নিচের বোতামে রোল Firebase 1-এ রাখুন):
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyProjectRules(proj, assignedRoles)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-rose-300 text-rose-900 font-semibold rounded-md hover:bg-rose-100 cursor-pointer"
                          >
                            {copiedRulesKey === proj.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedRulesKey === proj.id ? 'Rules কপি হয়েছে' : 'প্রজেক্টের Rules কপি করুন'}</span>
                          </button>
                          {!secondaryUser && (
                            <button
                              type="button"
                              disabled={signingInKey === proj.id}
                              onClick={() => void handleGoogleSignInForProject(proj)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-950 text-white font-semibold rounded-md hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>{signingInKey === proj.id ? 'সাইন-ইন হচ্ছে...' : 'এই প্রজেক্টে Google সাইন-ইন'}</span>
                            </button>
                          )}
                          {assignedRoles.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleReassignToPrimary(proj)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-700 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>রোল Firebase 1-এ ফিরিয়ে নিন</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Project Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={!configured || !proj.enabled}
                      onClick={() => void handleTestOne(proj.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-zinc-200 rounded-lg hover:bg-zinc-100 disabled:opacity-40 cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-emerald-700" />
                      <span>টেস্ট করুন</span>
                    </button>

                    {/* Active Google Sign-In button on EVERY Firebase slot (1, 2, 3, 4, 5+) */}
                    {secondaryUser ? (
                      <>
                        {!isPrimary ? (
                          <button
                            type="button"
                            onClick={() => void handleSecondarySignOut(proj)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:bg-zinc-100 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5 text-zinc-600" />
                            <span>Auth লগআউট</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={signingInKey === proj.id}
                            onClick={() => void handleGoogleSignInForProject(proj)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>{signingInKey === proj.id ? 'সাইন-ইন...' : 'Google সাইন-ইন'}</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={signingInKey === proj.id}
                        onClick={() => void handleGoogleSignInForProject(proj)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{signingInKey === proj.id ? 'সাইন-ইন...' : 'Google সাইন-ইন'}</span>
                      </button>
                    )}

                    {!isPrimary && configured && proj.enabled && (
                      <button
                        type="button"
                        onClick={() => void handleCopyProjectRules(proj, assignedRoles)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:bg-zinc-100 cursor-pointer"
                      >
                        {copiedRulesKey === proj.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedRulesKey === proj.id ? 'কপি হয়েছে' : 'Rules কপি'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openEditForm(proj)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:bg-zinc-100 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>সম্পাদনা</span>
                    </button>

                    {!isPrimary && configured && (
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(proj)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border rounded-lg cursor-pointer ${
                          proj.enabled
                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{proj.enabled ? 'Disable' : 'Enable'}</span>
                      </button>
                    )}

                    {!isPrimary && proj.source === 'runtime' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveProject(proj)}
                        className="p-1.5 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                        aria-label="প্রজেক্ট সরান"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Assigned Roles Display */}
                <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-500 font-medium">নির্ধারিত রোলসমূহ:</span>
                  {assignedRoles.length === 0 ? (
                    <span className="text-zinc-400">কোনো রোল নির্ধারিত নেই</span>
                  ) : (
                    assignedRoles.map((r) => (
                      <span
                        key={r}
                        className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium"
                      >
                        {DATABASE_ROLE_META[r].labelBn}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Setup Instructions */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSetupGuide((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between text-left text-xs font-bold text-zinc-950 hover:bg-zinc-50 cursor-pointer"
        >
          <span>নতুন Firebase প্রজেক্ট Environment Variables (.env) ও Security Rules দিয়ে যুক্ত করার নির্দেশিকা</span>
          <span className="text-emerald-700">{showSetupGuide ? 'লুকান ▲' : 'দেখুন ▼'}</span>
        </button>

        {showSetupGuide && (
          <div className="px-6 pb-6 pt-2 border-t border-zinc-200 text-xs text-zinc-700 space-y-3 leading-relaxed">
            <p>
              <strong>১. Unlimited প্রজেক্ট যুক্ত করা:</strong> <code className="bg-zinc-100 px-1.5 py-0.5 rounded">.env.example</code> ফাইলে দেখানো নিয়ম অনুযায়ী <code className="bg-zinc-100 px-1.5 py-0.5 rounded">VITE_FIREBASE_PROJECT_2_*</code>, <code className="bg-zinc-100 px-1.5 py-0.5 rounded">VITE_FIREBASE_PROJECT_3_*</code>, <code className="bg-zinc-100 px-1.5 py-0.5 rounded">VITE_FIREBASE_PROJECT_4_*</code> এবং চাইলে <code className="bg-zinc-100 px-1.5 py-0.5 rounded">VITE_FIREBASE_PROJECT_5_*</code> থেকে যত খুশি প্রজেক্ট কনফিগার করতে পারবেন, অথবা উপরের <strong>"নতুন Firebase প্রজেক্ট"</strong> বাটন দিয়ে সরাসরি যুক্ত করতে পারবেন।
            </p>
            <p>
              <strong>২. রোল অনুযায়ী আলাদা Authentication / Security Rules:</strong> প্রাইমারি প্রজেক্টে সাইন-ইন হওয়ার পর সেকেন্ডারি প্রজেক্টের Firestore Rules-এ যদি ইউজার-নির্দিষ্ট লেখা/পড়ার অনুমতি প্রয়োজন হয়, তবে Cross-Project Firebase Auth টোকেন সিঙ্ক অথবা ট্রাস্টেড Cloud Functions ব্যাকএন্ড ব্যবহার করুন এবং প্রতিটি প্রজেক্টের জন্য সম্পূর্ণ রোল-ভিত্তিক Security Rules গাইড <code className="bg-zinc-100 px-1.5 py-0.5 rounded">MULTI_FIREBASE_SETUP.md</code> ফাইল থেকে কপি করে ডিপ্লয় করুন।
            </p>
          </div>
        )}
      </div>

      <MultiFirebaseLoginModal
        isOpen={loginPanelOpen}
        focusProjectKey={loginPanelFocusKey}
        onConfigureProject={openEditForm}
        onClose={() => {
          setLoginPanelOpen(false);
          setLoginPanelFocusKey(null);
        }}
      />
    </div>
  );
};
