'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { PageHeader } from '@/components/app/primitives';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [about, setAbout] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setDob(profile.dob || '');
      setAbout(profile.about_description || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setMessage(null);

    const updates = {
      full_name: fullName,
      dob: dob || null,
      about_description: about || null,
      avatar_url: avatarUrl || null,
    };

    // upsert: the row may not exist yet if the user skipped "complete profile"
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email, ...updates });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Profile saved.' });
      await refreshProfile();
    }
    setLoading(false);
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setMessage(null);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      if (!user) throw new Error('You must be signed in to upload an avatar.');
      const file = event.target.files[0];
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
      if (file.size > 2 * 1024 * 1024) throw new Error('Avatar must be 2 MB or smaller.');
      const fileExt = (file.name.split('.').pop() || 'png').toLowerCase();
      // Storage policy only allows writes under "<user id>/"
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(`Avatar upload failed: ${uploadError.message}`);
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error uploading image' });
    } finally {
      setUploading(false);
    }
  };

  const initial = (fullName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-[760px] space-y-10 pb-8">
        <PageHeader
          eyebrow="account · profile"
          title="Profile"
          description="How you appear to your team when you review and approve work."
        />

        {message && (
          <div role={message.type === 'error' ? 'alert' : 'status'} className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
            {message.type === 'error' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <p>{message.text}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="card overflow-hidden">
          {/* Photo */}
          <div className="flex flex-col gap-5 border-b border-line p-6 sm:flex-row sm:items-center md:px-8">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-stone">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your profile photo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-display text-[34px] text-ink-2">{initial}</span>
              )}
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/50">
                  <Loader2 className="h-5 w-5 animate-spin text-paper" aria-hidden />
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-semibold">Photo</p>
              <p className="mt-0.5 text-[13px] text-ink-2">A square image works best. PNG or JPG, up to 2 MB.</p>
            </div>
            <label className={`btn btn-secondary cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" onChange={uploadAvatar} disabled={uploading} className="sr-only" />
            </label>
          </div>

          {/* Details */}
          <div className="grid gap-5 p-6 md:grid-cols-2 md:px-8">
            <div>
              <label htmlFor="name" className="field-label">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="field"
              />
            </div>
            <div>
              <label htmlFor="dob" className="field-label">
                Date of birth
              </label>
              <input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="field" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="about" className="field-label">
                About you
              </label>
              <textarea
                id="about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Your role and what you work on."
                rows={4}
                className="field"
              />
            </div>
          </div>

          {/* Account (read-only) */}
          <div className="grid gap-5 border-t border-line p-6 md:grid-cols-2 md:px-8">
            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input id="email" type="email" readOnly value={user?.email || ''} className="field" />
            </div>
            <div>
              <label htmlFor="uid" className="field-label">
                User ID
              </label>
              <input id="uid" type="text" readOnly value={user?.id || ''} aria-describedby="uid-hint" className="field font-mono text-[13px]" />
              <p id="uid-hint" className="field-hint">
                Assigned by the system. It can&apos;t be changed.
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-line bg-paper/60 p-5 md:px-8">
            <button type="submit" disabled={loading || uploading} className="btn btn-primary">
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {loading ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
