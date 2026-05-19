'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import { Cluster } from '@/types/models';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { 
  Inbox, 
  Plus, 
  Play, 
  BarChart2, 
  Layers, 
  FileText, 
  ArrowRight,
  Loader2,
  AlertTriangle
} from 'lucide-react';

export default function FeedbackInboxPage() {
  const { toast } = useToast();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [stats, setStats] = useState<{ total: number; by_source: Record<string, number> }>({ total: 0, by_source: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Action states
  const [ingestText, setIngestText] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [clustering, setClustering] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [clusterRes, statsRes] = await Promise.all([
        api.getClusters(),
        api.getFeedbackStats()
      ]);
      setClusters(clusterRes.clusters || []);
      setStats(statsRes || { total: 0, by_source: {} });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch cluster and statistics records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim()) return;

    setIngesting(true);
    try {
      const res = await api.ingestManualFeedback(ingestText);
      toast('Feedback ingested successfully!', 'success');
      setIngestText('');
      fetchData(); // reload
    } catch (err: any) {
      toast(err.message || 'Feedback ingestion failed', 'error');
    } finally {
      setIngesting(false);
    }
  };

  const handleRunClustering = async () => {
    setClustering(true);
    try {
      const res = await api.triggerClustering();
      toast(`Clustering complete! Processed ${res.processed || 0} items.`, 'success');
      fetchData();
    } catch (err: any) {
      toast(err.message || 'Failed to trigger clustering', 'error');
    } finally {
      setClustering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading ApeAI memory backbone...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Feedback Inbox</h2>
          <p className="text-sm text-slate-500">AI-clustered customer signals awaiting product operation workflows.</p>
        </div>
        <button
          onClick={handleRunClustering}
          disabled={clustering}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
        >
          {clustering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Run AI Clustering
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center gap-4">
          <div className="bg-blue-50 text-blue-600 p-3 rounded-lg">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Raw Signals</p>
            <h3 className="text-2xl font-extrabold text-slate-800">{stats.total}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center gap-4">
          <div className="bg-indigo-50 text-indigo-600 p-3 rounded-lg">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Generated Clusters</p>
            <h3 className="text-2xl font-extrabold text-slate-800">{clusters.length}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center gap-4">
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-lg">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Manual Ingestion</p>
            <h3 className="text-2xl font-extrabold text-slate-800">{stats.by_source.manual || 0}</h3>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-500" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Grid: Signals Input & Clusters List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Manual signal ingestion form */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Ingest Raw Signal</h3>
              <p className="text-xs text-slate-500">Add user feedback manually to trigger AI parsing pipelines.</p>
            </div>
            <form onSubmit={handleIngest} className="space-y-3">
              <textarea
                value={ingestText}
                onChange={(e) => setIngestText(e.target.value)}
                placeholder="e.g. Visitors dashboard takes almost 5 seconds to load up. The latency is quite noticeable and annoying."
                rows={4}
                required
                className="w-full text-sm border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={ingesting || !ingestText.trim()}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {ingesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Submit Signal
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Clusters list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Active Signals Clusters</h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">
              {clusters.length} Groups
            </span>
          </div>

          {clusters.length === 0 ? (
            <div className="bg-white border border-slate-200 border-dashed rounded-xl p-12 text-center flex flex-col items-center justify-center gap-4">
              <Layers className="w-12 h-12 text-slate-300" />
              <div>
                <h4 className="font-bold text-slate-700">No Clusters Formed Yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Ingest some feedback signals and click the &quot;Run AI Clustering&quot; button to group them automatically using pgvector.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {clusters.map((cluster) => (
                <div 
                  key={cluster.id}
                  className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow duration-200 flex flex-col sm:flex-row justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="font-bold text-slate-800 text-base">{cluster.title}</h4>
                      <StatusBadge status={cluster.status} />
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">
                      {cluster.summary || 'Summary draft not generated yet. Trigger summarizing below.'}
                    </p>
                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 mt-4">
                      <span>Grouped signals: <strong className="text-slate-600">{cluster.feedback_count || 1}</strong></span>
                      <span>Created: {new Date(cluster.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-row sm:flex-col items-stretch justify-end gap-2.5 sm:w-44 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <Link
                      href={`/pipeline/${cluster.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold py-2 rounded-lg transition-colors"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      View Pipeline
                    </Link>
                    <Link
                      href={`/review/${cluster.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold py-2 rounded-lg transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Review AI Draft
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
