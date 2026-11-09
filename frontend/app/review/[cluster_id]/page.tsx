'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/services/api';
import { Cluster, Document, Integration, TicketLink } from '@/types/models';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/components/AuthContext';
import {
  ArrowLeft,
  Save,
  CheckCircle,
  XCircle,
  ExternalLink,
  Layers,
  Loader2,
  AlertTriangle,
  Eye,
  Edit2,
  Target,
  TrendingUp,
  Users,
  Shield,
  CheckSquare,
  Activity,
  Layout,
  Server,
} from 'lucide-react';

type DocType = 'brd' | 'prd' | 'story' | 'task';
const TABS: DocType[] = ['brd', 'prd', 'story', 'task'];

/** Parses the JSON editor. Content must be a JSON object. */
function parseEditorContent(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, error: 'Content must be a JSON object ({ ... }).' };
    }
    return { ok: true, value };
  } catch (err: any) {
    return { ok: false, error: `Content is not valid JSON: ${err.message}` };
  }
}

const stableStringify = (v: unknown) => JSON.stringify(v ?? {});

function DocumentReview() {
  const params = useParams();
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  const clusterId = params.cluster_id as string;

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [activeTab, setActiveTab] = useState<DocType>('brd');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [ticketLinks, setTicketLinks] = useState<TicketLink[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state for the active document
  const [editTitle, setEditTitle] = useState('');
  const [editContentText, setEditContentText] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'approve' | 'reject' | 'publish'>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [current, docsRes, integrationsRes] = await Promise.all([
        api.getCluster(clusterId),
        api.getDocuments(clusterId),
        api.getIntegrations().catch(() => ({ integrations: [] as Integration[] })),
      ]);
      setCluster(current);
      setDocuments(docsRes.documents || []);
      setIntegrations(integrationsRes.integrations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load document workspace');
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    if (!authLoading && session && clusterId) loadData();
  }, [clusterId, loadData, authLoading, session]);

  const docsOfTab = useMemo(() => documents.filter((d) => d.type === activeTab), [documents, activeTab]);
  const activeDocument = docsOfTab.find((d) => d.id === activeDocId) ?? docsOfTab[0];
  const storyTitleById = useMemo(
    () => new Map(documents.filter((d) => d.type === 'story').map((d) => [d.id, d.title || 'Untitled story'])),
    [documents],
  );

  // Reset the editor only when a different document (or a newer version) is shown.
  useEffect(() => {
    if (activeDocument) {
      setEditTitle(activeDocument.title || '');
      setEditContentText(JSON.stringify(activeDocument.content ?? {}, null, 2));
    } else {
      setEditTitle('');
      setEditContentText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument?.id, activeDocument?.updated_at, activeDocument?.version]);

  // Ticket links for the active document.
  useEffect(() => {
    if (!activeDocument) {
      setTicketLinks([]);
      return;
    }
    let cancelled = false;
    api
      .getTicketLinks(activeDocument.id)
      .then((res) => !cancelled && setTicketLinks(res.ticket_links || []))
      .catch(() => !cancelled && setTicketLinks([]));
    return () => {
      cancelled = true;
    };
  }, [activeDocument?.id, activeDocument?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleDirty = !!activeDocument && editTitle !== (activeDocument.title || '');
  const parsedEditor = parseEditorContent(editContentText);
  const contentDirty =
    !!activeDocument &&
    (!parsedEditor.ok || stableStringify(parsedEditor.value) !== stableStringify(activeDocument.content));
  const isDirty = titleDirty || contentDirty;

  const confirmDiscard = () => !isDirty || confirm('You have unsaved changes. Discard them?');

  const selectTab = (tab: DocType) => {
    if (tab === activeTab || !confirmDiscard()) return;
    setActiveTab(tab);
    setActiveDocId(null);
  };

  const selectDocument = (id: string) => {
    if (id === activeDocument?.id || !confirmDiscard()) return;
    setActiveDocId(id);
  };

  const handleSave = async () => {
    if (!activeDocument) return;
    if (!parsedEditor.ok) {
      toast(parsedEditor.error, 'error');
      setViewMode('edit');
      return;
    }
    setBusy('save');
    try {
      await api.updateDocument(activeDocument.id, {
        title: editTitle,
        content: parsedEditor.value,
      });
      toast(
        activeDocument.status === 'approved'
          ? 'Changes saved. The document returned to draft and needs re-approval.'
          : 'Document changes saved',
        'success',
      );
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to save document changes', 'error');
    } finally {
      setBusy(null);
    }
  };

  /** Approves exactly what is in the editor (including unsaved edits). */
  const handleApprove = async () => {
    if (!activeDocument) return;
    if (!parsedEditor.ok) {
      toast(parsedEditor.error, 'error');
      setViewMode('edit');
      return;
    }
    setBusy('approve');
    try {
      if (titleDirty) await api.updateDocument(activeDocument.id, { title: editTitle });
      await api.approveDocument(activeDocument.id, {
        editedContent: contentDirty ? parsedEditor.value : undefined,
      });
      toast('Document approved. Publishing is now unlocked.', 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to approve document', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!activeDocument) return;
    const notes = prompt('Reason for rejection (optional):');
    if (notes === null) return; // cancelled
    setBusy('reject');
    try {
      await api.rejectDocument(activeDocument.id, notes.trim() || undefined);
      toast('Document rejected', 'info');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to reject document', 'error');
    } finally {
      setBusy(null);
    }
  };

  const jiraIntegration = integrations.find((i) => i.type === 'jira' && i.is_active);

  const handlePublishJira = async () => {
    if (!activeDocument) return;
    setBusy('publish');
    toast('Publishing issue to Jira...', 'info');
    try {
      const res = await api.publishToJira(activeDocument.id, jiraIntegration?.id);
      if (res.warning) toast(res.warning, 'error');
      else toast(`Published to Jira as ${res.external_id}`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to publish to Jira', 'error');
    } finally {
      setBusy(null);
      await loadData();
    }
  };

  const renderCleanView = () => {
    let data: any = null;
    try {
      data = JSON.parse(editContentText);
    } catch (err) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Invalid JSON Format
          </div>
          <p className="text-xs">
            The editor currently contains invalid JSON. Please switch back to the <strong>Edit JSON</strong> tab to correct syntax errors before previewing.
          </p>
          <button
            type="button"
            onClick={() => setViewMode('edit')}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            Open Editor
          </button>
        </div>
      );
    }

    if (!data) return <p className="text-slate-400 italic text-sm text-center py-12">No content available.</p>;

    switch (activeTab) {
      case 'brd':
        return (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">{data.title || 'Business Requirements Document'}</h3>
            </div>

            {data.problem_statement && (
              <div className="bg-gradient-to-r from-violet-500/5 to-indigo-500/5 border border-indigo-100 rounded-xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                  <Target className="w-4 h-4" />
                  Problem Statement
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed font-semibold">{data.problem_statement}</p>
              </div>
            )}

            {data.business_impact && (
              <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border border-emerald-100 rounded-xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-4 h-4" />
                  Business Impact
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed font-semibold">{data.business_impact}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                  Business Goals
                </h4>
                <ul className="space-y-2">
                  {Array.isArray(data.goals) && data.goals.map((goal: string, idx: number) => (
                    <li key={idx} className="text-xs text-slate-600 font-semibold flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">{idx + 1}</span>
                      <span className="pt-0.5">{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-purple-500" />
                  Target Stakeholders
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(data.target_stakeholders) && data.target_stakeholders.map((sh: string, idx: number) => (
                    <span key={idx} className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-1 rounded-full shadow-xs">
                      {sh}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-rose-500" />
                  Success Metrics
                </h4>
                <ul className="space-y-2">
                  {Array.isArray(data.success_metrics) && data.success_metrics.map((metric: string, idx: number) => (
                    <li key={idx} className="text-xs text-slate-600 font-semibold flex items-start gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-rose-50 text-rose-600 text-[10px] font-bold">✓</span>
                      <span>{metric}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );

      case 'prd':
        return (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">{data.title || 'Product Requirements Document'}</h3>
            </div>

            {Array.isArray(data.user_flows) && data.user_flows.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">User Experience Flows</h4>
                <div className="relative border-l border-blue-100 ml-3 pl-6 space-y-4">
                  {data.user_flows.map((flow: string, idx: number) => (
                    <div key={idx} className="relative">
                      <span className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-[11px] font-bold shadow-md shadow-blue-500/20 border-2 border-white">
                        {idx + 1}
                      </span>
                      <p className="text-xs font-semibold text-slate-700 pt-0.5">{flow}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(data.milestones) && data.milestones.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Milestones</h4>
                <div className="relative border-l border-slate-200 ml-3 pl-6 space-y-4">
                  {data.milestones.map((ms: string, idx: number) => (
                    <div key={idx} className="relative">
                      <span className="absolute -left-[30px] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold border-2 border-white">
                        ★
                      </span>
                      <p className="text-xs font-semibold text-slate-600 pt-0.5">{ms}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layout className="w-4 h-4 text-blue-500" />
                  Functional Req.
                </h4>
                <ul className="space-y-2">
                  {Array.isArray(data.functional_requirements) && data.functional_requirements.map((req: string, idx: number) => (
                    <li key={idx} className="text-xs text-slate-600 font-semibold flex items-start gap-2">
                      <span className="text-blue-500 font-bold shrink-0">•</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Non-Functional Req.
                </h4>
                <ul className="space-y-2">
                  {Array.isArray(data.non_functional_requirements) && data.non_functional_requirements.map((req: string, idx: number) => (
                    <li key={idx} className="text-xs text-slate-600 font-semibold flex items-start gap-2">
                      <span className="text-emerald-500 font-bold shrink-0">•</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Tech Constraints
                </h4>
                <ul className="space-y-2">
                  {Array.isArray(data.technical_constraints) && data.technical_constraints.map((req: string, idx: number) => (
                    <li key={idx} className="text-xs text-slate-600 font-semibold flex items-start gap-2 bg-amber-50/50 p-2 rounded border border-amber-100/50">
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );

      case 'story':
        const getPriorityColor = (prio: string) => {
          const lower = String(prio).toLowerCase();
          if (lower.includes('must')) return 'bg-rose-50 border-rose-200 text-rose-700';
          if (lower.includes('should')) return 'bg-blue-50 border-blue-200 text-blue-700';
          return 'bg-emerald-50 border-emerald-200 text-emerald-700';
        };

        return (
          <div className="max-w-2xl mx-auto py-2">
            <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2.5 py-1 rounded">Agile User Story</span>
                  <h3 className="text-base font-extrabold text-slate-800 mt-2">{data.title || 'Draft Story Details'}</h3>
                </div>
                {data.priority && (
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border shadow-xs ${getPriorityColor(data.priority)}`}>
                    {data.priority}
                  </span>
                )}
              </div>

              <div className="space-y-3.5 bg-slate-50/80 p-5 rounded-xl border border-slate-100/50">
                {data.user_role && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest shrink-0 w-20">As a</span>
                    <span className="text-xs font-bold text-slate-800 leading-snug">{String(data.user_role).replace(/^As a /i, '')}</span>
                  </div>
                )}
                {data.requirement && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest shrink-0 w-20">I want to</span>
                    <span className="text-xs font-bold text-indigo-700 leading-snug">{String(data.requirement).replace(/^I want to /i, '')}</span>
                  </div>
                )}
                {data.benefit && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest shrink-0 w-20">So that</span>
                    <span className="text-xs font-bold text-emerald-700 leading-snug">{String(data.benefit).replace(/^so that /i, '')}</span>
                  </div>
                )}
              </div>

              {Array.isArray(data.acceptance_criteria) && data.acceptance_criteria.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-blue-500" />
                    Acceptance Criteria
                  </h4>
                  <div className="space-y-2">
                    {data.acceptance_criteria.map((criteria: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50/80 transition-colors">
                        <input
                          type="checkbox"
                          checked
                          readOnly
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 w-3.5 h-3.5 shrink-0"
                        />
                        <span className="text-xs font-semibold text-slate-600">{criteria}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'task':
        const getComplexityColor = (comp: string) => {
          const lower = String(comp).toLowerCase();
          if (lower.includes('large')) return 'bg-rose-50 border-rose-200 text-rose-700';
          if (lower.includes('medium')) return 'bg-amber-50 border-amber-200 text-amber-700';
          return 'bg-blue-50 border-blue-200 text-blue-700';
        };

        return (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-purple-600 bg-purple-50 px-2.5 py-1 rounded">Technical Task Breakdown</span>
                <h3 className="text-base font-extrabold text-slate-800 mt-2">{data.story_title || 'Story Development Tasks'}</h3>
              </div>
              {data.estimated_complexity && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 font-bold">Complexity:</span>
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border shadow-xs ${getComplexityColor(data.estimated_complexity)}`}>
                    {data.estimated_complexity}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <Layout className="w-4 h-4 text-sky-500" />
                  Frontend Tasks
                  {Array.isArray(data.frontend_tasks) && (
                    <span className="ml-auto bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{data.frontend_tasks.length}</span>
                  )}
                </h4>
                <div className="space-y-2">
                  {Array.isArray(data.frontend_tasks) && data.frontend_tasks.map((task: string, idx: number) => (
                    <div key={idx} className="bg-white border border-slate-200/80 rounded-lg p-3 shadow-xs hover:shadow-sm transition-shadow">
                      <p className="text-xs font-semibold text-slate-700 leading-snug">{task}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <Server className="w-4 h-4 text-purple-500" />
                  Backend Tasks
                  {Array.isArray(data.backend_tasks) && (
                    <span className="ml-auto bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{data.backend_tasks.length}</span>
                  )}
                </h4>
                <div className="space-y-2">
                  {Array.isArray(data.backend_tasks) && data.backend_tasks.map((task: string, idx: number) => (
                    <div key={idx} className="bg-white border border-slate-200/80 rounded-lg p-3 shadow-xs hover:shadow-sm transition-shadow">
                      <p className="text-xs font-semibold text-slate-700 leading-snug">{task}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Testing Tasks
                  {Array.isArray(data.testing_tasks) && (
                    <span className="ml-auto bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{data.testing_tasks.length}</span>
                  )}
                </h4>
                <div className="space-y-2">
                  {Array.isArray(data.testing_tasks) && data.testing_tasks.map((task: string, idx: number) => (
                    <div key={idx} className="bg-white border border-slate-200/80 rounded-lg p-3 shadow-xs hover:shadow-sm transition-shadow">
                      <p className="text-xs font-semibold text-slate-700 leading-snug">{task}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {Array.isArray(data.dependencies) && data.dependencies.length > 0 && (
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  📌 Tech Dependencies
                </h4>
                <div className="flex flex-wrap gap-2">
                  {data.dependencies.map((dep: string, idx: number) => (
                    <span key={idx} className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-lg">
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return (
          <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto leading-relaxed">
            {editContentText}
          </pre>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading document workspace...</p>
      </div>
    );
  }

  if (error || !cluster) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back to Inbox
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl space-y-2">
          <h3 className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Workspace Error
          </h3>
          <p className="text-sm">{error || 'Cluster not found'}</p>
        </div>
      </div>
    );
  }

  const canReview = !!activeDocument && ['draft', 'review', 'rejected'].includes(activeDocument.status);
  const canReject = !!activeDocument && ['draft', 'review', 'approved'].includes(activeDocument.status);
  const alreadyOnJira = !!jiraIntegration && ticketLinks.some((l) => l.integration_id === jiraIntegration.id);
  const canPublish =
    !!activeDocument &&
    (activeDocument.status === 'approved' || (activeDocument.status === 'published' && ticketLinks.length > 0)) &&
    !alreadyOnJira;
  const isPublished = activeDocument?.status === 'published';

  const docLabel = (d: Document, idx: number) => {
    if (d.type === 'task' && d.parent_id) return storyTitleById.get(d.parent_id) || `Task set ${idx + 1}`;
    return d.title || `${d.type.toUpperCase()} ${idx + 1}`;
  };

  return (
    <div className="space-y-8">
      {/* Back & Title */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Inbox
          </Link>
          <Link
            href={`/pipeline/${clusterId}`}
            className="text-xs font-semibold text-slate-800 hover:text-black dark:text-zinc-200 dark:hover:text-white bg-slate-100 dark:bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            <Layers className="w-3.5 h-3.5" />
            Open Stepper Pipeline
          </Link>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{cluster.title}</h2>
          <p className="text-sm text-slate-500 mt-1">Review & edit AI draft specifications, then publish them to your tracker.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left: stage tabs + document list */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">Document Stages</h3>
          <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1.5">
            {TABS.map((tab) => {
              const count = documents.filter((d) => d.type === tab).length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => selectTab(tab)}
                  className={`flex-1 lg:flex-initial flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all text-left whitespace-nowrap lg:whitespace-normal ${
                    isActive
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-sm'
                      : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <span>{tab.toUpperCase()}</span>
                  {count > 0 ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      isActive ? 'bg-slate-800 dark:bg-zinc-200 text-white dark:text-black' : 'bg-slate-100 dark:bg-zinc-900 text-slate-500 dark:text-zinc-400'
                    }`}>
                      {count}
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-60 italic">Not generated</span>
                  )}
                </button>
              );
            })}
          </div>

          {docsOfTab.length > 1 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">
                {activeTab === 'task' ? 'Task sets by story' : `${activeTab.toUpperCase()} documents`}
              </h3>
              <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm flex flex-col gap-1 max-h-[420px] overflow-y-auto">
                {docsOfTab.map((d, idx) => {
                  const isActive = d.id === activeDocument?.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => selectDocument(d.id)}
                      className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between gap-2 ${
                        isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="line-clamp-2">{docLabel(d, idx)}</span>
                      <StatusBadge status={d.status} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: editor */}
        <div className="lg:col-span-3 space-y-6">
          {!activeDocument ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-4">
              <AlertTriangle className="w-12 h-12 text-slate-300" />
              <div>
                <h4 className="font-bold text-slate-700">Document Not Generated Yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Use the Stepper Pipeline to generate this document.
                </p>
              </div>
              <Link
                href={`/pipeline/${clusterId}`}
                className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-black text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Go to Stepper Pipeline
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="font-bold text-slate-800 text-base">{activeTab.toUpperCase()} · v{activeDocument.version}</h4>
                    <StatusBadge status={activeDocument.status} />
                    {isDirty && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        Unsaved changes
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">Last updated: {new Date(activeDocument.updated_at).toLocaleString()}</p>
                </div>

                {/* Publishing (Jira is the only implemented tracker) */}
                {(activeDocument.status === 'approved' || isPublished) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {jiraIntegration ? (
                      canPublish ? (
                        <button
                          onClick={handlePublishJira}
                          disabled={busy !== null || isDirty}
                          title={isDirty ? 'Save or discard your edits first' : `Publish to ${jiraIntegration.name}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                        >
                          {busy === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Publish to Jira
                        </button>
                      ) : null
                    ) : (
                      <Link href="/integrations" className="text-xs font-semibold text-slate-600 underline hover:text-slate-900">
                        Connect Jira to publish
                      </Link>
                    )}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label htmlFor="doc-title" className="text-xs font-bold text-slate-400 uppercase tracking-wider">Document Title</label>
                  <input
                    id="doc-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    disabled={isPublished}
                    className="w-full text-sm font-semibold border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-800 dark:focus:border-zinc-700 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {viewMode === 'edit' ? 'Document Content (JSON)' : 'Document Clean View'}
                    </span>
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100/80 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                          viewMode === 'preview' ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Clean View
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('edit')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                          viewMode === 'edit' ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit JSON
                      </button>
                    </div>
                  </div>

                  {viewMode === 'edit' ? (
                    <>
                      <textarea
                        aria-label="Document content JSON"
                        value={editContentText}
                        onChange={(e) => setEditContentText(e.target.value)}
                        readOnly={isPublished}
                        rows={16}
                        className={`w-full text-xs font-mono border rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 dark:bg-zinc-900/40 focus:bg-white dark:focus:bg-zinc-950 leading-relaxed ${
                          parsedEditor.ok ? 'border-slate-200 focus:border-slate-800' : 'border-red-300 focus:border-red-500'
                        }`}
                      />
                      {!parsedEditor.ok && <p className="text-xs font-semibold text-red-600">{parsedEditor.error}</p>}
                    </>
                  ) : (
                    <div className="border border-slate-100 rounded-xl bg-slate-50/20 p-6 min-h-[400px]">
                      {renderCleanView()}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  {ticketLinks.length > 0 ? (
                    <div className="bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-lg flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-800">Published:</span>
                      {ticketLinks.map((l) => (
                        <a
                          key={l.id}
                          href={l.external_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline flex items-center gap-0.5"
                        >
                          {l.external_id}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  ) : isPublished ? (
                    <p className="text-xs text-amber-700 font-semibold">Published, but no ticket link was recorded. Check your tracker.</p>
                  ) : (
                    <p className="text-xs text-slate-400 font-medium">
                      Saving content creates a new version. Editing an approved document sends it back for review.
                    </p>
                  )}
                </div>

                {!isPublished && (
                  <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
                    <button
                      onClick={handleSave}
                      disabled={busy !== null || !isDirty || !parsedEditor.ok}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>

                    {canReject && (
                      <button
                        onClick={handleReject}
                        disabled={busy !== null}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 border border-red-200 text-red-700 hover:bg-red-50 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {busy === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Reject
                      </button>
                    )}

                    {canReview && (
                      <button
                        onClick={handleApprove}
                        disabled={busy !== null || !parsedEditor.ok}
                        title={isDirty ? 'Approves the content currently in the editor' : undefined}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {isDirty ? 'Approve with Edits' : 'Approve'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentReviewPage() {
  return (
    <ProtectedRoute>
      <DocumentReview />
    </ProtectedRoute>
  );
}
