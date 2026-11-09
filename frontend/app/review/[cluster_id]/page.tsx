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
import { BackLink, LoadingState, PageHeader } from '@/components/app/primitives';
import { SlideOver } from '@/components/app/SlideOver';
import { JiraConnectForm } from '@/components/JiraConnectForm';
import { AlertTriangle, Check, Code, ExternalLink, FileText, Loader2, X } from 'lucide-react';

const TAB_LABEL: Record<string, { short: string; long: string }> = {
  brd: { short: 'BRD', long: 'Business requirements' },
  prd: { short: 'PRD', long: 'Product requirements' },
  story: { short: 'Stories', long: 'User stories' },
  task: { short: 'Tasks', long: 'Task breakdowns' },
};

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

function DocSection({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 ${className}`}>
      <h4 className="eyebrow">{label}</h4>
      {children}
    </section>
  );
}

function BulletList({ items, marker = 'dot' }: { items: string[]; marker?: 'dot' | 'number' | 'check' }) {
  if (items.length === 0) return <p className="text-[14px] text-ink-3">None listed.</p>;
  return (
    <ol className="space-y-2.5">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-3 text-[14.5px] leading-relaxed">
          {marker === 'number' ? (
            <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[10.5px] text-ink-2">
              {idx + 1}
            </span>
          ) : marker === 'check' ? (
            <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line text-success">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden />
          )}
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 text-[12px] font-semibold text-ink-2">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} aria-hidden />
      {children}
    </span>
  );
}

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
  const [connectOpen, setConnectOpen] = useState(false);

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
        <div role="alert" className="alert alert-warning flex-col gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden /> This content isn&apos;t valid JSON
          </p>
          <p className="text-ink-2">Fix the syntax in the JSON editor before switching back to the readable view.</p>
          <button type="button" onClick={() => setViewMode('edit')} className="btn btn-secondary btn-sm">
            Open JSON editor
          </button>
        </div>
      );
    }

    if (!data) return <p className="py-12 text-center text-[14px] text-ink-3">No content yet.</p>;

    switch (activeTab) {
      case 'brd':
        return (
          <article className="space-y-8">
            <h3 className="font-display text-[32px] leading-[1.1]">{data.title || 'Business Requirements Document'}</h3>

            {data.problem_statement && (
              <DocSection label="problem">
                <p className="border-l-2 border-brand pl-4 text-[16px] leading-relaxed">{data.problem_statement}</p>
              </DocSection>
            )}

            {data.business_impact && (
              <DocSection label="business impact">
                <p className="text-[16px] leading-relaxed text-ink-2">{data.business_impact}</p>
              </DocSection>
            )}

            <div className="grid gap-8 border-t border-line pt-8 md:grid-cols-3">
              <DocSection label="goals">
                <BulletList items={asList(data.goals)} marker="number" />
              </DocSection>
              <DocSection label="stakeholders">
                <BulletList items={asList(data.target_stakeholders)} />
              </DocSection>
              <DocSection label="success metrics">
                <BulletList items={asList(data.success_metrics)} marker="check" />
              </DocSection>
            </div>
          </article>
        );

      case 'prd': {
        const flows = asList(data.user_flows);
        const milestones = asList(data.milestones);
        return (
          <article className="space-y-8">
            <h3 className="font-display text-[32px] leading-[1.1]">{data.title || 'Product Requirements Document'}</h3>

            {flows.length > 0 && (
              <DocSection label="user flows">
                <ol className="relative space-y-4 border-l border-line pl-6">
                  {flows.map((flow, idx) => (
                    <li key={idx} className="relative text-[14.5px] leading-relaxed">
                      <span className="absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card font-mono text-[11px] text-ink-2">
                        {idx + 1}
                      </span>
                      {flow}
                    </li>
                  ))}
                </ol>
              </DocSection>
            )}

            {milestones.length > 0 && (
              <DocSection label="milestones">
                <BulletList items={milestones} marker="number" />
              </DocSection>
            )}

            <div className="grid gap-8 border-t border-line pt-8 md:grid-cols-3">
              <DocSection label="functional">
                <BulletList items={asList(data.functional_requirements)} />
              </DocSection>
              <DocSection label="non-functional">
                <BulletList items={asList(data.non_functional_requirements)} />
              </DocSection>
              <DocSection label="technical constraints">
                <BulletList items={asList(data.technical_constraints)} />
              </DocSection>
            </div>
          </article>
        );
      }

      case 'story': {
        const prio = String(data.priority || '').toLowerCase();
        const prioTone = prio.includes('must') ? 'bg-danger' : prio.includes('should') ? 'bg-info' : 'bg-success';
        return (
          <article className="mx-auto max-w-2xl space-y-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">user story</p>
                <h3 className="mt-2 font-display text-[30px] leading-[1.1]">{data.title || 'Draft story'}</h3>
              </div>
              {data.priority && <Chip tone={prioTone}>{data.priority}</Chip>}
            </div>

            {(data.user_role || data.requirement || data.benefit) && (
              <div className="space-y-1.5 rounded-xl border border-line bg-card p-5 font-display text-[22px] leading-snug">
                {data.user_role && (
                  <p>
                    <span className="text-ink-3">As a </span>
                    {String(data.user_role).replace(/^As a /i, '')}
                  </p>
                )}
                {data.requirement && (
                  <p>
                    <span className="text-ink-3">I want to </span>
                    {String(data.requirement).replace(/^I want to /i, '')}
                  </p>
                )}
                {data.benefit && (
                  <p>
                    <span className="text-ink-3">so that </span>
                    <span className="italic">{String(data.benefit).replace(/^so that /i, '')}</span>
                  </p>
                )}
              </div>
            )}

            {asList(data.acceptance_criteria).length > 0 && (
              <DocSection label="acceptance criteria">
                <BulletList items={asList(data.acceptance_criteria)} marker="check" />
              </DocSection>
            )}
          </article>
        );
      }

      case 'task': {
        const comp = String(data.estimated_complexity || '').toLowerCase();
        const compTone = comp.includes('large') ? 'bg-danger' : comp.includes('medium') ? 'bg-warning' : 'bg-info';
        const groups = [
          { label: 'Frontend', items: asList(data.frontend_tasks) },
          { label: 'Backend', items: asList(data.backend_tasks) },
          { label: 'Testing', items: asList(data.testing_tasks) },
        ];
        const deps = asList(data.dependencies);
        return (
          <article className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">task breakdown</p>
                <h3 className="mt-2 font-display text-[30px] leading-[1.1]">{data.story_title || 'Story tasks'}</h3>
              </div>
              {data.estimated_complexity && <Chip tone={compTone}>Complexity: {data.estimated_complexity}</Chip>}
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {groups.map((g) => (
                <section key={g.label} className="overflow-hidden rounded-xl border border-line bg-card">
                  <h4 className="flex items-center justify-between border-b border-line px-4 py-3 text-[13.5px] font-semibold">
                    {g.label}
                    <span className="font-mono text-[12px] font-normal text-ink-3">{g.items.length}</span>
                  </h4>
                  {g.items.length === 0 ? (
                    <p className="px-4 py-4 text-[13.5px] text-ink-3">None.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {g.items.map((task, idx) => (
                        <li key={idx} className="px-4 py-3 text-[14px] leading-snug">
                          {task}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>

            {deps.length > 0 && (
              <DocSection label="dependencies" className="border-t border-line pt-6">
                <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  {deps.map((dep, idx) => (
                    <li key={idx} className="font-mono text-[12.5px] text-ink-2">
                      {dep}
                    </li>
                  ))}
                </ul>
              </DocSection>
            )}
          </article>
        );
      }

      default:
        return <pre className="code-block">{editContentText}</pre>;
    }
  };

  if (loading) return <LoadingState label="Loading drafts…" />;

  if (error || !cluster) {
    return (
      <div className="space-y-6">
        <BackLink href="/dashboard">Inbox</BackLink>
        <div role="alert" className="alert alert-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Couldn&apos;t load these drafts</p>
            <p>{error || 'Cluster not found'}</p>
          </div>
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
    <div className="space-y-10">
      <PageHeader
        back={<BackLink href="/dashboard">Inbox</BackLink>}
        eyebrow="cluster · review"
        title={cluster.title}
        description="Read the drafts, fix what's off, then approve. Only approved documents can be published."
        actions={
          <Link href={`/pipeline/${clusterId}`} className="btn btn-secondary">
            Open pipeline
          </Link>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* Left: stages + documents */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Document stage">
            <p className="eyebrow px-1 pb-2">stages</p>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
              {TABS.map((tab) => {
                const count = documents.filter((d) => d.type === tab).length;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => selectTab(tab)}
                    aria-current={isActive ? 'page' : undefined}
                    title={TAB_LABEL[tab].long}
                    className="nav-item shrink-0 justify-between lg:w-full"
                  >
                    <span>{TAB_LABEL[tab].short}</span>
                    <span className="font-mono text-[12px] text-ink-3">{count > 0 ? count : '—'}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {docsOfTab.length > 1 && (
            <div>
              <p className="eyebrow px-1 pb-2">{activeTab === 'task' ? 'task sets by story' : `${TAB_LABEL[activeTab].long.toLowerCase()}`}</p>
              <ul className="card max-h-[420px] divide-y divide-line overflow-y-auto">
                {docsOfTab.map((d, idx) => {
                  const isActive = d.id === activeDocument?.id;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => selectDocument(d.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`flex w-full flex-col items-start gap-2 px-3.5 py-3 text-left transition-colors duration-150 ${
                          isActive ? 'bg-stone/70' : 'hover:bg-stone/40'
                        }`}
                      >
                        <span className={`line-clamp-2 text-[13.5px] leading-snug ${isActive ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                          {docLabel(d, idx)}
                        </span>
                        <StatusBadge status={d.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>

        {/* Right: document */}
        <div className="min-w-0">
          {!activeDocument ? (
            <div className="card flex flex-col items-center px-6 py-16 text-center">
              <p className="font-display text-[28px] leading-tight">No {TAB_LABEL[activeTab].long.toLowerCase()} yet.</p>
              <p className="mt-2 max-w-sm text-[14.5px] text-ink-2">Generate this step from the pipeline, then come back to review it.</p>
              <Link href={`/pipeline/${clusterId}`} className="btn btn-primary mt-6">
                Go to pipeline
              </Link>
            </div>
          ) : (
            <article className="card overflow-hidden">
              <header className="flex flex-col gap-4 border-b border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-[16px] font-semibold">
                      {TAB_LABEL[activeTab].long}{' '}
                      <span className="font-mono text-[12.5px] font-normal text-ink-3">v{activeDocument.version}</span>
                    </h2>
                    <StatusBadge status={activeDocument.status} />
                    {isDirty && <span className="text-[12.5px] font-semibold text-warning">Unsaved changes</span>}
                  </div>
                  <p className="text-[12.5px] text-ink-3">Updated {new Date(activeDocument.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>

                {/* Publishing (Jira is the only implemented tracker) */}
                {(activeDocument.status === 'approved' || isPublished) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {jiraIntegration ? (
                      canPublish ? (
                        <button
                          type="button"
                          onClick={handlePublishJira}
                          disabled={busy !== null || isDirty}
                          title={isDirty ? 'Save or discard your edits first' : `Publish to ${jiraIntegration.name}`}
                          className="btn btn-primary btn-sm"
                        >
                          {busy === 'publish' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                          Publish to Jira
                        </button>
                      ) : null
                    ) : (
                      <button type="button" onClick={() => setConnectOpen(true)} className="btn btn-secondary btn-sm">
                        Connect Jira to publish
                      </button>
                    )}
                  </div>
                )}
              </header>

              <div className="space-y-6 p-6 md:p-8">
                <div>
                  <label htmlFor="doc-title" className="field-label">
                    Title
                  </label>
                  <input
                    id="doc-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    disabled={isPublished}
                    className="field font-semibold"
                  />
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="field-label mb-0">{viewMode === 'edit' ? 'Content (JSON)' : 'Content'}</span>
                    <div className="seg" role="group" aria-label="Content view">
                      <button type="button" aria-pressed={viewMode === 'preview'} onClick={() => setViewMode('preview')} className="seg-btn">
                        <FileText className="h-3.5 w-3.5" aria-hidden /> Readable
                      </button>
                      <button type="button" aria-pressed={viewMode === 'edit'} onClick={() => setViewMode('edit')} className="seg-btn">
                        <Code className="h-3.5 w-3.5" aria-hidden /> Edit JSON
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
                        rows={18}
                        spellCheck={false}
                        aria-invalid={!parsedEditor.ok}
                        aria-describedby={!parsedEditor.ok ? 'json-error' : undefined}
                        className="field font-mono text-[12.5px] leading-relaxed"
                      />
                      {!parsedEditor.ok && (
                        <p id="json-error" className="mt-2 text-[13px] font-medium text-danger">
                          {parsedEditor.error}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="min-h-[360px] rounded-xl border border-line bg-paper/50 p-6 md:p-8">{renderCleanView()}</div>
                  )}
                </div>
              </div>

              <footer className="flex flex-col gap-4 border-t border-line bg-paper/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
                <div className="min-w-0 flex-1 text-[13px]">
                  {ticketLinks.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-success">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Published as
                      </span>
                      {ticketLinks.map((l) => (
                        <a
                          key={l.id}
                          href={l.external_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="link inline-flex items-center gap-1 font-mono text-[12.5px]"
                        >
                          {l.external_id}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ))}
                    </p>
                  ) : isPublished ? (
                    <p className="font-medium text-warning">Published, but no ticket link was recorded. Check your tracker.</p>
                  ) : (
                    <p className="text-ink-3">Saving creates a new version. Editing an approved document sends it back to draft.</p>
                  )}
                </div>

                {!isPublished && (
                  <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={busy !== null || !isDirty || !parsedEditor.ok}
                      className="btn btn-secondary flex-1 sm:flex-initial"
                    >
                      {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      Save changes
                    </button>

                    {canReject && (
                      <button type="button" onClick={handleReject} disabled={busy !== null} className="btn btn-danger flex-1 sm:flex-initial">
                        {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
                        Reject
                      </button>
                    )}

                    {canReview && (
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={busy !== null || !parsedEditor.ok}
                        title={isDirty ? 'Approves the content currently in the editor' : undefined}
                        className="btn btn-primary flex-1 sm:flex-initial"
                      >
                        {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                        {isDirty ? 'Approve with edits' : 'Approve'}
                      </button>
                    )}
                  </div>
                )}
              </footer>
            </article>
          )}
        </div>
      </div>

      <SlideOver
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="Connect Jira"
        description="One-time setup. After this, approved documents publish to Jira from this page."
      >
        <JiraConnectForm
          idPrefix="review-jira"
          autoFocus
          submitLabel="Connect and continue"
          onConnected={(integration) => {
            setIntegrations((prev) => [integration, ...prev.filter((i) => i.id !== integration.id)]);
            setConnectOpen(false);
            toast(
              integration.config?.dry_run
                ? 'Jira connected in dry-run mode. Click Publish to Jira to try it.'
                : 'Jira connected. Click Publish to Jira to create the issue.',
              'success',
            );
          }}
        />
      </SlideOver>
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
