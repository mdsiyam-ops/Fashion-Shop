import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Edit3,
  ExternalLink,
  KeyRound,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  DATABASE_ROLE_META,
  DatabaseRole,
  FirebaseProjectConfig,
  getAllFirebaseProjects,
  getProjectAuthUser,
  getProjectConnectionState,
  getRoleAssignments,
  getUserDisplayEmail,
  isConfiguredProject,
  signInToProject,
  signOutFromProject,
  subscribeManagerUpdates,
  testProjectConnection,
  toggleFirebaseProjectEnabled,
} from '../lib/multiFirebaseManager';

interface MultiFirebaseLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  focusProjectKey?: string | null;
  onlyActiveRoles?: boolean;
  onConfigureProject?: (proj: FirebaseProjectConfig) => void;
}

export const MultiFirebaseLoginModal: React.FC<MultiFirebaseLoginModalProps> = ({
  isOpen,
  onClose,
  focusProjectKey = null,
  onlyActiveRoles = false,
  onConfigureProject,
}) => {
  const [projects, setProjects] = useState<FirebaseProjectConfig[]>(() => getAllFirebaseProjects());
  const [roleMap, setRoleMap] = useState<Record<DatabaseRole, string>>(() => getRoleAssignments());
  const [signingKey, setSigningKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{
    text: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    const sync = () => {
      setProjects(getAllFirebaseProjects());
      setRoleMap(getRoleAssignments());
      setTick((t) => t + 1);
    };
    sync();
    return subscribeManagerUpdates(sync);
  }, [isOpen]);

  if (!isOpen) return null;

  const activeRoleProjectIds = new Set(Object.values(roleMap));
  const visibleProjects = projects.filter((p) => {
    if (onlyActiveRoles && p.id !== focusProjectKey) {
      return p.id !== 'project_1' && p.enabled && isConfiguredProject(p) && activeRoleProjectIds.has(p.id);
    }
    return true;
  });

  const handleSignIn = async (proj: FirebaseProjectConfig) => {
    setErrorInfo(null);
    setSuccessMsg('');

    if (!isConfiguredProject(proj)) {
      if (onConfigureProject) {
        onClose();
        onConfigureProject(proj);
      } else {
        setErrorInfo({
          text: `"${proj.label}" এখনো কনফিগার করা হয়নি। অ্যাডমিন প্যানেল থেকে Config পেস্ট করে সংরক্ষণ করুন।`,
        });
      }
      return;
    }

    setSigningKey(proj.id);
    try {
      if (!proj.enabled && proj.id !== 'project_1') {
        toggleFirebaseProjectEnabled(proj.id, true);
      }
      const user = await signInToProject(proj.id);
      const email = getUserDisplayEmail(user) || user.uid;
      setSuccessMsg(`"${proj.label}"-এ ${email} দিয়ে Google সাইন-ইন ও টেস্ট সম্পন্ন হয়েছে।`);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : 'সাইন-ইন ব্যর্থ হয়েছে।';
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setErrorInfo({
          text: `"${proj.projectId}"-এর Firebase Console → Authentication → Settings → Authorized domains-এ "${window.location.hostname}" যোগ করুন।`,
          actionUrl: `https://console.firebase.google.com/project/${proj.projectId}/authentication/settings`,
          actionLabel: 'Authorized Domains খুলুন',
        });
      } else if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        setErrorInfo({
          text: `"${proj.projectId}"-এর Firebase Console → Authentication → Sign-in method থেকে Google প্রোভাইডারটি Enable করুন।`,
          actionUrl: `https://console.firebase.google.com/project/${proj.projectId}/authentication/providers`,
          actionLabel: 'Google Auth Enable করুন',
        });
      } else if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        setErrorInfo({
          text: 'ব্রাউজার পপ-আপ ব্লক করেছে। পপ-আপ অনুমতি দিয়ে আবার চেষ্টা করুন।',
        });
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorInfo({
          text: 'লগইন পপ-আপ সম্পন্ন হওয়ার আগেই বন্ধ করা হয়েছে।',
        });
      } else {
        setErrorInfo({
          text: `"${proj.label}"-এ লগইন ব্যর্থ (${msg})।`,
        });
      }
    } finally {
      setSigningKey(null);
    }
  };

  const handleSignOut = async (proj: FirebaseProjectConfig) => {
    setErrorInfo(null);
    setSuccessMsg('');
    try {
      await signOutFromProject(proj.id);
      setSuccessMsg(`"${proj.label}" থেকে লগআউট সম্পন্ন হয়েছে।`);
    } catch (err) {
      setErrorInfo({
        text: err instanceof Error ? err.message : 'লগআউট করা যায়নি।',
      });
    }
  };

  const handleTest = async (proj: FirebaseProjectConfig) => {
    setTestingKey(proj.id);
    setErrorInfo(null);
    setSuccessMsg('');
    try {
      const res = await testProjectConnection(proj.id);
      if (res.status === 'connected') {
        setSuccessMsg(`"${proj.label}" সফলভাবে সংযুক্ত (${res.message})।`);
      } else {
        setErrorInfo({ text: `"${proj.label}": ${res.message}` });
      }
    } finally {
      setTestingKey(null);
    }
  };

  const configuredCount = visibleProjects.filter((p) => isConfiguredProject(p)).length;
  const unsignedConfiguredCount = visibleProjects.filter(
    (p) => isConfiguredProject(p) && !getProjectAuthUser(p.id)
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-950 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              <span>সকল Firebase প্রজেক্ট Google সাইন-ইন প্যানেল</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              {unsignedConfiguredCount > 0
                ? `${configuredCount}টি কনফিগারকৃত প্রজেক্টের মধ্যে ${unsignedConfiguredCount}টিতে Google সাইন-ইন বাকি আছে`
                : 'কনফিগারকৃত সব Firebase প্রজেক্টেই Google সাইন-ইন সক্রিয় আছে'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 cursor-pointer shrink-0"
            aria-label="বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-3">
          {errorInfo && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 leading-relaxed flex flex-wrap items-center justify-between gap-2">
              <span className="flex-1 min-w-0">{errorInfo.text}</span>
              {errorInfo.actionUrl && errorInfo.actionLabel && (
                <a
                  href={errorInfo.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-rose-300 text-rose-950 font-semibold rounded-md hover:bg-rose-100 shrink-0"
                >
                  <span>{errorInfo.actionLabel}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 leading-relaxed">
              {successMsg}
            </div>
          )}

          {visibleProjects.length === 0 ? (
            <div className="p-6 text-center bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-600">
              বর্তমানে কোনো অতিরিক্ত প্রজেক্ট সক্রিয় নেই।
            </div>
          ) : (
            visibleProjects.map((proj) => {
              const configured = isConfiguredProject(proj);
              const isPrimary = proj.id === 'project_1';
              const user = configured && proj.enabled ? getProjectAuthUser(proj.id) : null;
              const email = getUserDisplayEmail(user);
              const conn = getProjectConnectionState(proj.id);
              const assigned = (Object.keys(roleMap) as DatabaseRole[]).filter(
                (r) => roleMap[r] === proj.id
              );
              const isFocused = focusProjectKey === proj.id;

              return (
                <div
                  key={proj.id}
                  className={`p-4 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isFocused
                      ? 'border-emerald-400 bg-emerald-50/40'
                      : 'border-zinc-200 bg-zinc-50/60'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-zinc-950">{proj.label}</span>
                      {proj.projectId && (
                        <span className="text-[11px] font-mono-tabular px-2 py-0.5 rounded bg-zinc-200/70 text-zinc-800">
                          {proj.projectId}
                        </span>
                      )}
                      {conn.status === 'connected' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          সংযুক্ত
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-600">
                      {configured ? (
                        <>
                          Auth:{' '}
                          <strong className={user ? 'text-emerald-700' : 'text-amber-700'}>
                            {user ? email || `UID: ${user.uid.slice(0, 8)}...` : 'সাইন-ইন করা নেই'}
                          </strong>
                        </>
                      ) : (
                        <span className="text-zinc-500">কনফিগ এখনো যোগ করা হয়নি</span>
                      )}
                    </p>

                    {assigned.length > 0 && (
                      <p className="text-[11px] text-zinc-500">
                        রোল: {assigned.map((r) => DATABASE_ROLE_META[r].labelBn).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!configured ? (
                      <button
                        type="button"
                        onClick={() => void handleSignIn(proj)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-100 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>কনফিগ ও Google সাইন-ইন</span>
                      </button>
                    ) : user ? (
                      <>
                        <button
                          type="button"
                          disabled={testingKey === proj.id}
                          onClick={() => void handleTest(proj)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-zinc-200 bg-white text-zinc-800 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
                        >
                          <Activity className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{testingKey === proj.id ? 'টেস্ট...' : 'টেস্ট'}</span>
                        </button>
                        {!isPrimary ? (
                          <button
                            type="button"
                            onClick={() => void handleSignOut(proj)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-zinc-200 bg-white text-zinc-700 rounded-lg hover:bg-zinc-100 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>লগআউট</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={signingKey === proj.id}
                            onClick={() => void handleSignIn(proj)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>{signingKey === proj.id ? 'সাইন-ইন...' : 'Google পরিবর্তন'}</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={signingKey === proj.id}
                        onClick={() => void handleSignIn(proj)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>
                          {signingKey === proj.id ? 'সাইন-ইন হচ্ছে...' : 'Google সাইন-ইন'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500">
            সকল Firebase প্রজেক্টে Google সাইন-ইন অপশন সক্রিয় রয়েছে
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            {unsignedConfiguredCount === 0 ? 'সম্পন্ন' : 'পরে করব'}
          </button>
        </div>
      </div>
    </div>
  );
};
