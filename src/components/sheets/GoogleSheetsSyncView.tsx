import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Plus,
  Play,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sliders,
  Clock,
  ShieldCheck,
  Building2,
  Info,
  LogOut,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import {
  initGoogleAuth,
  googleSignIn,
  googleSignOut,
  getAccessToken,
  getCurrentGoogleUser,
  fetchSpreadsheetMeta,
  createDefaultMoraJawsSpreadsheet,
  extractSpreadsheetId,
  STANDARD_SHEET_HEADERS,
  setManualAccessToken,
  signInWithGoogleIdentityServices,
  initGISTokenClient,
  requestGISTokenSynchronously,
  getDirectGoogleOAuthUrl
} from '../../services/googleSheetsService.ts';
import { GoogleSpreadsheetMeta } from '../../types/sheets.ts';

export const GoogleSheetsSyncView: React.FC = () => {
  const {
    googleSheetsConfig,
    updateGoogleSheetsConfig,
    syncGoogleSheetsNow,
    tickets,
    contractors,
    currentUser
  } = useApp();

  const [googleUser, setGoogleUser] = useState<any>(getCurrentGoogleUser());
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form input state per Section 4 specifications
  const [projectId, setProjectId] = useState<string>((googleSheetsConfig as any).projectId || 'clever-gearing-s5wls');
  const [spreadsheetInput, setSpreadsheetInput] = useState(googleSheetsConfig.spreadsheetUrl || googleSheetsConfig.spreadsheetId || '');
  const [selectedSheetName, setSelectedSheetName] = useState(googleSheetsConfig.sheetName || 'Work_Orders');
  const [destSheetName, setDestSheetName] = useState<string>((googleSheetsConfig as any).destSheetName || 'Work_Orders');
  const [authMethod, setAuthMethod] = useState<'oauth_token' | 'service_account' | 'api_key'>((googleSheetsConfig as any).authMethod || 'oauth_token');
  const [availableSheets, setAvailableSheets] = useState<string[]>([googleSheetsConfig.sheetName || 'Work_Orders']);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState(googleSheetsConfig.spreadsheetTitle || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [backendStatus, setBackendStatus] = useState<string>(googleSheetsConfig.lastSyncStatus || 'Disconnected');
  const [lastErrorMessage, setLastErrorMessage] = useState<string>((googleSheetsConfig as any).lastErrorMessage || '');
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  // Sync execution state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Confirmation modal for Push/Overwrite
  const [showPushConfirmModal, setShowPushConfirmModal] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [showColumnsGuide, setShowColumnsGuide] = useState(false);

  // Manual token & fallback auth state
  const [showManualTokenInput, setShowManualTokenInput] = useState(false);
  const [manualTokenVal, setManualTokenVal] = useState('');
  const [isSubmittingManualToken, setIsSubmittingManualToken] = useState(false);

  // Initialize auth listener & Google Identity Services client
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user) => {
        setGoogleUser(user);
        setAuthError(null);
      },
      () => {
        setGoogleUser(null);
      }
    );

    // Prepare GIS client as soon as script is loaded
    const setupGIS = () => {
      initGISTokenClient(
        (data) => {
          setGoogleUser(data.user);
          setAuthError(null);
          setIsAuthLoading(false);
        },
        (err) => {
          setAuthError(err.message);
          setIsAuthLoading(false);
        }
      );
    };

    setupGIS();
    const interval = setInterval(() => {
      if ((window as any).google?.accounts?.oauth2) {
        setupGIS();
        clearInterval(interval);
      }
    }, 500);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Synchronous click handler for Google OAuth to prevent browser popup blocking
  const handleLoginGoogle = () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      requestGISTokenSynchronously('consent');
    } catch (err: any) {
      setIsAuthLoading(false);
      setAuthError(err?.message || 'Gagal membuka jendela Google OAuth. Harap muat ulang halaman.');
    }
  };

  const handleLoginFirebasePopup = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      setGoogleUser(res.user);
    } catch (err: any) {
      setAuthError(err?.message || 'Gagal masuk via Firebase Auth.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleApplyManualToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTokenVal.trim()) {
      setAuthError('Harap tempelkan token akses Google OAuth.');
      return;
    }
    setIsSubmittingManualToken(true);
    setAuthError(null);
    try {
      const res = await setManualAccessToken(manualTokenVal);
      setGoogleUser(res.user);
      setShowManualTokenInput(false);
      setManualTokenVal('');
    } catch (err: any) {
      setAuthError(err?.message || 'Token tidak valid atau tidak memiliki izin ke Google Sheets.');
    } finally {
      setIsSubmittingManualToken(false);
    }
  };

  const handleLogoutGoogle = async () => {
    await googleSignOut();
    setGoogleUser(null);
    updateGoogleSheetsConfig({ enabled: false });
  };

  const handleTestConnection = async () => {
    const cleanId = extractSpreadsheetId(spreadsheetInput) || googleSheetsConfig.spreadsheetId;
    if (!cleanId) {
      setVerifyNotice({ type: 'error', message: 'Masukkan URL atau Spreadsheet ID terlebih dahulu.' });
      return;
    }
    setIsVerifying(true);
    setVerifyNotice(null);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/integrations/google-sheets/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-google-access-token': token, 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          spreadsheetId: cleanId,
          sheetName: selectedSheetName || destSheetName || 'Work_Orders',
          accessToken: token
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLatencyMs(data.latencyMs || null);
        setBackendStatus('Connected');
        setDetectedHeaders(data.headers || []);
        if (data.sheets && data.sheets.length > 0) {
          setAvailableSheets(data.sheets);
        }
        setVerifyNotice({
          type: 'success',
          message: `Koneksi Google Sheets Berhasil (${data.latencyMs || 0}ms). Ditemukan ${data.sheets?.length || 0} tab sheet dan ${data.headers?.length || 0} kolom Work Order.`
        });
        updateGoogleSheetsConfig({
          spreadsheetId: cleanId,
          sheetName: selectedSheetName || destSheetName || 'Work_Orders'
        });
      } else {
        setBackendStatus('Error');
        setLastErrorMessage(data.message || 'Gagal menguji koneksi Google Sheets.');
        setVerifyNotice({
          type: 'error',
          message: data.message || 'Gagal menguji koneksi Google Sheets.'
        });
      }
    } catch (err: any) {
      setBackendStatus('Error');
      setLastErrorMessage(err.message || 'Kesalahan jaringan saat pengujian.');
      setVerifyNotice({
        type: 'error',
        message: err.message || 'Kesalahan jaringan saat pengujian koneksi.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      const res = await fetch('/api/integrations/google-sheets/status');
      if (res.ok) {
        const data = await res.json();
        setBackendStatus(data.status || 'Unknown');
        if (data.lastError) setLastErrorMessage(data.lastError);
        if (data.config?.spreadsheetId && !spreadsheetInput) {
          setSpreadsheetInput(data.config.spreadsheetId);
        }
      }
    } catch {
      // quiet catch
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handleVerifySpreadsheet = async () => {
    const cleanId = extractSpreadsheetId(spreadsheetInput);
    if (!cleanId) {
      setVerifyNotice({ type: 'error', message: 'Masukkan URL atau ID Google Spreadsheet yang valid.' });
      return;
    }

    if (!getAccessToken()) {
      setVerifyNotice({ type: 'error', message: 'Silakan masuk dengan akun Google terlebih dahulu.' });
      return;
    }

    setIsVerifying(true);
    setVerifyNotice(null);

    try {
      const meta = await fetchSpreadsheetMeta(cleanId);
      setSpreadsheetTitle(meta.title);
      setAvailableSheets(meta.sheets);
      if (!meta.sheets.includes(selectedSheetName)) {
        setSelectedSheetName(meta.sheets[0] || 'Work_Orders');
      }

      updateGoogleSheetsConfig({
        spreadsheetId: meta.id,
        spreadsheetUrl: meta.url,
        spreadsheetTitle: meta.title,
        sheetName: meta.sheets.includes(selectedSheetName) ? selectedSheetName : (meta.sheets[0] || 'Work_Orders')
      });

      setVerifyNotice({
        type: 'success',
        message: `Spreadsheet "${meta.title}" berhasil diverifikasi (${meta.sheets.length} tab terdeteksi).`
      });
    } catch (err: any) {
      setVerifyNotice({
        type: 'error',
        message: err?.message || 'Gagal memverifikasi spreadsheet.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCreateNewSpreadsheet = async () => {
    if (!getAccessToken()) {
      alert('Silakan masuk dengan akun Google terlebih dahulu.');
      return;
    }

    setIsCreatingSheet(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const meta = await createDefaultMoraJawsSpreadsheet(`MoraJaws_WO_Sync_${dateStr}`);
      setSpreadsheetInput(meta.url);
      setSpreadsheetTitle(meta.title);
      setAvailableSheets(meta.sheets);
      setSelectedSheetName('Work_Orders');

      updateGoogleSheetsConfig({
        spreadsheetId: meta.id,
        spreadsheetUrl: meta.url,
        spreadsheetTitle: meta.title,
        sheetName: 'Work_Orders'
      });

      setVerifyNotice({
        type: 'success',
        message: `Spreadsheet baru "${meta.title}" berhasil dibuat otomatis di Google Drive Anda!`
      });
    } catch (err: any) {
      alert(err?.message || 'Gagal membuat Google Spreadsheet baru.');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleTriggerSync = async (direction?: 'both' | 'export_only' | 'import_only') => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const token = getAccessToken();
      const cleanId = extractSpreadsheetId(spreadsheetInput) || googleSheetsConfig.spreadsheetId;
      
      // Execute backend sync
      const res = await fetch('/api/integrations/google-sheets/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-google-access-token': token, 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          mode: direction === 'import_only' ? 'pull' : direction === 'export_only' ? 'push' : 'both',
          spreadsheetId: cleanId,
          sheetName: selectedSheetName || destSheetName || 'Work_Orders'
        })
      });
      const data = await res.json();

      // Client sync fallback if client token is available
      if (token) {
        await syncGoogleSheetsNow(direction);
      }

      if (res.ok && data.success) {
        setSyncFeedback({
          type: 'success',
          message: data.message || 'Sinkronisasi Google Sheets berhasil dieksekusi.'
        });
        setBackendStatus('Synced');
        setLastErrorMessage('');
      } else {
        setSyncFeedback({
          type: 'error',
          message: data.message || 'Sinkronisasi backend Google Sheets mengembalikan kegagalan.'
        });
        setBackendStatus('Error');
        setLastErrorMessage(data.message || 'Sync failed');
      }
    } catch (err: any) {
      setSyncFeedback({ type: 'error', message: err?.message || 'Terjadi kesalahan sinkronisasi.' });
      setBackendStatus('Error');
    } finally {
      setIsSyncing(false);
    }
  };

  const activeTicketsCount = tickets.filter(t => !t.isArchived).length;
  const isConnected = Boolean(googleUser && getAccessToken() && googleSheetsConfig.spreadsheetId);

  // Strict RBAC Guard: Super Admin only
  if (currentUser.role !== 'super_admin') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/60 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Akses Ditolak (403 Forbidden)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Hanya Super Admin yang berwenang mengelola Spreadsheet ID, autentikasi Google, mapping kolom, dan menjalankan sinkronisasi data operasional MoraJaws.
        </p>
      </div>
    );
  }

  const getExplicitStatus = () => {
    if (isSyncing || googleSheetsConfig.lastSyncStatus === 'syncing') {
      return { text: 'Sinkronisasi berlangsung', color: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border-indigo-300' };
    }
    if (authError || (googleSheetsConfig.lastSyncStatus === 'error' && (googleSheetsConfig.lastSyncMessage || '').toLowerCase().includes('kredensial'))) {
      return { text: 'Kredensial tidak valid', color: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300' };
    }
    if (googleSheetsConfig.lastSyncStatus === 'error') {
      return { text: 'Gagal', color: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300' };
    }
    if (googleSheetsConfig.lastSyncStatus === 'success') {
      return { text: 'Berhasil', color: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300' };
    }
    if (isConnected) {
      return { text: 'Terhubung', color: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300' };
    }
    return { text: 'Belum dikonfigurasi', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300' };
  };

  const statusObj = getExplicitStatus();

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Konfigurasi Sinkronisasi Otomatis Google Sheets
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border ${statusObj.color}`}>
                  Status: {statusObj.text}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Hubungkan Google Spreadsheet untuk sinkronisasi Work Order dua arah, pembaruan status lapangan teknisi secara live, dan pendaftaran otomatis kategori kontraktor baru.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {googleSheetsConfig.spreadsheetUrl && (
              <a
                href={googleSheetsConfig.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <span>Buka di Google Sheets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              onClick={() => handleTriggerSync(googleSheetsConfig.syncDirection)}
              disabled={isSyncing || !isConnected}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sync Status Banner if available */}
      {googleSheetsConfig.lastSyncAt && (
        <div className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
          googleSheetsConfig.lastSyncStatus === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : googleSheetsConfig.lastSyncStatus === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {googleSheetsConfig.lastSyncStatus === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : googleSheetsConfig.lastSyncStatus === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
            )}
            <div>
              <span className="font-semibold">
                Status Terakhir ({new Date(googleSheetsConfig.lastSyncAt).toLocaleString('id-ID')}):
              </span>
              <span className="ml-1.5">{googleSheetsConfig.lastSyncMessage || 'Sinkronisasi selesai.'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
            <span>Ditarik: <strong>{googleSheetsConfig.lastPulledCount || 0}</strong></span>
            <span>Tersimpan: <strong>{googleSheetsConfig.lastPushedCount || 0}</strong></span>
          </div>
        </div>
      )}

      {syncFeedback && (
        <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
          syncFeedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
        }`}>
          {syncFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{syncFeedback.message}</span>
        </div>
      )}

      {/* Grid: 2 Columns for Setup & Configurations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: GOOGLE AUTHENTICATION & SPREADSHEET TARGET */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              1. Autentikasi Google Workspace & Spreadsheet Target
            </h3>
          </div>

          {/* Google Auth Status */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
            {googleUser ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {googleUser.photoURL ? (
                      <img
                        src={googleUser.photoURL}
                        alt={googleUser.displayName || 'Google User'}
                        className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                        {(googleUser.displayName || googleUser.email || 'R')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">
                          {googleUser.displayName || currentUser.name || 'Super Admin'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          Boolean(getAccessToken())
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}>
                          {Boolean(getAccessToken()) ? 'Token Google Aktif' : 'Akun Terhubung'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                        {googleUser.email || currentUser.email || 'tarnocepak@gmail.com'}
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>
                          {Boolean(getAccessToken())
                            ? 'Terhubung dengan izin Google Sheets & Drive (Sesi Aktif)'
                            : `Akun Google ${googleUser.email || currentUser.email || 'tarnocepak@gmail.com'} siap sinkronisasi`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoginGoogle}
                      disabled={isAuthLoading}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      title="Otorisasi atau Refresh Token Google"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isAuthLoading ? 'animate-spin' : ''}`} />
                      <span>{isAuthLoading ? 'Menghubungkan...' : Boolean(getAccessToken()) ? 'Refresh Token' : 'Otorisasi Token Sekarang'}</span>
                    </button>

                    <a
                      href={getDirectGoogleOAuthUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center gap-1"
                      title="Buka otorisasi akun Google di tab baru jika browser memblokir pop-up"
                    >
                      <span>Tab Baru</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      type="button"
                      onClick={handleLogoutGoogle}
                      className="px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded border border-rose-200 dark:border-rose-900 flex items-center gap-1 transition-colors"
                      title="Putuskan Hubungan Akun Google"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>

                {!Boolean(getAccessToken()) && (
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Akun <strong>{googleUser.email || currentUser.email || 'tarnocepak@gmail.com'}</strong> telah terpasang. Klik tombol <strong>"Otorisasi Token Sekarang"</strong> atau <strong>"Tab Baru"</strong> untuk mengaktifkan sesi token Google Sheets & Drive Anda.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Akun Google Belum Terhubung
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Login dengan akun Google untuk memberikan izin bagi aplikasi membaca dan memperbarui data Work Order di Google Spreadsheet Anda.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Google Sign-in Official Styled Button */}
                  <button
                    type="button"
                    onClick={handleLoginGoogle}
                    disabled={isAuthLoading}
                    className="inline-flex items-center gap-3 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    <span>{isAuthLoading ? 'Menghubungkan...' : 'Sign in with Google'}</span>
                  </button>

                  {/* Direct New Tab Authorization Link (Never blocked by browser popup blockers) */}
                  <a
                    href={getDirectGoogleOAuthUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center gap-1.5"
                    title="Buka otorisasi akun Google di tab baru jika pop-up diblokir"
                  >
                    <span>Otorisasi di Tab Baru</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={handleLoginFirebasePopup}
                    disabled={isAuthLoading}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                    title="Metode alternatif via Firebase Auth popup"
                  >
                    Metode Firebase
                  </button>
                </div>

                {authError && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{authError}</p>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                          Browser Anda mungkin memblokir jendela pop-up otorisasi dari iframe preview ini.
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 bg-white/70 dark:bg-slate-900/60 rounded-lg border border-amber-200/60 dark:border-amber-800/60 text-[11px] space-y-1.5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">Cara Mengatasi Kendala Otorisasi / Peringatan Google:</div>
                      <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300">
                        <li>
                          <strong>Layar "Aplikasi Belum Diverifikasi" (Unverified App):</strong> Jika muncul jendela peringatan Google, klik tombol kecil <strong>Lanjutan (Advanced)</strong> di bagian bawah, lalu klik <strong>"Buka ais-dev-fnmr3ddyueam3vjh3uk2fu-428760654483.asia-northeast1.run.app (tidak aman)"</strong> untuk melanjutkan.
                        </li>
                        <li>
                          <strong>Layar "Akses Diblokir / Belum Menyelesaikan Verifikasi":</strong> Buka <a href="https://console.cloud.google.com/apis/credentials/consent?project=clever-gearing-s5wls" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline font-semibold">Google Cloud Console (clever-gearing-s5wls)</a> &gt; <em>OAuth consent screen</em> &gt; bagian <em>Test users</em> &gt; klik <em>+ ADD USERS</em> &gt; tambahkan email Anda (<strong>nurhestafauladhea@gmail.com</strong>).
                        </li>
                        <li>
                          <strong>Solusi Instan Tanpa Verifikasi:</strong> Gunakan opsi <strong>"Opsi Pengembang: Masukkan OAuth Access Token Manual"</strong> di bawah untuk menempelkan access token langsung, atau gunakan metode Service Account backend.
                        </li>
                        <li>
                          <strong>Izinkan Pop-up:</strong> Jika pop-up tidak muncul, klik ikon pop-up di bilah alamat browser dan pilih <em>"Selalu izinkan"</em>.
                        </li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Collapsible Manual Token Input */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowManualTokenInput(prev => !prev)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition-colors"
                  >
                    <span>{showManualTokenInput ? 'Sembunyikan Opsi Token Manual' : 'Opsi Pengembang: Masukkan OAuth Access Token Manual'}</span>
                    {showManualTokenInput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {showManualTokenInput && (
                    <form onSubmit={handleApplyManualToken} className="mt-2.5 p-3 rounded-lg bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Tempelkan OAuth Bearer Access Token Google Sheets (misal dari Google OAuth Playground dengan scopes <code>spreadsheets</code> dan <code>drive.file</code>):
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="ya29.a0AfH6SMC..."
                          value={manualTokenVal}
                          onChange={e => setManualTokenVal(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono text-slate-800 dark:text-slate-200"
                        />
                        <button
                          type="submit"
                          disabled={isSubmittingManualToken || !manualTokenVal.trim()}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded text-xs transition-colors shrink-0"
                        >
                          {isSubmittingManualToken ? 'Memverifikasi...' : 'Gunakan Token'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Google Cloud Project & Auth Method Config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Google Cloud Project ID
              </label>
              <input
                type="text"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                placeholder="clever-gearing-s5wls"
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Metode Autentikasi Google
              </label>
              <select
                value={authMethod}
                onChange={e => setAuthMethod(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
              >
                <option value="oauth_token">Google OAuth 2.0 Access Token</option>
                <option value="service_account">Google Service Account (Backend)</option>
                <option value="api_key">Google Sheets REST API Key</option>
              </select>
            </div>
          </div>

          {/* Spreadsheet Target URL/ID */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                URL atau ID Google Spreadsheet Target <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleCreateNewSpreadsheet}
                disabled={isCreatingSheet || !googleUser}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreatingSheet ? 'Membuat Spreadsheet...' : 'Buat Spreadsheet Otomatis (1-Click)'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit atau ID Spreadsheet"
                value={spreadsheetInput}
                onChange={e => setSpreadsheetInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isVerifying || !spreadsheetInput.trim()}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  title="Test Connection ke Google Sheets REST API backend"
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                  <span>{isVerifying ? 'Testing...' : 'Test Connection'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRefreshStatus}
                  disabled={isRefreshingStatus}
                  className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 flex items-center gap-1 transition-colors"
                  title="Refresh Status Backend"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {/* Latency & Backend Status Metrics */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                Backend Status: <strong className="text-slate-900 dark:text-slate-200">{backendStatus}</strong>
              </span>
              {latencyMs !== null && (
                <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono font-semibold">
                  Latency: {latencyMs} ms
                </span>
              )}
              {detectedHeaders.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono">
                  {detectedHeaders.length} Kolom Dikenali
                </span>
              )}
            </div>

            {lastErrorMessage && (
              <div className="p-2.5 rounded-lg text-xs bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 flex items-start gap-2 border border-rose-200 dark:border-rose-900">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="overflow-hidden">
                  <div className="font-semibold">Catatan Diagnostik Backend:</div>
                  <div className="text-[11px] font-mono break-all">{lastErrorMessage}</div>
                </div>
              </div>
            )}

            {verifyNotice && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                verifyNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
              }`}>
                {verifyNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{verifyNotice.message}</span>
              </div>
            )}

            {spreadsheetTitle && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Judul Dokumen: <strong className="text-slate-800 dark:text-slate-200">{spreadsheetTitle}</strong>
              </div>
            )}
          </div>

          {/* Sheet Tab Name Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Nama Tab (Worksheet) <span className="text-rose-500">*</span>
              </label>
              {availableSheets.length > 1 ? (
                <select
                  value={selectedSheetName}
                  onChange={e => {
                    setSelectedSheetName(e.target.value);
                    setDestSheetName(e.target.value);
                    updateGoogleSheetsConfig({ sheetName: e.target.value });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
                >
                  {availableSheets.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedSheetName}
                  onChange={e => {
                    setSelectedSheetName(e.target.value);
                    setDestSheetName(e.target.value);
                    updateGoogleSheetsConfig({ sheetName: e.target.value });
                  }}
                  placeholder="Contoh: Work_Orders"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Data Aktif di MoraJaws
              </label>
              <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {activeTicketsCount} Tiket Aktif / {contractors.length} Mitra
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: AUTO-SYNC SETTINGS & SCHEDULE */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Sliders className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              2. Parameter Sinkronisasi Otomatis
            </h3>
          </div>

          {/* Master Enable Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <span className="font-bold text-slate-900 dark:text-white text-xs block">
                Aktifkan Auto-Sync Berkala
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Sistem akan menyinkronkan data di latar belakang sesuai interval yang dipilih.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={googleSheetsConfig.enabled}
                onChange={e => updateGoogleSheetsConfig({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Interval & Direction Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Interval Sinkronisasi</span>
              </label>
              <select
                value={googleSheetsConfig.syncInterval}
                onChange={e => updateGoogleSheetsConfig({ syncInterval: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value={1}>Setiap 1 Menit (Testing / Fast)</option>
                <option value={5}>Setiap 5 Menit</option>
                <option value={10}>Setiap 10 Menit (Direkomendasikan)</option>
                <option value={15}>Setiap 15 Menit</option>
                <option value={30}>Setiap 30 Menit</option>
                <option value={60}>Setiap 1 Jam</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Arah Sinkronisasi
              </label>
              <select
                value={googleSheetsConfig.syncDirection}
                onChange={e => updateGoogleSheetsConfig({ syncDirection: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="both">🔁 Dua Arah (Pull & Push)</option>
                <option value="import_only">⬇️ Tarik Saja (Import dari Sheet)</option>
                <option value="export_only">⬆️ Dorong Saja (Export ke Sheet)</option>
              </select>
            </div>
          </div>

          {/* Additional Operational Switches */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* Auto Push on ticket status change */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={googleSheetsConfig.autoExportOnStatusChange}
                onChange={e => updateGoogleSheetsConfig({ autoExportOnStatusChange: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                  Dorong Otomatis Saat Ada Perubahan Tiket
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Perubahan status WO Agent, teknisi lapangan, dan penugasan langsung diperbarui ke baris Google Sheet.
                </span>
              </div>
            </label>

            {/* Auto Register Contractor Categories */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={googleSheetsConfig.autoRegisterContractors}
                onChange={e => updateGoogleSheetsConfig({ autoRegisterContractors: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                  Daftarkan Otomatis Kategori Kontraktor Baru dari Google Sheet
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Jika baris spreadsheet memuat mitra kontraktor baru, sistem akan otomatis mendaftarkannya ke Master Data MoraJaws.
                </span>
              </div>
            </label>
          </div>

          {/* Manual Control Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleTriggerSync('import_only')}
              disabled={isSyncing || !isConnected}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>Tarik dari Sheet (Pull)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPushConfirmModal(true)}
              disabled={isSyncing || !isConnected}
              className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5" />
              <span>Kirim ke Sheet (Push)</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerSync('both')}
              disabled={isSyncing || !isConnected}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync Lengkap (Dua Arah)</span>
            </button>
          </div>
        </div>
      </div>

      {/* CARD 3: COLUMN MAPPING & REFERENCE GUIDE */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3">
        <button
          type="button"
          onClick={() => setShowColumnsGuide(!showColumnsGuide)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-indigo-600" />
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Panduan Kolom Standar & Pemetaan Otomatis ({STANDARD_SHEET_HEADERS.length} Kolom)
              </span>
              <p className="text-[11px] text-slate-500">
                Format kolom yang digunakan untuk pertukaran data antara MoraJaws dan Google Spreadsheet.
              </p>
            </div>
          </div>
          {showColumnsGuide ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showColumnsGuide && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Sistem pencocokan cerdas MoraJaws (WOFieldMappingEngine) mendukung alias nama kolom otomatis dalam Bahasa Indonesia dan Bahasa Inggris (misal: <code>WO Number</code>, <code>No WO</code>, <code>ID Customer</code>, <code>Contactor Name</code> / <code>Kategori Kontraktor</code>).
            </p>

            <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px]">
              {STANDARD_SHEET_HEADERS.map((header, idx) => (
                <span
                  key={header}
                  className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  <span className="text-slate-400 mr-1">{idx + 1}.</span>
                  {header}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL FOR DESTRUCTIVE / OVERWRITE PUSH (Mandatory per workspace skill constitution) */}
      {showPushConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  Konfirmasi Pengiriman Data ke Google Sheet
                </h4>
                <p className="text-xs text-slate-500">Tindakan Memperbarui Data Spreadsheet</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Anda akan memperbarui baris data pada tab <strong>{selectedSheetName}</strong> di Google Spreadsheet dengan <strong>{activeTicketsCount} tiket aktif</strong> dari sistem MoraJaws.
            </p>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-semibold">Detail Tindakan:</div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                <li>Spreadsheet: <strong>{spreadsheetTitle || googleSheetsConfig.spreadsheetId}</strong></li>
                <li>Tab: <strong>{selectedSheetName}</strong></li>
                <li>Jumlah Tiket: <strong>{activeTicketsCount} baris</strong></li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPushConfirmModal(false)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowPushConfirmModal(false);
                  await handleTriggerSync('export_only');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs flex items-center gap-1.5"
              >
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                <span>Ya, Perbarui Google Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
