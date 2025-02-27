'use client';

import { useEffect, useState } from 'react';
import { TummyButton } from './ui/TummyButton';
import { TummyCard } from './ui/TummyCard';
import { tummyTheme as theme } from './ui/theme';

interface Permission {
  name: string;
  state: PermissionState;
}

interface PermissionRequestProps {
  onAllGranted: () => void;
  onDenied: () => void;
}

export function PermissionRequest({ onAllGranted, onDenied }: PermissionRequestProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const perms = await Promise.all([
        navigator.permissions.query({ name: 'camera' as PermissionName }),
        navigator.permissions.query({ name: 'geolocation' })
      ]);

      setPermissions([
        { name: 'Camera', state: perms[0].state },
        { name: 'Location', state: perms[1].state }
      ]);

      // Check if all permissions are already granted
      if (perms.every(p => p.state === 'granted')) {
        onAllGranted();
      }

      // Listen for changes
      perms.forEach(p => {
        p.addEventListener('change', () => {
          checkPermissions();
        });
      });
    } catch (err) {
      setError('Failed to check permissions');
      console.error('Permission check error:', err);
    }
  };

  const requestPermissions = async () => {
    try {
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      stream.getTracks().forEach(track => track.stop()); // Stop immediately after permission

      // Request location access
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      // Recheck permissions
      await checkPermissions();
    } catch (err) {
      setError('Failed to get permissions');
      console.error('Permission request error:', err);
      onDenied();
    }
  };

  if (permissions.every(p => p.state === 'granted')) {
    return null;
  }

  return (
    <TummyCard className="w-full max-w-lg p-6">
      <div className="space-y-6">
        <div className="text-center">
          <h2 
            className="text-xl font-bold mb-2"
            style={{ color: theme.colors.primary.DEFAULT }}
          >
            Permissions Required
          </h2>
          <p className="text-sm opacity-70">
            We need the following permissions to scan your items:
          </p>
        </div>

        <div className="space-y-4">
          {permissions.map(permission => (
            <div 
              key={permission.name}
              className="flex items-center justify-between p-3 rounded"
              style={{ backgroundColor: theme.colors.muted.DEFAULT }}
            >
              <span className="font-medium">{permission.name}</span>
              <span 
                className="text-sm px-2 py-1 rounded"
                style={{
                  backgroundColor: permission.state === 'granted' 
                    ? theme.colors.accent.DEFAULT 
                    : theme.colors.secondary.DEFAULT,
                  color: permission.state === 'granted'
                    ? theme.colors.accent.foreground
                    : theme.colors.secondary.foreground
                }}
              >
                {permission.state === 'granted' ? 'Granted' : 'Required'}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <p 
            className="text-sm text-center"
            style={{ color: theme.colors.secondary.DEFAULT }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-4">
          <TummyButton
            variant="secondary"
            className="flex-1"
            onClick={onDenied}
          >
            Cancel
          </TummyButton>
          <TummyButton
            variant="primary"
            className="flex-1"
            onClick={requestPermissions}
            glowing
          >
            Grant Access
          </TummyButton>
        </div>
      </div>
    </TummyCard>
  );
} 