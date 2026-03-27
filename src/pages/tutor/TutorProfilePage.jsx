import { useState } from 'react';
import { AppShell } from '../../components/common/AppShell';
import { useAuth } from '../../hooks/useAuth';
import { updateUserProfileDetails } from '../../services/authService';

export const TutorProfilePage = () => {
  const { profile, logout, isDemoMode } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await updateUserProfileDetails({
        uid: profile?.uid,
        displayName,
        newPassword: password || undefined,
      });
      setMessage('Profile updated successfully!');
      setPassword('');
    } catch (error) {
      setMessage(error.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Profile"
      subtitle="Update your tutor account details and security settings."
      role="tutor"
      user={profile}
      onLogout={logout}
    >
      <form onSubmit={handleSave} className="panel max-w-2xl space-y-5 p-6">
        {message ? <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">{message}</div> : null}
        <div>
          <label className="label">Full Name</label>
          <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={profile?.email || ''} disabled />
        </div>
        <div>
          <label className="label">New Password (leave blank to keep current)</label>
          <input type="password" minLength={6} className="input" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full md:w-auto">
          {saving ? 'Saving...' : 'Update Profile'}
        </button>
      </form>

      <div className="panel mt-6 p-5 text-sm text-slate-600">
        Environment mode: {isDemoMode ? 'Demo' : 'Live'}.
      </div>
    </AppShell>
  );
};
