'use client';

import { useEffect, useState } from 'react';
import {
  clearChunkReloadGuard,
  isChunkLoadError,
  reloadOnceForChunkError,
} from '../components/room-organizer/lib/chunk-reload';
import {
  crashRecurredAfterReload,
  downloadRawLayout,
  noteReloadAttempt,
  parseLayoutJson,
  readStoredLayoutRaw,
  resetStoredLayout,
} from '../components/room-organizer/lib/persistence';
import { snapshotBeforeReplace } from '../components/room-organizer/lib/restore-point';

// Route-level error boundary. Most render errors are not the saved house's
// fault — a GPU hiccup, a bad library entry — so a plain reload comes first
// and leaves storage alone. Only when the crash comes straight back after a
// reload is the saved house suspected, and even then "start fresh" moves it
// aside to the recovery key, where the History list can restore it (#336).

const buttonStyle: React.CSSProperties = {
  appearance: 'none',
  cursor: 'pointer',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: 8,
  padding: '10px 18px',
  fontFamily: 'var(--pc-font-display)',
  fontWeight: 700,
  letterSpacing: 'var(--pc-tr-caps)',
  textTransform: 'uppercase',
  fontSize: 12,
};
const primaryButton: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--pc-cyan-glow, #22d3ee)',
  color: '#0f172a',
};
const secondaryButton: React.CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: 'var(--pc-paper, #f8fafc)',
};
const bodyStyle: React.CSSProperties = {
  margin: '0 0 16px',
  fontFamily: 'var(--pc-font-body)',
  color: 'var(--pc-paper-soft)',
  fontSize: 13,
  lineHeight: 1.5,
};

export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }): JSX.Element {
  useEffect(() => {
    // Stale-chunk failures hard-reload ONCE via the shared pc-chunk-reload
    // guard (`reset()` would just re-request the same dead chunk). An
    // unguarded reload here looped forever on a persistently missing chunk —
    // a broken deploy — and made this screen unreachable (#143). When the
    // guard is already spent, fall through to the UI below instead.
    reloadOnceForChunkError(error);
  }, [error]);

  // A persistent chunk failure is a deploy problem, not a corrupt save —
  // offering a reset for it would move the user's house aside for nothing (#143).
  const chunkFailure = isChunkLoadError(error);
  const [storedRaw, setStoredRaw] = useState(() => (chunkFailure ? null : readStoredLayoutRaw()));
  const [suspectSave] = useState(() => !chunkFailure && crashRecurredAfterReload());
  const [resetFailure, setResetFailure] = useState<'refused' | 'lost' | null>(null);

  const retryChunkLoad = () => {
    clearChunkReloadGuard();
    window.location.reload();
  };

  const reload = () => {
    noteReloadAttempt();
    // Hard reload rather than the soft `reset()`: the layout lives in a
    // module-level store, so a soft remount would keep the crash-causing
    // state in memory.
    window.location.reload();
  };

  const startFresh = () => {
    // This screen first rendered before the crashed editor's unmount flush
    // wrote its last edits; read the house as it is stored now, and keep
    // that for the download if the reset can't finish.
    const latest = readStoredLayoutRaw();
    if (latest !== null) setStoredRaw(latest);
    const outcome = resetStoredLayout();
    if (outcome !== 'moved') {
      setResetFailure(outcome);
      return;
    }
    // A second way back, in the History list itself.
    snapshotBeforeReplace(latest === null ? null : parseLayoutJson(latest));
    window.location.reload();
  };

  // Once a reset lost the house from storage, the kept value is the only copy.
  const downloadHouse = () => {
    const raw = readStoredLayoutRaw() ?? storedRaw;
    if (raw !== null) downloadRawLayout(raw, 'saved-house.json');
  };

  const offerReset = suspectSave && storedRaw !== null;

  let message: string;
  if (chunkFailure) {
    message =
      '部分页面文件未能加载，请重新加载。已保存的本地草稿不会被删除。';
  } else if (offerReset) {
    message =
      '本地草稿暂时无法打开。可以先下载备份，再开始新方案；恢复点会在本机保留。';
  } else {
    message = '工作台暂时无法打开，请重新加载。已保存的本地草稿不会被删除。';
  }

  return (
    <div
      className="pc-world"
      style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <div
        className="pc-glass pc-glass--dark"
        style={{ padding: '28px 32px', textAlign: 'center', maxWidth: 440 }}
      >
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--pc-font-display)',
            fontWeight: 700,
            color: 'var(--pc-paper)',
            letterSpacing: 'var(--pc-tr-caps)',
            textTransform: 'uppercase',
            fontSize: 16,
          }}
        >
          {chunkFailure ? '页面加载失败' : '工作台暂时遇到问题'}
        </p>
        <p style={bodyStyle}>{message}</p>
        {resetFailure && (
          <p role="alert" style={{ ...bodyStyle, color: 'var(--pc-danger, #f87171)' }}>
            {resetFailure === 'refused'
              ? '浏览器无法保存备份，原草稿未删除。请先下载草稿。'
              : '浏览器存储失败，请在离开此页前下载当前草稿。'}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          <button type="button" onClick={chunkFailure ? retryChunkLoad : reload} style={primaryButton}>
            重新加载
          </button>
          {offerReset && !resetFailure && (
            <button type="button" onClick={startFresh} style={secondaryButton}>
              保留备份，开始新方案
            </button>
          )}
          {storedRaw !== null && (
            <button
              type="button"
              onClick={downloadHouse}
              style={secondaryButton}
            >
              下载本地草稿
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
