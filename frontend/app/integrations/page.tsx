'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Integration } from '@/types/models';
import { useToast } from '@/components/ui/ToastProvider';
import ProtectedRoute from '@/components/ProtectedRoute';
import { 
  Settings, 
  Github, 
  Plus, 
  Trash2, 
  Loader2, 
  AlertTriangle,
  Link2,
  CheckCircle2
} from 'lucide-react';

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [submitting, setSubmitting] = useState<string | null>(null);
  
  // GitHub Form
  const [ghToken, setGhToken] = useState('');
  const [ghRepo, setGhRepo] = useState('');

  // Jira Form
  const [jiraUrl, setJiraUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraToken, setJiraToken] = useState('');
  const [jiraProject, setJiraProject] = useState('');

  // Linear Form
  const [linToken, setLinToken] = useState('');
  const [linTeam, setLinTeam] = useState('');

  const loadIntegrations = async () => {
    try {
      setError(null);
      const res = await api.getIntegrations();
      setIntegrations(res.integrations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch active integration pipelines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const handleConnect = async (type: 'github' | 'jira' | 'linear') => {
    setSubmitting(type);
    try {
      let payload: Partial<Integration> = {
        type,
        name: `Active ${type.toUpperCase()} pipeline`,
        is_active: true,
      };

      if (type === 'github') {
        if (!ghToken || !ghRepo) throw new Error('Token and Repository name are required.');
        payload.api_key = ghToken;
        payload.project_id = ghRepo;
        payload.config = { dry_run: true }; // Enforce safe dry-run tests by default
      } else if (type === 'jira') {
        if (!jiraUrl || !jiraEmail || !jiraToken || !jiraProject) {
          throw new Error('All fields are required to bind Jira Cloud.');
        }
        payload.api_url = jiraUrl;
        payload.api_key = jiraToken;
        payload.project_id = jiraProject;
        payload.config = { email: jiraEmail, dry_run: true };
      } else {
        if (!linToken || !linTeam) throw new Error('Token and Team ID are required.');
        payload.api_key = linToken;
        payload.project_id = linTeam;
        payload.config = { dry_run: true };
      }

      await api.createIntegration(payload);
      toast(`Successfully connected ${type.toUpperCase()}!`, 'success');
      
      // Clear forms
      if (type === 'github') {
        setGhToken('');
        setGhRepo('');
      } else if (type === 'jira') {
        setJiraUrl('');
        setJiraEmail('');
        setJiraToken('');
        setJiraProject('');
      } else {
        setLinToken('');
        setLinTeam('');
      }

      loadIntegrations();
    } catch (err: any) {
      toast(err.message || `Failed to link ${type}`, 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDisconnect = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to disconnect ${name}?`)) return;
    try {
      await api.deleteIntegration(id);
      toast('Integration disconnected successfully', 'success');
      loadIntegrations();
    } catch (err: any) {
      toast(err.message || 'Failed to disconnect integration', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-10 h-10 text-slate-900 dark:text-zinc-300 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading integrations settings...</p>
      </div>
    );
  }

  const activeGitHub = integrations.find((i) => i.type === 'github');
  const activeJira = integrations.find((i) => i.type === 'jira');
  const activeLinear = integrations.find((i) => i.type === 'linear');

  return (
    <ProtectedRoute>
      <div className="space-y-8 animate-fade-in max-w-5xl mx-auto pb-16">
        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Integration Settings</h2>
          <p className="text-sm text-slate-500">Connect third-party issue trackers. API keys are encrypted and stored backend-side.</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-500" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Grid Layout of Platforms */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 1. GitHub card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-slate-900 text-white p-2 rounded-lg">
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">GitHub Issues</h4>
                  <p className="text-xs text-slate-400">Publish stories as issues.</p>
                </div>
              </div>

              {activeGitHub ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Connected Pipeline
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p><strong>Repo:</strong> {activeGitHub.project_id}</p>
                    <p><strong>Status:</strong> Dry-run mode enabled</p>
                  </div>
                  <button
                    onClick={() => handleDisconnect(activeGitHub.id, activeGitHub.name)}
                    className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-bold mt-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Disconnect Pipeline
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GitHub PAT Token</label>
                    <input
                      type="password"
                      value={ghToken}
                      onChange={(e) => setGhToken(e.target.value)}
                      placeholder="ghp_..."
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repository Path</label>
                    <input
                      type="text"
                      value={ghRepo}
                      onChange={(e) => setGhRepo(e.target.value)}
                      placeholder="e.g. owner/repo"
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <button
                    onClick={() => handleConnect('github')}
                    disabled={submitting !== null || !ghToken || !ghRepo}
                    className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded disabled:opacity-50 transition-colors"
                  >
                    {submitting === 'github' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Connect GitHub
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Jira card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-slate-900 text-white p-2 rounded-lg font-bold text-sm leading-none flex items-center justify-center w-9 h-9">
                  JR
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">Jira Cloud</h4>
                  <p className="text-xs text-slate-400">Publish stories as Jira tasks.</p>
                </div>
              </div>

              {activeJira ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Connected Pipeline
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p><strong>Host:</strong> {activeJira.api_url}</p>
                    <p><strong>Project Key:</strong> {activeJira.project_id}</p>
                  </div>
                  <button
                    onClick={() => handleDisconnect(activeJira.id, activeJira.name)}
                    className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-bold mt-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Disconnect Pipeline
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jira Instance URL</label>
                    <input
                      type="text"
                      value={jiraUrl}
                      onChange={(e) => setJiraUrl(e.target.value)}
                      placeholder="https://company.atlassian.net"
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jira User Email</label>
                    <input
                      type="email"
                      value={jiraEmail}
                      onChange={(e) => setJiraEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jira API Token</label>
                    <input
                      type="password"
                      value={jiraToken}
                      onChange={(e) => setJiraToken(e.target.value)}
                      placeholder="API Token secret"
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Key</label>
                    <input
                      type="text"
                      value={jiraProject}
                      onChange={(e) => setJiraProject(e.target.value)}
                      placeholder="e.g. PROJ"
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <button
                    onClick={() => handleConnect('jira')}
                    disabled={submitting !== null || !jiraUrl || !jiraEmail || !jiraToken || !jiraProject}
                    className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded disabled:opacity-50 transition-colors"
                  >
                    {submitting === 'jira' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-300" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Connect Jira
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 3. Linear card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-slate-900 text-white p-2 rounded-lg font-bold text-sm leading-none flex items-center justify-center w-9 h-9">
                  LN
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">Linear Workspace</h4>
                  <p className="text-xs text-slate-400">Publish stories as Linear tickets.</p>
                </div>
              </div>

              {activeLinear ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Connected Pipeline
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p><strong>Team ID:</strong> {activeLinear.project_id}</p>
                    <p><strong>Status:</strong> Dry-run mode enabled</p>
                  </div>
                  <button
                    onClick={() => handleDisconnect(activeLinear.id, activeLinear.name)}
                    className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-bold mt-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Disconnect Pipeline
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Linear API Key</label>
                    <input
                      type="password"
                      value={linToken}
                      onChange={(e) => setLinToken(e.target.value)}
                      placeholder="lin_api_..."
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team ID (UUID)</label>
                    <input
                      type="text"
                      value={linTeam}
                      onChange={(e) => setLinTeam(e.target.value)}
                      placeholder="Linear Team UUID"
                      className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <button
                    onClick={() => handleConnect('linear')}
                    disabled={submitting !== null || !linToken || !linTeam}
                    className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded disabled:opacity-50 transition-colors"
                  >
                    {submitting === 'linear' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Connect Linear
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
