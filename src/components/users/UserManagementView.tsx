import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole, User as UserType } from '../../types';
import {
  Users,
  UserPlus,
  Shield,
  Wrench,
  UserCheck,
  Check,
  KeyRound,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  Lock,
  Unlock,
  Trash2,
  ShieldAlert,
  Search,
  X,
  Edit2,
  ChevronDown,
  MapPin,
  Eye,
  EyeOff,
  LogOut,
  Clock,
  Sparkles,
  Database,
  Cpu
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { SuperAdminDeleteModal } from '../common/SuperAdminDeleteModal';
import { SortableColumnHeader } from '../common/SortableColumnHeader';
import { SortState, getNextSortDirection, sortDataArray } from '../../utils/tableSorting';
import {
  adminCreateUser,
  adminResetPassword,
  adminUpdateUserStatus,
  adminRevokeSessions,
  adminUpdateUser
} from '../../services/authService';

interface SearchableAreaDropdownProps {
  value: string;
  onChange: (areaName: string) => void;
  areas: { id?: string; name: string }[];
  placeholder?: string;
  required?: boolean;
}

export const SearchableAreaDropdown: React.FC<SearchableAreaDropdownProps> = ({
  value,
  onChange,
  areas,
  placeholder = 'Pilih atau cari area...',
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAreas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter(a => String(a?.name || '').toLowerCase().includes(q));
  }, [areas, query]);

  const handleSelect = (areaName: string) => {
    onChange(areaName);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button / Display */}
      <div
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-lg text-slate-800 dark:text-slate-200 cursor-pointer flex items-center justify-between transition-colors ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
            : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className={`text-xs truncate ${value ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-400'}`}>
            {value || placeholder}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Hidden input for form required validation */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          className="opacity-0 absolute inset-0 pointer-events-none h-0 w-0"
          tabIndex={-1}
        />
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input Bar */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ketik untuk mencari area..."
              className="w-full bg-transparent border-none text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Area Options List */}
          <div className="max-h-56 overflow-y-auto p-1 text-xs divide-y divide-slate-50 dark:divide-slate-700/50">
            {filteredAreas.length === 0 ? (
              <div className="py-4 px-3 text-center text-xs text-rose-500 font-medium">
                Area tidak ditemukan
              </div>
            ) : (
              filteredAreas.map(area => {
                const isSelected = value.toLowerCase() === area.name.toLowerCase();
                return (
                  <button
                    key={area.id || area.name}
                    type="button"
                    onClick={() => handleSelect(area.name)}
                    className={`w-full px-3 py-2 text-left rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{area.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const UserManagementView: React.FC = () => {
  const {
    currentUser,
    users,
    contractors,
    coverageAreas,
    updateUser,
    refreshFirestoreData
  } = useApp();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'users_list' | 'create_user'>('users_list');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('dispatch');
  const [editContractor, setEditContractor] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Reset Password Modal State (Super Admin Exclusive)
  const [resetModalUser, setResetModalUser] = useState<UserType | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetModalError, setResetModalError] = useState<string | null>(null);

  // Universal User Registration State (Super Admin Exclusive, 6 Roles)
  const [createName, setCreateName] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createAltEmail, setCreateAltEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('dispatch');
  const [createContractor, setCreateContractor] = useState('');
  const [createArea, setCreateArea] = useState(coverageAreas[0]?.name || 'Jakarta Selatan');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 5000);
  };

  const handleOpenEdit = (user: UserType) => {
    if (user.role === 'installer') {
      toast.error('Superadmin hanya dapat mereset password akun Installer.', 'Akses Ditolak');
      return;
    }
    setEditingUser(user);
    setEditName(user.name);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditContractor(user.contractor || '');
    setEditArea(user.area || '');
    setEditPhone(user.phone || '');
    setEditEmail(user.email || '');
    setEditActive(user.active);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const trimmedName = editName.trim();
    const cleanUsername = editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    if (!trimmedName || !cleanUsername) {
      toast.error('Nama lengkap dan Username wajib diisi.', 'Validasi Gagal');
      return;
    }

    // Check duplicate name and username against other users (case-insensitive)
    const duplicateUser = users.find(
      u =>
        u.id !== editingUser.id &&
        (u.name.trim().toLowerCase() === trimmedName.toLowerCase() ||
          u.username.trim().toLowerCase() === cleanUsername)
    );

    if (duplicateUser) {
      const errMsg = 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.';
      toast.error(errMsg, 'Duplikasi Terdeteksi');
      triggerNotice('error', errMsg);
      return;
    }

    setIsUpdating(true);
    try {
      // Update in Supabase PostgreSQL
      const apiRes = await adminUpdateUser(editingUser.id, {
        name: trimmedName,
        username: cleanUsername,
        role: editRole,
        contractor: editContractor.trim() || undefined,
        area: editArea.trim() || undefined,
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
        active: editActive
      });

      // Update in AppContext / Firestore
      await updateUser(editingUser.id, {
        name: trimmedName,
        username: cleanUsername,
        role: editRole,
        contractor: editContractor.trim() || undefined,
        area: editArea.trim() || undefined,
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
        active: editActive
      });

      if (apiRes.ok || apiRes.status === 200) {
        toast.success(`Data akun ${trimmedName} berhasil diperbarui di Supabase PostgreSQL.`, 'Perubahan Tersimpan');
        triggerNotice('success', `Profil pengguna ${trimmedName} (@${cleanUsername}) berhasil diperbarui.`);
        setEditingUser(null);
        await refreshFirestoreData?.();
      } else {
        const msg = apiRes.data?.error || 'Gagal memperbarui profil pengguna.';
        toast.error(msg, 'Gagal Update');
        triggerNotice('error', msg);
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal update user', 'Error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Open Reset Password Modal
  const handleOpenResetModal = (user: UserType) => {
    setResetModalUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setResetModalError(null);
  };

  // Submit Password Reset (Argon2id / bcrypt, no plaintext, revokes sessions, logs audit)
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    setResetModalError(null);

    if (newPassword.length < 8) {
      setResetModalError('Kata sandi baru minimal harus 8 karakter.');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setResetModalError('Kata sandi baru harus mengandung kombinasi huruf dan angka.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetModalError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await adminResetPassword(resetModalUser.id, newPassword, confirmPassword);
      if (res.ok && res.data?.success) {
        toast.success(`Kata sandi akun ${resetModalUser.name} berhasil diatur ulang. Seluruh sesi aktif dibatalkan.`, 'Reset Berhasil');
        triggerNotice('success', `Kata sandi untuk ${resetModalUser.name} (@${resetModalUser.username}) berhasil diatur ulang dengan aman.`);
        setResetModalUser(null);
        setNewPassword('');
        setConfirmPassword('');
        await refreshFirestoreData?.();
      } else {
        const msg = res.data?.error || 'Gagal mengatur ulang kata sandi.';
        setResetModalError(msg);
        toast.error(msg, 'Reset Gagal');
      }
    } catch (err: any) {
      setResetModalError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsResetting(false);
    }
  };

  // Revoke All Sessions for User
  const handleRevokeSessions = async (user: UserType) => {
    if (!confirm(`Batalkan dan akhiri seluruh sesi aktif untuk pengguna "${user.name}" (@${user.username})? Pengguna harus login ulang di semua perangkat.`)) {
      return;
    }
    try {
      const res = await adminRevokeSessions(user.id);
      if (res.ok && res.data?.success) {
        toast.success(`Seluruh sesi aktif untuk ${user.name} berhasil diakhiri.`, 'Sesi Dicabut');
        triggerNotice('success', `Seluruh sesi aktif untuk pengguna ${user.name} (@${user.username}) telah dibatalkan.`);
        await refreshFirestoreData?.();
      } else {
        toast.error(res.data?.error || 'Gagal mengakhiri sesi pengguna.', 'Gagal');
      }
    } catch (err: any) {
      toast.error(err.message || 'Kesalahan jaringan.', 'Gagal');
    }
  };

  // Status Toggle (Active / Inactive / Unlocked)
  const handleToggleStatus = async (user: UserType, targetStatus?: 'active' | 'inactive' | 'unlocked') => {
    const nextStatus = targetStatus || (user.active ? 'inactive' : 'active');
    try {
      const res = await adminUpdateUserStatus(user.id, nextStatus, 'Diubah oleh Superadmin di Management User');
      if (res.ok && res.data?.success) {
        toast.success(`Status akun ${user.name} diubah menjadi "${nextStatus}".`, 'Status Diperbarui');
        triggerNotice('success', `Status akun ${user.name} berhasil diperbarui ke: ${nextStatus}`);
        await refreshFirestoreData?.();
      } else {
        toast.error(res.data?.error || 'Gagal memperbarui status akun.', 'Gagal');
      }
    } catch (err: any) {
      toast.error(err.message || 'Kesalahan jaringan.', 'Gagal');
    }
  };

  // Create User Submit (All 6 Roles)
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const cleanName = createName.trim();
    const cleanUsername = createUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cleanEmail = createEmail.trim().toLowerCase();

    if (createRole === 'installer') {
      setCreateError('Akun Installer hanya boleh dibuat oleh Leader / Korlap melalui Portal Leader.');
      return;
    }
    if (!cleanName || !cleanUsername || !cleanEmail) {
      setCreateError('Nama lengkap, username, dan email wajib diisi.');
      return;
    }
    if (createPassword.length < 8) {
      setCreateError('Kata sandi awal minimal harus 8 karakter.');
      return;
    }
    if (!/[a-zA-Z]/.test(createPassword) || !/[0-9]/.test(createPassword)) {
      setCreateError('Kata sandi harus memuat kombinasi huruf dan angka.');
      return;
    }
    if (createPassword !== createConfirmPassword) {
      setCreateError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if ((createRole === 'leader' || (createRole as string) === 'installer') && !createContractor.trim()) {
      setCreateError('Nama Kontraktor wajib diisi untuk role Leader atau Installer.');
      return;
    }

    setIsCreatingUser(true);
    try {
      const res = await adminCreateUser({
        name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        altEmail: createAltEmail.trim() || undefined,
        phone: createPhone.trim() || undefined,
        role: createRole,
        contractor: (createRole === 'leader' || (createRole as string) === 'installer') ? createContractor.trim() : undefined,
        area: (createRole === 'leader' || (createRole as string) === 'installer') ? createArea.trim() : undefined,
        password: createPassword
      });

      if (res.ok && res.data?.success) {
        toast.success(`Akun ${cleanName} (${createRole}) berhasil dibuat di Supabase PostgreSQL!`, 'Pendaftaran Sukses');
        triggerNotice('success', `Akun baru ${cleanName} (@${cleanUsername}) berhasil didaftarkan ke Supabase PostgreSQL.`);
        setCreateName('');
        setCreateUsername('');
        setCreateEmail('');
        setCreateAltEmail('');
        setCreatePhone('');
        setCreateContractor('');
        setCreatePassword('');
        setCreateConfirmPassword('');
        setActiveTab('users_list');
        await refreshFirestoreData?.();
      } else {
        const msg = res.data?.error || 'Gagal membuat akun pengguna.';
        setCreateError(msg);
        toast.error(msg, 'Pendaftaran Gagal');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  const handleSort = (colKey: string) => {
    setSortState(prev => {
      const nextDir = getNextSortDirection(prev.column, prev.direction, colKey);
      return { column: nextDir ? colKey : null, direction: nextDir };
    });
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = String(u.name || '').toLowerCase().includes(q);
        const matchesUser = String(u.username || '').toLowerCase().includes(q);
        const matchesEmail = String(u.email || '').toLowerCase().includes(q);
        const matchesContractor = String(u.contractor || '').toLowerCase().includes(q);
        const matchesArea = String(u.area || '').toLowerCase().includes(q);
        return matchesName || matchesUser || matchesEmail || matchesContractor || matchesArea;
      }
      return true;
    });
  }, [users, roleFilter, searchQuery]);

  const sortedUsers = useMemo(() => {
    return sortDataArray(filteredUsers, sortState, (u: UserType, col: string) => {
      if (col === 'name') return u.name;
      if (col === 'username') return u.username;
      if (col === 'role') return u.role;
      if (col === 'contractor') return `${u.contractor || ''} ${u.area || ''}`;
      if (col === 'phone') return u.phone || '';
      if (col === 'active') return u.active ? 1 : 0;
      if (col === 'lastLogin') return u.lastLoginAt || '';
      return (u as any)[col];
    });
  }, [filteredUsers, sortState]);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">Superadmin</span>;
      case 'dispatch':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">Dispatch</span>;
      case 'leader':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Leader</span>;
      case 'installer':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Installer</span>;
      case 'management_data':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">Management Data</span>;
      case 'it_support':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">IT Support App</span>;
      default:
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">{role}</span>;
    }
  };

  // Restrict entire view to Superadmin
  if (currentUser.role !== 'super_admin') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
        <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white text-base">
          Akses Ditolak: Khusus Superadmin
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Menu Manajemen User dan Reset Password hanya dapat diakses oleh akun dengan peran <strong>Superadmin</strong>.
        </p>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-300 font-medium">
          Akun Anda: <span className="font-bold capitalize">{currentUser.name} ({currentUser.role})</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-purple-600/30">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Management User &amp; Custom Authentication</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                Supabase PostgreSQL
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Superadmin mengelola akun staf non-Installer. Untuk akun Installer, kewenangan Superadmin dibatasi pada reset password. Pembuatan akun Installer dilakukan oleh Leader / Korlap.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('create_user')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
              activeTab === 'create_user'
                ? 'bg-purple-600 text-white shadow-purple-600/30 ring-2 ring-purple-600/20'
                : 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 hover:bg-purple-100 border border-purple-200 dark:border-purple-800'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Buat Akun Pengguna Baru</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs animate-in fade-in duration-200 ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="font-semibold">{notice.text}</span>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-medium pb-1">
        <button
          onClick={() => setActiveTab('users_list')}
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
            activeTab === 'users_list'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Daftar Pengguna ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('create_user')}
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
            activeTab === 'create_user'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Pendaftaran Akun Internal (tanpa Installer)</span>
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users_list' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Direktori Pengguna &amp; Hak Akses Role
              </h4>
              <span className="text-[11px] text-slate-400">({filteredUsers.length} akun ditampilkan)</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari nama, user, email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="ALL">Semua Role ({users.length})</option>
                <option value="super_admin">1. Superadmin</option>
                <option value="dispatch">2. Dispatch</option>
                <option value="leader">3. Leader</option>
                <option value="installer">4. Installer</option>
                <option value="management_data">5. Management Data</option>
                <option value="it_support">6. IT Support Application</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">
                    <SortableColumnHeader
                      label="Nama & Email"
                      columnKey="name"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">
                    <SortableColumnHeader
                      label="Username"
                      columnKey="username"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">
                    <SortableColumnHeader
                      label="Role"
                      columnKey="role"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">
                    <SortableColumnHeader
                      label="Kontraktor & Area"
                      columnKey="contractor"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">
                    <SortableColumnHeader
                      label="Status"
                      columnKey="active"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">Aktivitas Login</th>
                  <th className="py-2.5 px-3 text-center">Aksi Manajemen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Tidak ada pengguna yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  sortedUsers.map(u => {
                    const isLocked = u.accountStatus === 'locked' || (u.lockedUntil && new Date(u.lockedUntil) > new Date());
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {u.id === currentUser.id && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 rounded font-normal">
                                Anda
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{u.email || '-'}</div>
                          {u.passwordChangedAt && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <KeyRound className="w-2.5 h-2.5 text-amber-500" />
                              <span>Reset: {new Date(u.passwordChangedAt).toLocaleDateString('id-ID')}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                          @{u.username}
                        </td>
                        <td className="py-2.5 px-3">{getRoleBadge(u.role)}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{u.contractor || '-'}</div>
                          <div className="text-[11px] text-slate-400">{u.area || '-'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isLocked
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : u.active
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {isLocked ? 'Terkunci' : u.active ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {u.lastLoginAt ? (
                            <div>
                              <div className="text-slate-700 dark:text-slate-300 font-mono">
                                {new Date(u.lastLoginAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                              {u.lastLoginIp && (
                                <div className="text-[10px] text-slate-400 font-mono">IP: {u.lastLoginIp}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Belum login</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {/* Superadmin may only reset Installer passwords; profile/status/delete controls are hidden. */}
                            {u.role !== 'installer' && (
                              <button
                                onClick={() => handleOpenEdit(u)}
                                className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-200 dark:border-indigo-800 text-[11px] flex items-center gap-1 cursor-pointer font-medium"
                                title="Edit Profil Pengguna"
                              >
                                <Edit2 className="w-3 h-3 text-indigo-600" />
                                <span>Edit</span>
                              </button>
                            )}

                            {/* Reset Password Button */}
                            <button
                              onClick={() => handleOpenResetModal(u)}
                              className="px-2 py-1 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800 text-[11px] flex items-center gap-1 cursor-pointer font-medium"
                              title="Reset Password Akun (Superadmin Exclusive)"
                            >
                              <KeyRound className="w-3 h-3 text-amber-500" />
                              <span>Reset Password</span>
                            </button>

                            {/* Status, session and delete controls are unavailable for Installer accounts. */}
                            {u.role !== 'installer' && u.id !== currentUser.id && (
                              <>
                                {isLocked ? (
                                  <button
                                    onClick={() => handleToggleStatus(u, 'unlocked')}
                                    className="px-2 py-1 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 rounded-md border border-amber-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                                    title="Buka Kunci Akun"
                                  >
                                    <Unlock className="w-3 h-3" />
                                    <span>Buka Kunci</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggleStatus(u)}
                                    className={`px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                                      u.active
                                        ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                                        : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                                    }`}
                                    title={u.active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                                  >
                                    {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                                  </button>
                                )}

                                {/* Revoke Sessions Button */}
                                <button
                                  onClick={() => handleRevokeSessions(u)}
                                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] flex items-center gap-1 cursor-pointer"
                                  title="Akhiri Seluruh Sesi Aktif Pengguna"
                                >
                                  <LogOut className="w-3 h-3 text-rose-500" />
                                  <span>Akhiri Sesi</span>
                                </button>

                                {/* Delete User Button */}
                                <button
                                  onClick={() => setUserToDelete(u)}
                                  className="px-2 py-1 rounded-md text-[11px] font-medium border border-rose-300 dark:border-rose-900 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center gap-1 cursor-pointer"
                                  title="Hapus Akun Pengguna"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Hapus</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: UNIVERSAL CREATE USER FORM (ALL 6 ROLES) */}
      {activeTab === 'create_user' && (
        <form onSubmit={handleCreateUserSubmit} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5 text-xs max-w-3xl">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Pendaftaran Akun Internal MoraJaws
              </h4>
              <p className="text-[11px] text-slate-500">
                Superadmin hanya membuat akun staf non-Installer. Akun Installer dibuat secara eksklusif oleh Leader / Korlap melalui Portal Leader.
              </p>
            </div>
          </div>

          {createError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Lengkap <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Budi Santoso"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Username Unik <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: budi_s"
                value={createUsername}
                onChange={e => setCreateUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Email Pengguna <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="budi@morajaws.net"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Email Pemulihan / Alt (Opsional)
              </label>
              <input
                type="email"
                placeholder="budi.personal@gmail.com"
                value={createAltEmail}
                onChange={e => setCreateAltEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nomor Telepon / WhatsApp
              </label>
              <input
                type="text"
                placeholder="0812xxxxxxxx"
                value={createPhone}
                onChange={e => setCreatePhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Role Akses MoraJaws <span className="text-rose-500">*</span>
              </label>
              <select
                value={createRole}
                onChange={e => setCreateRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-semibold focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              >
                <option value="super_admin">1. Superadmin (Akses Penuh Sistem)</option>
                <option value="dispatch">2. Dispatch (Distribusi &amp; Monitoring WO)</option>
                <option value="leader">3. Leader / Korlap (Supervisor Mitra Kontraktor)</option>
                <option value="management_data">5. Management Data (Import &amp; Master Data)</option>
                <option value="it_support">6. IT Support Application (Audit Log &amp; Monitoring)</option>
              </select>
            </div>

            {/* Contractor & Area fields for leader / installer */}
            {(createRole === 'leader' || createRole === 'installer') && (
              <>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Mitra Kontraktor <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Fiber Utama Mandiri"
                    value={createContractor}
                    onChange={e => setCreateContractor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Coverage Area Kerja
                  </label>
                  <SearchableAreaDropdown
                    value={createArea}
                    onChange={setCreateArea}
                    areas={coverageAreas}
                    placeholder="Pilih atau cari area..."
                  />
                </div>
              </>
            )}

            {/* Initial Password */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Kata Sandi Awal <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCreatePassword ? 'text' : 'password'}
                  required
                  placeholder="Minimal 8 karakter (huruf + angka)"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Initial Password */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Konfirmasi Kata Sandi Awal <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCreateConfirmPassword ? 'text' : 'password'}
                  required
                  placeholder="Ketik ulang kata sandi"
                  value={createConfirmPassword}
                  onChange={e => setCreateConfirmPassword(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCreateConfirmPassword(!showCreateConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showCreateConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Password Validation Indicator */}
          {createPassword && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block">Kekuatan Kata Sandi:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className={`flex items-center gap-1.5 ${createPassword.length >= 8 ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                  {createPassword.length >= 8 ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  <span>Minimal 8 karakter</span>
                </div>
                <div className={`flex items-center gap-1.5 ${/[a-zA-Z]/.test(createPassword) && /[0-9]/.test(createPassword) ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                  {/[a-zA-Z]/.test(createPassword) && /[0-9]/.test(createPassword) ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  <span>Huruf dan angka</span>
                </div>
                <div className={`flex items-center gap-1.5 ${createPassword === createConfirmPassword && createConfirmPassword ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                  {createPassword === createConfirmPassword && createConfirmPassword ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  <span>Konfirmasi cocok</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('users_list')}
              className="px-4 py-2 border rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isCreatingUser}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2 shadow-sm shadow-purple-600/30 cursor-pointer transition-all active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isCreatingUser ? 'Mendaftarkan Akun...' : 'Daftarkan Akun Internal'}</span>
            </button>
          </div>
        </form>
      )}

      {/* RESET PASSWORD MODAL (Superadmin Exclusive) */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Reset Password Pengguna
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {resetModalUser.name} (@{resetModalUser.username})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setResetModalUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User Meta Information */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Peran Akun:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{resetModalUser.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email Akun:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{resetModalUser.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Terakhir Password Direset:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {resetModalUser.passwordChangedAt ? new Date(resetModalUser.passwordChangedAt).toLocaleString('id-ID') : 'Belum pernah diubah'}
                </span>
              </div>
            </div>

            {/* Security Warning Notice */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Reset password akan langsung <strong>mencabut seluruh sesi aktif</strong> pengguna di semua perangkat. Password lama tidak dapat digunakan kembali.
              </span>
            </div>

            {resetModalError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{resetModalError}</span>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimal 8 karakter kombinasi huruf & angka"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Konfirmasi Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Ketik ulang kata sandi baru"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Strength Checklist */}
              {newPassword && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${newPassword.length >= 8 ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                    {newPassword.length >= 8 ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Minimal 8 karakter</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${/[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword) ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                    {/[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword) ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Memuat kombinasi huruf dan angka</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${newPassword === confirmPassword && confirmPassword ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                    {newPassword === confirmPassword && confirmPassword ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Konfirmasi cocok</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 border rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{isResetting ? 'Mereset...' : 'Simpan Kata Sandi Baru'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Edit Profil Pengguna
                </h3>
                <p className="text-[11px] text-slate-500">
                  Ubah data staf dan peran hak akses di Supabase PostgreSQL.
                </p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Username Unik <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={e => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Peran / Role Pengguna
                  </label>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as UserRole)}
                    disabled={editingUser.id === currentUser.id}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-semibold"
                  >
                    <option value="super_admin">1. Superadmin</option>
                    <option value="dispatch">2. Dispatch</option>
                    <option value="leader">3. Leader</option>
                    <option value="management_data">5. Management Data</option>
                    <option value="it_support">6. IT Support Application</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Mitra Kontraktor
                  </label>
                  <input
                    type="text"
                    value={editContractor}
                    onChange={e => setEditContractor(e.target.value)}
                    placeholder="Nama vendor kontraktor"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Coverage Area
                  </label>
                  <SearchableAreaDropdown
                    value={editArea}
                    onChange={setEditArea}
                    areas={coverageAreas}
                    placeholder="Pilih atau cari area..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Nomor WhatsApp / Kontak
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Email Pengguna
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Status Akun Aktif</span>
                    <p className="text-[10.5px] text-slate-500">
                      Jika dinonaktifkan, seluruh sesi login akan dibatalkan dan pengguna tidak dapat login kembali.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={e => setEditActive(e.target.checked)}
                      disabled={editingUser.id === currentUser.id}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>{isUpdating ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <SuperAdminDeleteModal
          isOpen={Boolean(userToDelete)}
          onClose={() => setUserToDelete(null)}
          targetType="user"
          targetId={userToDelete.id}
          targetLabel={`${userToDelete.name} (@${userToDelete.username})`}
          targetDetails={[
            { label: 'Role', value: userToDelete.role },
            { label: 'Kontraktor', value: userToDelete.contractor || '-' },
            { label: 'Telepon', value: userToDelete.phone || '-' },
            { label: 'Status Saat Ini', value: userToDelete.active ? 'Aktif' : 'Nonaktif' }
          ]}
          onSuccess={() => {
            triggerNotice('success', `Akun pengguna ${userToDelete.name} berhasil dihapus/diarsipkan.`);
            setUserToDelete(null);
          }}
        />
      )}
    </div>
  );
};
