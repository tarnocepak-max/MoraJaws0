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
  Trash2,
  ShieldAlert,
  Search,
  X,
  Edit2,
  ChevronDown,
  MapPin
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { SuperAdminDeleteModal } from '../common/SuperAdminDeleteModal';
import { SortableColumnHeader } from '../common/SortableColumnHeader';
import { SortState, getNextSortDirection, sortDataArray } from '../../utils/tableSorting';

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
    return areas.filter(a => a.name.toLowerCase().includes(q));
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
    registerDispatchAccount,
    registerLeaderAccount,
    updateUser,
    toggleUserStatus,
    resetUserPassword
  } = useApp();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'users_list' | 'create_dispatch' | 'create_leader'>('users_list');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Dispatch Form State
  const [dispName, setDispName] = useState('');
  const [dispUsername, setDispUsername] = useState('');
  const [dispPhone, setDispPhone] = useState('');
  const [dispEmail, setDispEmail] = useState('');

  // Leader Form State
  const [leadName, setLeadName] = useState('');
  const [leadUsername, setLeadUsername] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadContractor, setLeadContractor] = useState('');
  const [leadArea, setLeadArea] = useState(coverageAreas[0]?.name || 'Jakarta Selatan');

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('installer');
  const [editContractor, setEditContractor] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4500);
  };

  const handleOpenEdit = (user: UserType) => {
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
    const res = await updateUser(editingUser.id, {
      name: trimmedName,
      username: cleanUsername,
      role: editRole,
      contractor: editContractor.trim() || undefined,
      area: editArea.trim() || undefined,
      phone: editPhone.trim() || undefined,
      email: editEmail.trim() || undefined,
      active: editActive
    });
    setIsUpdating(false);

    if (res.success) {
      toast.success(`Data akun ${trimmedName} berhasil diperbarui di Firestore.`, 'Perubahan Tersimpan');
      triggerNotice('success', `Profil pengguna ${trimmedName} berhasil diperbarui.`);
      setEditingUser(null);
    } else {
      toast.error(res.error || 'Gagal memperbarui profil pengguna.', 'Gagal Update');
      triggerNotice('error', res.error || 'Gagal memperbarui profil pengguna.');
    }
  };

  const handleCreateDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispName.trim() || !dispUsername.trim()) {
      triggerNotice('error', 'Nama lengkap dan Username wajib diisi.');
      return;
    }

    const res = registerDispatchAccount({
      name: dispName,
      username: dispUsername,
      phone: dispPhone,
      email: dispEmail
    });

    if (res.success) {
      toast.success(`Akun Dispatch ${dispName} berhasil didaftarkan!`, 'Pendaftaran Sukses');
      triggerNotice('success', `Akun Dispatch ${dispName} berhasil didaftarkan! Password default: 12345678`);
      setDispName('');
      setDispUsername('');
      setDispPhone('');
      setDispEmail('');
      setActiveTab('users_list');
    } else {
      toast.error(res.error || 'Gagal mendaftarkan akun Dispatch.', 'Pendaftaran Gagal');
      triggerNotice('error', res.error || 'Gagal mendaftarkan akun Dispatch.');
    }
  };

  const handleCreateLeader = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadUsername.trim() || !leadContractor.trim()) {
      triggerNotice('error', 'Nama lengkap, Username, dan Kontraktor wajib diisi.');
      return;
    }

    if (!leadArea) {
      triggerNotice('error', 'Silakan pilih coverage area utama untuk Leader.');
      return;
    }

    const res = registerLeaderAccount({
      name: leadName,
      username: leadUsername,
      phone: leadPhone,
      contractor: leadContractor,
      area: leadArea,
      email: leadEmail
    });

    if (res.success) {
      toast.success(`Akun Leader ${leadName} berhasil didaftarkan!`, 'Pendaftaran Sukses');
      triggerNotice('success', `Akun Leader ${leadName} berhasil didaftarkan untuk ${leadContractor}! Password default: 12345678`);
      setLeadName('');
      setLeadUsername('');
      setLeadContractor('');
      setLeadPhone('');
      setLeadEmail('');
      setActiveTab('users_list');
    } else {
      toast.error(res.error || 'Gagal mendaftarkan akun Leader.', 'Pendaftaran Gagal');
      triggerNotice('error', res.error || 'Gagal mendaftarkan akun Leader.');
    }
  };

  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  const handleSort = (colKey: string) => {
    setSortState(prev => {
      const nextDir = getNextSortDirection(prev.column, prev.direction, colKey);
      return { column: nextDir ? colKey : null, direction: nextDir };
    });
  };

  const filteredUsers = users.filter(u => {
    if (roleFilter === 'ALL') return true;
    return u.role === roleFilter;
  });

  const sortedUsers = useMemo(() => {
    return sortDataArray(filteredUsers, sortState, (u: UserType, col: string) => {
      if (col === 'name') return u.name;
      if (col === 'username') return u.username;
      if (col === 'role') return u.role;
      if (col === 'contractor') return `${u.contractor || ''} ${u.area || ''}`;
      if (col === 'phone') return u.phone || '';
      if (col === 'active') return u.active ? 1 : 0;
      return (u as any)[col];
    });
  }, [filteredUsers, sortState]);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">Super Admin</span>;
      case 'dispatch':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">Dispatch</span>;
      case 'leader':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Leader / Korlap</span>;
      case 'installer':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Installer / Teknisi</span>;
    }
  };

  if (currentUser.role !== 'super_admin') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
        <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white text-base">
          Akses Ditolak: Manajemen Akun Staf Dibatasi
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Leader tidak dapat membuat atau mengelola akun staf lain selain <strong>Installer (Teknisi)</strong>. Pembuatan akun staf umum (Dispatch, Leader, Super Admin) hanya dapat dilakukan oleh <strong>Super Admin</strong>.
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
          <div className="w-8 h-8 rounded-md bg-purple-600 text-white flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Manajemen Akun & Role RBAC (MoraJaws)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Super Admin berwenang mengelola, mengedit, dan menghapus akun pengguna dari Firestore dengan validasi nama dan username unik.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('create_dispatch')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'create_dispatch'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 hover:bg-indigo-100'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Akun Dispatch</span>
          </button>

          <button
            onClick={() => setActiveTab('create_leader')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'create_leader'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>+ Akun Leader (Korlap)</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
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
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'users_list'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Daftar Seluruh Pengguna ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('create_dispatch')}
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'create_dispatch'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Form Pendaftaran Dispatch</span>
        </button>

        <button
          onClick={() => setActiveTab('create_leader')}
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'create_leader'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Form Pendaftaran Leader / Korlap</span>
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users_list' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs">
              Daftar Akun Pengguna Aktif & Akses Role
            </h4>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Filter Role:</span>
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="ALL">Semua Role ({users.length})</option>
                <option value="super_admin">Super Admin</option>
                <option value="dispatch">Dispatch</option>
                <option value="leader">Leader / Korlap</option>
                <option value="installer">Installer / Teknisi</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">
                    <SortableColumnHeader
                      label="Nama Pengguna"
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
                      label="Kontak"
                      columnKey="phone"
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
                  <th className="py-2.5 px-3 text-center">Aksi Manajemen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{u.name}</span>
                        {u.id === currentUser.id && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 rounded font-normal">
                            Anda
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{u.email || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                      @{u.username}
                    </td>
                    <td className="py-2.5 px-3">{getRoleBadge(u.role)}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{u.contractor || '-'}</div>
                      <div className="text-[11px] text-slate-400">{u.area || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {u.phone || '-'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {u.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Edit User Button */}
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800 text-[11px] flex items-center gap-1 cursor-pointer font-medium"
                          title="Edit Data Pengguna di Firestore"
                        >
                          <Edit2 className="w-3 h-3 text-indigo-600" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => {
                            const res = resetUserPassword(u.id);
                            triggerNotice('success', `Password untuk ${u.name} berhasil direset ke: ${res.newPassword}`);
                          }}
                          className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 text-[11px] flex items-center gap-1 cursor-pointer"
                          title="Reset Password ke default 12345678"
                        >
                          <KeyRound className="w-3 h-3 text-amber-500" />
                          <span>Reset</span>
                        </button>

                        {u.id !== currentUser.id && (
                          <>
                            <button
                              onClick={() => toggleUserStatus(u.id)}
                              className={`px-2 py-1 rounded text-[11px] font-medium border cursor-pointer ${
                                u.active
                                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                              }`}
                            >
                              {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>

                            {currentUser.role === 'super_admin' && (
                              <button
                                onClick={() => setUserToDelete(u)}
                                className="px-2 py-1 rounded text-[11px] font-medium border border-rose-300 dark:border-rose-900 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-1 cursor-pointer"
                                title="Hapus Akun Pengguna dari Firestore (Super Admin Only)"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Hapus</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CREATE DISPATCH */}
      {activeTab === 'create_dispatch' && (
        <form onSubmit={handleCreateDispatch} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs max-w-2xl">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Pendaftaran Akun Baru: Dispatch Officer
              </h4>
              <p className="text-[11px] text-slate-500">
                Dispatch bertanggung jawab memonitor tiket, live chat dengan installer, dan menutup (close) tiket.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Lengkap Petugas <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Rina Kartika"
                value={dispName}
                onChange={e => setDispName(e.target.value)}
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
                placeholder="Contoh: dispatch_rina"
                value={dispUsername}
                onChange={e => setDispUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nomor Telepon / WhatsApp
              </label>
              <input
                type="text"
                placeholder="0812xxxxxxxx"
                value={dispPhone}
                onChange={e => setDispPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Email Petugas (Opsional)
              </label>
              <input
                type="email"
                placeholder="rina@company.com"
                value={dispEmail}
                onChange={e => setDispEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('users_list')}
              className="px-4 py-2 border rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Daftarkan Akun Dispatch</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: CREATE LEADER (WITH SEARCHABLE AREA DROPDOWN) */}
      {activeTab === 'create_leader' && (
        <form onSubmit={handleCreateLeader} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs max-w-2xl">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Pendaftaran Akun Baru: Leader / Korlap Mitra
              </h4>
              <p className="text-[11px] text-slate-500">
                Leader wajib dihubungkan ke Kontraktor dan Coverage Area resmi. Gunakan pencarian area untuk mempermudah pemilihan.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Lengkap Korlap <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Hendra Gunawan"
                value={leadName}
                onChange={e => setLeadName(e.target.value)}
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
                placeholder="Contoh: leader_hendra"
                value={leadUsername}
                onChange={e => setLeadUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Kontraktor <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                list="contractor-suggestions"
                placeholder="Ketik nama kontraktor (misal: PT Mitra Jaringan Solusi)"
                value={leadContractor}
                onChange={e => setLeadContractor(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
              <datalist id="contractor-suggestions">
                {contractors.map((c, cIdx) => (
                  <option key={`suggestion-${c.id || c.name}-${cIdx}`} value={c.name}>{c.name} ({c.code})</option>
                ))}
              </datalist>
            </div>

            {/* SEARCHABLE AREA DROPDOWN */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Coverage Area Utama <span className="text-rose-500">*</span>
              </label>
              <SearchableAreaDropdown
                value={leadArea}
                onChange={setLeadArea}
                areas={coverageAreas}
                placeholder="Ketik nama area untuk mencari..."
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Cari dan pilih area resmi yang terdaftar di sistem.
              </p>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nomor Telepon / WhatsApp
              </label>
              <input
                type="text"
                placeholder="0812xxxxxxxx"
                value={leadPhone}
                onChange={e => setLeadPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Email Korlap (Opsional)
              </label>
              <input
                type="email"
                placeholder="hendra@mitra.com"
                value={leadEmail}
                onChange={e => setLeadEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('users_list')}
              className="px-4 py-2 border rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Daftarkan Akun Leader (Korlap)</span>
            </button>
          </div>
        </form>
      )}

      {/* EDIT USER MODAL (FOR SUPER ADMIN) */}
      {editingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-xl">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Edit Akun Pengguna (Firestore)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ID: <span className="font-mono">{editingUser.id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-4 sm:p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-medium"
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
                    Role Pengguna <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as UserRole)}
                    disabled={editingUser.id === currentUser.id}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-semibold disabled:opacity-50"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="dispatch">Dispatch</option>
                    <option value="leader">Leader / Korlap</option>
                    <option value="installer">Installer / Teknisi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Kontraktor / Vendor
                  </label>
                  <input
                    type="text"
                    list="edit-contractor-list"
                    value={editContractor}
                    onChange={e => setEditContractor(e.target.value)}
                    placeholder="Nama kontraktor..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                  <datalist id="edit-contractor-list">
                    {contractors.map((c, i) => (
                      <option key={`c-${c.name}-${i}`} value={c.name} />
                    ))}
                  </datalist>
                </div>

                {/* SEARCHABLE AREA IN EDIT MODAL */}
                <div className="sm:col-span-2">
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

                <div>
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
                      Jika dinonaktifkan, sesi login pengguna akan langsung dicabut dan tidak dapat login.
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
