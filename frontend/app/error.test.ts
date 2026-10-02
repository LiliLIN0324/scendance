// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFloor, makeItem, makeLayout } from '../components/room-organizer/lib/__testfixtures__/fixtures';
import { STORAGE_KEY } from '../components/room-organizer/lib/constants';
import { RECOVERY_STORAGE_KEY, readRecoveryCopies } from '../components/room-organizer/lib/persistence';
import { VERSION_HISTORY_STORAGE_KEY } from '../components/room-organizer/lib/version-history';
import ErrorBoundaryPage from './error';

const renderBoundary = (error: Error & { digest?: string }) =>
  render(createElement(ErrorBoundaryPage, { error, reset: () => {} }));

function chunkError(): Error & { digest?: string } {
  const error = new Error('Loading chunk 805 failed.') as Error & { digest?: string };
  error.name = 'ChunkLoadError';
  return error;
}

describe('app/error.tsx — chunk-failure recovery (#143)', () => {
  let reload: ReturnType<typeof vi.fn>;

  afterEach(cleanup);

  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
    });
  });

  it('reloads once for a chunk error when the guard is unspent', () => {
    renderBoundary(chunkError());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('pc-chunk-reload')).toBe('1');
  });

  it('does NOT reload again once the guard is spent — shows the safe retry UI instead', () => {
    window.sessionStorage.setItem('pc-chunk-reload', '1');
    renderBoundary(chunkError());
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/部分页面文件未能加载/)).toBeDefined();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeDefined();
    // A deploy problem must never offer to delete the user's saved house.
    expect(screen.queryByRole('button', { name: /保留备份，开始新方案/ })).toBeNull();
  });
});

describe('app/error.tsx — recovery never loses the house (#336)', () => {
  let reload: ReturnType<typeof vi.fn>;
  const house = JSON.stringify(
    makeLayout({ name: 'Crashy', floors: [makeFloor({ items: [makeItem({ id: 'sofa' })] })] })
  );

  afterEach(cleanup);

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
    });
  });

  const boom = () => renderBoundary(new Error('boom') as Error & { digest?: string });

  it('offers a plain reload first and leaves storage alone', () => {
    window.localStorage.setItem(STORAGE_KEY, house);
    boom();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /保留备份，开始新方案/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(house);
  });

  it('offers start-fresh only when the crash comes back after a reload, and keeps a copy', () => {
    window.localStorage.setItem(STORAGE_KEY, house);
    boom();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    cleanup();

    boom();
    expect(screen.getByText(/本地草稿暂时无法打开/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /保留备份，开始新方案/ }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readRecoveryCopies().map(({ raw }) => raw)).toEqual([house]);
    expect(window.localStorage.getItem(VERSION_HISTORY_STORAGE_KEY)).toContain('Crashy');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not offer start-fresh when nothing is saved', () => {
    boom();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    cleanup();
    boom();
    expect(screen.queryByRole('button', { name: /保留备份，开始新方案/ })).toBeNull();
  });

  const failSetItem = (name: string) =>
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error(name), { name });
    });

  const crashTwice = () => {
    window.localStorage.setItem(STORAGE_KEY, house);
    boom();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    cleanup();
    boom();
  };

  it('refuses to reset when storage blocks the copy', () => {
    crashTwice();
    const setItem = failSetItem('SecurityError');
    try {
      fireEvent.click(screen.getByRole('button', { name: /保留备份，开始新方案/ }));
    } finally {
      setItem.mockRestore();
    }
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(house);
    expect(screen.getByRole('alert').textContent).toMatch(/原草稿未删除/);
    expect(screen.getByRole('button', { name: /下载本地草稿/ })).toBeDefined();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says so and keeps the download when storage fails mid-move', () => {
    crashTwice();
    const setItem = failSetItem('QuotaExceededError');
    try {
      fireEvent.click(screen.getByRole('button', { name: /保留备份，开始新方案/ }));
    } finally {
      setItem.mockRestore();
    }
    expect(screen.getByRole('alert').textContent).toMatch(/浏览器存储失败，请在离开此页前下载当前草稿/);
    expect(screen.getByRole('button', { name: /下载本地草稿/ })).toBeDefined();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps an older recovery copy when starting fresh', () => {
    window.localStorage.setItem(RECOVERY_STORAGE_KEY, 'older copy');
    crashTwice();
    fireEvent.click(screen.getByRole('button', { name: /保留备份，开始新方案/ }));
    expect(readRecoveryCopies().map(({ raw }) => raw)).toEqual([house, 'older copy']);
  });

  it('moves and downloads the house as stored at click time, not as first rendered', async () => {
    crashTwice();
    // The crashed editor's unmount flush lands after this screen first rendered.
    const flushed = JSON.stringify(makeLayout({ name: 'Flushed edits' }));
    window.localStorage.setItem(STORAGE_KEY, flushed);
    const setItem = failSetItem('QuotaExceededError');
    try {
      fireEvent.click(screen.getByRole('button', { name: /保留备份，开始新方案/ }));
    } finally {
      setItem.mockRestore();
    }
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    let downloaded: Blob | null = null;
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        downloaded = blob;
        return 'blob:test';
      },
      revokeObjectURL: () => {},
    });
    fireEvent.click(screen.getByRole('button', { name: /下载本地草稿/ }));
    expect(await (downloaded as Blob | null)?.text()).toBe(flushed);
  });
});
