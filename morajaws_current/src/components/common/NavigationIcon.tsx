import React from 'react';
import {
  LayoutDashboard,
  Ticket,
  BarChart3,
  FileSpreadsheet,
  MessageSquare,
  Calendar,
  Users,
  Users2,
  Building2,
  Wrench,
  Zap,
  KeyRound,
  ListFilter,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Sliders,
  History,
  Activity,
  MessageSquareQuote,
  GitBranch,
  FolderTree,
  Layers,
  Settings,
  Cpu,
  PhoneCall,
  FileText,
  CheckCircle,
  Briefcase,
  Radio,
  MapPin,
  Folder,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
  HelpCircle
} from 'lucide-react';

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Ticket,
  BarChart3,
  FileSpreadsheet,
  MessageSquare,
  Calendar,
  Users,
  Users2,
  Building2,
  Wrench,
  Zap,
  KeyRound,
  ListFilter,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Sliders,
  History,
  Activity,
  MessageSquareQuote,
  GitBranch,
  FolderTree,
  Layers,
  Settings,
  Cpu,
  PhoneCall,
  FileText,
  CheckCircle,
  Briefcase,
  Radio,
  MapPin,
  Folder,
  Sparkles
};

export const AVAILABLE_ICON_NAMES = Object.keys(ICON_MAP);

interface NavigationIconProps {
  name?: string;
  className?: string;
  fallback?: React.ComponentType<{ className?: string }>;
}

export const NavigationIcon: React.FC<NavigationIconProps> = ({
  name,
  className = 'w-4 h-4',
  fallback: Fallback = HelpCircle
}) => {
  if (!name) return <Fallback className={className} />;
  const Comp = ICON_MAP[name];
  if (!Comp) return <Fallback className={className} />;
  return <Comp className={className} />;
};
